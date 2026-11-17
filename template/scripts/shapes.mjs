// `pnpm shapes [name…]`: builds the site in each shape of scripts/lib/shapes.mjs with Next, in a
// throwaway copy, and compares what the build prerendered with what the shape must have, exactly:
// every page, its share image, the feeds, the Markdown twins, and nothing of a section that is off.
// tests/shapes.test.ts checks the same shapes without building; this is the proof with the real build.
// Then a server of the build answers every page with 200, in its language, and everything of a section
// that is off with 404. Then the demo with an agent skill added, its text fetched from a local stand-in for GitHub (the
// fixtures in tests/fixtures/skill), and a content mistake that must stop `pnpm build` with its line.
// Each build takes about a minute; dependencies come from the pnpm store (no network).
// Every build is of the demo kept in tests/fixtures/site (content/ and public/), never of the live
// content/: it proves the template's code in each shape, so it passes in a person's site too.
// The build's own sitemap (.next/server/app/sitemap.xml.body) must list exactly the shape's pages:
// `pnpm go-live` reads it to know which pages must answer on production.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer as netServer } from 'node:net';
import { SHAPES, applyShape, expectedBuild, expectedMissing, expectedPages } from './lib/shapes.mjs';

const root = new URL('..', import.meta.url).pathname;
const names = process.argv.slice(2).length ? process.argv.slice(2) : [...Object.keys(SHAPES), 'with-skill', 'broken'];
const skip = new Set(['node_modules', '.next', '.content', '.vercel', 'content', 'public']);
const demo = join(root, 'tests/fixtures/site');
/** Runs a command to its end (asynchronously, so the stand-in server below keeps answering). */
const run = (cmd, args, cwd, env = {}) => new Promise((resolve) => {
  const child = spawn(cmd, args, { cwd, env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', ...env } });
  let stdout = '', stderr = '';
  child.stdout.on('data', (d) => (stdout += d));
  child.stderr.on('data', (d) => (stderr += d));
  child.on('close', (status) => resolve({ status, stdout, stderr }));
});

/** A throwaway copy of the template, its content/ and public/ the demo of tests/fixtures/site. */
function copy(name) {
  const dir = mkdtempSync(join(tmpdir(), `shape-${name}-`));
  cpSync(root, dir, { recursive: true, filter: (src) => !skip.has(src.slice(root.length).split('/')[0]) });
  cpSync(join(demo, 'content'), join(dir, 'content'), { recursive: true });
  cpSync(join(demo, 'public'), join(dir, 'public'), { recursive: true });
  return dir;
}

/** The pages the build's sitemap lists, as paths: what `pnpm go-live` asks production for. */
const sitemapPaths = (dir) =>
  [...readFileSync(join(dir, '.next/server/app/sitemap.xml.body'), 'utf8').matchAll(/<loc>https:\/\/[^/<]+([^<]*)<\/loc>/g)].map((m) => m[1] || '/').sort();
const install = (dir) => run('pnpm', ['install', '--frozen-lockfile', '--offline'], dir);
/** `pnpm build`; an agent's first build may stop once on Next's upgrade notice (SecurityFatalError), so once more then. */
async function build(dir, env) {
  let out = await run('pnpm', ['build'], dir, env);
  if (out.status !== 0 && /SecurityFatalError/.test(out.stdout + out.stderr)) out = await run('pnpm', ['build'], dir, env);
  return out;
}
const freePort = () => new Promise((resolve) => { const srv = netServer().listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)); }); });

/** Starts `next start` on the build, asks it for the pages and the missing addresses, stops it. Returns the problems. */
async function serve(dir, name) {
  // SHAPES_PORT fixes the port (one shape is served at a time); otherwise any free one.
  const port = process.env.SHAPES_PORT ? Number(process.env.SHAPES_PORT) : await freePort();
  const server = spawn('pnpm', ['exec', 'next', 'start', '-p', String(port)], { cwd: dir, detached: true, stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) { try { await fetch(base); break; } catch { await new Promise((r) => setTimeout(r, 200)); } }
  const problems = [];
  const languages = SHAPES[name].languages ?? ['en', 'ka'];
  const langOf = (path) => (languages[1] && (path === `/${languages[1]}` || path.startsWith(`/${languages[1]}/`)) ? languages[1] : languages[0]);
  try {
    for (const path of expectedPages(name)) {
      const res = await fetch(base + path);
      const lang = (await res.text()).match(/<html[^>]*\slang="([^"]+)"/)?.[1];
      if (res.status !== 200 || lang !== langOf(path)) problems.push(`${path} answered ${res.status} lang=${lang}`);
    }
    for (const path of expectedMissing(name)) {
      const res = await fetch(base + path);
      if (res.status !== 404) problems.push(`${path} answered ${res.status}, not 404`);
    }
  } finally {
    process.kill(-server.pid);
  }
  return problems;
}

/** Compares a build's prerendered routes with the expected ones; prints one line. */
function compare(dir, label, want) {
  const routes = Object.keys(JSON.parse(readFileSync(join(dir, '.next/prerender-manifest.json'), 'utf8')).routes).sort();
  const missing = want.filter((r) => !routes.includes(r));
  const extra = routes.filter((r) => !want.includes(r));
  if (missing.length || extra.length) {
    console.log(`✗ ${label}: ${missing.length ? `missing ${missing.join(' ')}` : ''}${extra.length ? ` unexpected ${extra.join(' ')}` : ''}`);
    return false;
  }
  console.log(`✓ ${label}: ${routes.length} routes prerendered, exactly the expected ones`);
  return true;
}

let failed = 0;
for (const name of names.filter((n) => SHAPES[n])) {
  const dir = copy(name);
  applyShape(dir, name);
  const installed = await install(dir);
  if (installed.status !== 0) { console.log(`✗ ${name}: pnpm install failed\n${installed.stdout}${installed.stderr}`); failed++; continue; }
  const built = await build(dir);
  if (built.status !== 0) { console.log(`✗ ${name}: the build failed\n${(built.stdout + built.stderr).slice(-3000)}`); failed++; continue; }
  if (!compare(dir, `${name} (${SHAPES[name].note})`, expectedBuild(name))) failed++;
  const listed = sitemapPaths(dir);
  if (JSON.stringify(listed) !== JSON.stringify([...expectedPages(name)].sort())) { failed++; console.log(`✗ ${name}: the build's sitemap lists ${listed.join(' ')}`); }
  const problems = await serve(dir, name);
  if (problems.length) { failed++; console.log(`✗ ${name}: served: ${problems.join('; ')}`); }
  else console.log(`✓ ${name}: served: ${expectedPages(name).length} pages answer 200 in their language${expectedMissing(name).length ? `, ${expectedMissing(name).length} addresses of the section that is off answer 404` : ''}`);
  rmSync(dir, { recursive: true, force: true });
}

if (!process.argv.slice(2).length || names.includes('with-skill')) {
  // raw.githubusercontent.com/<repo>/<ref>/<path>, served from the fixtures.
  const fixtures = join(root, 'tests/fixtures/skill');
  const files = { 'docs/fixture.md': 'en.md', 'docs/fixture.ka.md': 'ka.md', 'skills/fixture/SKILL.md': 'SKILL.md', 'CHANGELOG.md': 'CHANGELOG.md' };
  const server = createServer((req, res) => {
    const path = (req.url ?? '').replace(/^\/example\/fixture\/v0\.2\.0\//, '');
    const file = files[path];
    if (!file) return res.writeHead(404).end();
    res.writeHead(200).end(readFileSync(join(fixtures, file)));
  });
  await new Promise((r) => server.listen(process.env.SHAPES_PORT ? Number(process.env.SHAPES_PORT) + 1 : 0, '127.0.0.1', r));
  const dir = copy('with-skill');
  cpSync(join(root, 'tests/fixtures/skill-project.json'), join(dir, 'content/projects/fixture.json'));
  await install(dir);
  // `pnpm build` fetches with --use-env-proxy: the stand-in is reached directly, never through a proxy.
  const built = await build(dir, { SKILLS_RAW_BASE: `http://127.0.0.1:${server.address().port}`, NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost' });
  server.close();
  const skillRoutes = ['/projects/fixture', '/projects/fixture/share.png', '/ka/projects/fixture', '/ka/projects/fixture/share.png', '/md/en/fixture', '/md/ka/fixture'];
  if (built.status !== 0) { failed++; console.log(`✗ with-skill: the build failed\n${(built.stdout + built.stderr).slice(-3000)}`); }
  else if (!/skills: fixture@v0\.2\.0 fetched \(en\+ka/.test(built.stdout + built.stderr)) { failed++; console.log(`✗ with-skill: the skill was not fetched\n${(built.stdout + built.stderr).slice(0, 2000)}`); }
  else if (!compare(dir, 'with-skill (the demo and an agent skill fetched from a stand-in for GitHub)', [...expectedBuild('en+ka'), ...skillRoutes].sort())) failed++;
  rmSync(dir, { recursive: true, force: true });
}

if (!process.argv.slice(2).length || names.includes('broken')) {
  const dir = copy('broken');
  const file = join(dir, 'content/en/work.json');
  const work = JSON.parse(readFileSync(file, 'utf8'));
  delete work.lede;
  writeFileSync(file, JSON.stringify(work, null, 2));
  await install(dir);
  const out = await build(dir);
  const line = 'content/en/work.json: "lede" is missing (the sentence under the title)';
  if (out.status === 0 || !(out.stdout + out.stderr).includes(line)) { failed++; console.log(`✗ broken: the build ${out.status === 0 ? 'passed' : 'failed without the line'}\n${(out.stdout + out.stderr).slice(-2000)}`); }
  else console.log(`✓ broken: a missing field stops the build with "${line}"`);
  rmSync(dir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);

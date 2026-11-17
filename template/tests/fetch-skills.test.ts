// scripts/fetch-skills.mjs against a local stand-in for raw.githubusercontent.com: a fresh fetch,
// GitHub down with and without a previous fetch, the copy Vercel keeps in .next/cache, the site's
// languages deciding which docs are fetched, and a site with no skill needing no network.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const script = new URL('../scripts/fetch-skills.mjs', import.meta.url).pathname;

/** A 3 × 2 PNG header: all imageSize() reads. */
const png = Buffer.alloc(33);
png.write('\x89PNG\r\n\x1a\n', 0, 'latin1');
png.writeUInt32BE(3, 16);
png.writeUInt32BE(2, 20);

let server: Server;
let base = '';
let down = '';
const files: Record<string, string | Buffer> = {};

before(async () => {
  server = createServer((req, res) => {
    const body = files[req.url ?? ''];
    res.writeHead(body === undefined ? 404 : 200).end(body);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  // A port nothing listens on: "GitHub is down".
  const probe = createServer();
  await new Promise<void>((r) => probe.listen(0, '127.0.0.1', r));
  down = `http://127.0.0.1:${(probe.address() as AddressInfo).port}`;
  await new Promise((r) => probe.close(r));
  Object.assign(files, {
    '/example/demo/v1/docs/demo.md': `---\ntitle: Demo\n---\n\n![Pic](${base}/example/demo/main/docs/pic.png)\n![Elsewhere](https://example.com/x.png)\n`,
    '/example/demo/v1/skills/demo/SKILL.md': '---\nname: demo\nlicense: MIT\n---\n',
    '/example/demo/v1/CHANGELOG.md': '# Changelog\n\n## 1.0.0 - 2026-11-01\n\n- First.\n',
    '/example/demo/main/docs/pic.png': png,
  });
});
after(() => { server.close(); });

/** A project directory with its own copy of the script, the site's languages and one skill project. */
function project(ref = 'v1', languages = ['en', 'ka']) {
  const dir = mkdtempSync(join(tmpdir(), 'fetch-test-'));
  mkdirSync(join(dir, 'scripts'));
  mkdirSync(join(dir, 'content/projects'), { recursive: true });
  copyFileSync(script, join(dir, 'scripts/fetch-skills.mjs'));
  writeFileSync(join(dir, 'content/site.json'), JSON.stringify({ languages }));
  setSkill(dir, ref);
  return dir;
}
const setSkill = (dir: string, ref: string) =>
  writeFileSync(join(dir, 'content/projects/demo.json'), JSON.stringify({ kind: 'skill', repo: 'example/demo', ref }));

function run(dir: string, rawBase: string): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve) => {
    // Straight to the local server, never through a proxy.
    const { NODE_USE_ENV_PROXY, ...env } = process.env;
    const child = spawn(process.execPath, [join(dir, 'scripts/fetch-skills.mjs')], { env: { ...env, SKILLS_RAW_BASE: rawBase } });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('close', (code) => resolve({ code, out }));
  });
}

const content = (dir: string, f: string) => join(dir, '.content/skills/demo', f);

test('fetches the docs, self-hosts the repo’s images and keeps a copy in .next/cache', async () => {
  const dir = project();
  mkdirSync(content(dir, ''), { recursive: true });
  writeFileSync(content(dir, 'ka.md'), 'left over from an older ref');
  const { code, out } = await run(dir, base);
  assert.equal(code, 0, out);
  assert.match(out, /skills: demo@v1 fetched \(en, 1 image\(s\)\)/);
  assert.equal(readFileSync(content(dir, 'en.md'), 'utf8'), files['/example/demo/v1/docs/demo.md']);
  assert.ok(existsSync(content(dir, 'CHANGELOG.md')));
  assert.ok(!existsSync(content(dir, 'ka.md')), 'a doc the repo no longer has is removed');
  assert.deepEqual(JSON.parse(readFileSync(content(dir, 'images.json'), 'utf8')), {
    [`${base}/example/demo/main/docs/pic.png`]: { src: '/skills/demo/pic.png', width: 3, height: 2 },
  });
  assert.ok(existsSync(join(dir, 'public/skills/demo/pic.png')));
  assert.equal(JSON.parse(readFileSync(content(dir, 'source.json'), 'utf8')).ref, 'v1');
  assert.ok(existsSync(join(dir, '.next/cache/skills/demo/content/en.md')));
  assert.ok(existsSync(join(dir, '.next/cache/skills/demo/public/pic.png')));
});

test('GitHub down: builds from the previous fetch and says so', async () => {
  const dir = project();
  assert.equal((await run(dir, base)).code, 0);
  const before = readFileSync(content(dir, 'en.md'), 'utf8');
  const { code, out } = await run(dir, down);
  assert.equal(code, 0, out);
  assert.match(out, /skills: demo: .*building from the previous fetch, made \d{4}-/);
  assert.equal(readFileSync(content(dir, 'en.md'), 'utf8'), before);
});

test('GitHub down on a fresh checkout: restores the copy in .next/cache', async () => {
  const dir = project();
  assert.equal((await run(dir, base)).code, 0);
  rmSync(join(dir, '.content'), { recursive: true });
  rmSync(join(dir, 'public'), { recursive: true });
  const { code, out } = await run(dir, down);
  assert.equal(code, 0, out);
  assert.match(out, /building from the previous fetch/);
  assert.ok(existsSync(content(dir, 'en.md')));
  assert.ok(existsSync(join(dir, 'public/skills/demo/pic.png')));
});

test('GitHub down with an older ref on disk: warns which version the pages show', async () => {
  const dir = project();
  assert.equal((await run(dir, base)).code, 0);
  setSkill(dir, 'v2');
  const { code, out } = await run(dir, down);
  assert.equal(code, 0, out);
  assert.match(out, /\(v1, not v2 as content\/projects\/demo\.json asks\)/);
});

test('GitHub down and no previous fetch: fails and explains', async () => {
  const dir = project();
  const { code, out } = await run(dir, down);
  assert.equal(code, 1);
  assert.match(out, /could not fetch example\/demo@v1 \(fetch failed: ECONNREFUSED\), and there is no previous fetch/);
  assert.match(out, /the first build needs GitHub/);
});

test('a missing required file fails without touching the previous fetch', async () => {
  const dir = project();
  assert.equal((await run(dir, base)).code, 0);
  const saved = files['/example/demo/v1/skills/demo/SKILL.md'];
  delete files['/example/demo/v1/skills/demo/SKILL.md'];
  try {
    const { code, out } = await run(dir, base);
    assert.equal(code, 0, out);
    assert.match(out, /404 .*SKILL\.md; building from the previous fetch/);
    assert.ok(existsSync(content(dir, 'SKILL.md')));
  } finally {
    files['/example/demo/v1/skills/demo/SKILL.md'] = saved;
  }
});

test('fetches the docs of every language the site has; the main language’s are required', async () => {
  files['/example/demo/v1/docs/demo.de.md'] = '---\ntitle: Demo auf Deutsch\n---\n\nText.\n';
  files['/example/demo/v1/CHANGELOG.de.md'] = '# Änderungen\n\n## 1.0.0 - 2026-11-01\n\n- Erste.\n';
  try {
    const dir = project('v1', ['en', 'de']);
    const { code, out } = await run(dir, base);
    assert.equal(code, 0, out);
    assert.match(out, /skills: demo@v1 fetched \(en\+de, 1 image\(s\)\)/);
    assert.ok(existsSync(content(dir, 'de.md')));
    assert.ok(existsSync(content(dir, 'CHANGELOG.de.md')));
    // A site whose main language the repo has no docs in cannot show the skill.
    const ka = project('v1', ['ka', 'en']);
    const missing = await run(ka, base);
    assert.equal(missing.code, 1);
    assert.match(missing.out, /404 .*docs\/demo\.ka\.md.*no previous fetch/s);
  } finally {
    delete files['/example/demo/v1/docs/demo.de.md'];
    delete files['/example/demo/v1/CHANGELOG.de.md'];
  }
});

test('a site with no agent skill fetches nothing and needs no network', async () => {
  const dir = project();
  rmSync(join(dir, 'content/projects/demo.json'));
  writeFileSync(join(dir, 'content/projects/plain.json'), JSON.stringify({ kind: 'plain', date: '2026-01-01', link: 'https://example.com' }));
  const { code, out } = await run(dir, down);
  assert.equal(code, 0, out);
  assert.equal(out, '');
  assert.ok(!existsSync(join(dir, '.content')));
});

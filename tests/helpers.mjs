// What the tests of the skill's scripts share. Every site is scaffolded from the committed template
// (`git archive HEAD template`, unpacked into a temporary folder once per test file), never from the
// working tree of template/, which another agent may be changing. `pnpm check` runs in a scaffolded
// site with the template's installed dependencies: the site's node_modules is a symlink to
// template/node_modules, so nothing is installed per test.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, relative } from 'node:path';
import { after } from 'node:test';

export const root = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
export const script = join(root, 'skills/sitewright/scripts/scaffold.mjs');
export const SECTIONS = ['projects', 'work', 'about', 'blog'];

export const temp = mkdtempSync(join(tmpdir(), 'sitewright-test-'));
after(() => rmSync(temp, { recursive: true, force: true }));

/** The skill's version, read the way the script reads it. */
export function skillVersion() {
  const src = readFileSync(join(root, 'skills/sitewright/SKILL.md'), 'utf8');
  return src.match(/^metadata:\s*\n(?:[ \t]+.*\n)*?[ \t]+version:\s*["']?([^"'\s]+)/m)[1];
}

let archived;
/** template/ as committed at HEAD, unpacked once per test file. */
export function committedTemplate() {
  if (archived) return archived;
  const dir = join(temp, 'archive');
  mkdirSync(dir);
  const tar = spawnSync('git', ['-C', root, 'archive', '--format=tar', 'HEAD', 'template'], { maxBuffer: 1 << 30 });
  assert.equal(tar.status, 0, String(tar.stderr));
  const x = spawnSync('tar', ['-x', '-C', dir], { input: tar.stdout });
  assert.equal(x.status, 0, String(x.stderr));
  archived = join(dir, 'template');
  return archived;
}

/** The environment without the variables that steer the script, plus `extra` (undefined removes one). */
export function env(extra = {}) {
  const e = { ...process.env };
  delete e.SITEWRIGHT_TEMPLATE;
  delete e.SITEWRIGHT_REPO;
  for (const [key, value] of Object.entries(extra)) if (value === undefined) delete e[key]; else e[key] = value;
  return e;
}

let count = 0;
/**
 * Runs the scaffold. `answers` is an object (written as JSON) or the file's text. By default it uses
 * the committed template (`template: null` leaves --template out) and --no-git (`git: true` keeps git).
 */
export function scaffold(answers, { args = [], extraEnv = {}, out, template = committedTemplate(), git = false } = {}) {
  const id = ++count;
  const answersFile = join(temp, `answers-${id}.json`);
  writeFileSync(answersFile, typeof answers === 'string' ? answers : JSON.stringify(answers, null, 2));
  out ??= join(temp, `site-${id}`);
  const argv = [script, '--answers', answersFile, '--out', out, ...(template ? ['--template', template] : []), ...(git ? [] : ['--no-git']), ...args];
  const r = spawnSync(process.execPath, argv, { encoding: 'utf8', env: env(extraEnv) });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, out, answersFile };
}

/** Asserts the scaffold made the site, and returns its output. */
export function made(answers, options) {
  const r = scaffold(answers, options);
  assert.equal(r.status, 0, `the scaffold refused:\n${r.stderr}${r.stdout}`);
  assert.equal(r.stderr, '');
  return r;
}

export const read = (out, rel) => readFileSync(join(out, rel), 'utf8');
export const json = (out, rel) => JSON.parse(read(out, rel));
export const has = (out, rel) => existsSync(join(out, rel));

/**
 * Every file under `dir`, as paths relative to it; `skip` names folders (relative paths) to leave out.
 * Symbolic links are left out: the files they point at are listed where they are.
 */
export function files(dir, skip = ['node_modules', '.content', '.git']) {
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const path = join(d, e.name);
    const rel = relative(dir, path);
    if (skip.includes(rel) || skip.includes(e.name) || e.isSymbolicLink()) return [];
    return e.isDirectory() ? walk(path) : [rel];
  });
  return walk(dir);
}

/**
 * Stands in for `pnpm fetch-skills` the way the template's own tests do: each agent-skill project gets
 * the template's fixture skill text (tests/fixtures/skill) in .content/skills/<slug>/.
 */
function fakeSkillFetch(out) {
  const projects = join(out, 'content/projects');
  if (!existsSync(projects)) return;
  const fixture = join(out, 'tests/fixtures/skill');
  const languages = json(out, 'content/site.json').languages;
  for (const file of readdirSync(projects).filter((f) => f.endsWith('.json'))) {
    if (json(out, `content/projects/${file}`).kind !== 'skill') continue;
    const into = join(out, '.content/skills', basename(file, '.json'));
    cpSync(fixture, into, { recursive: true });
    for (const lang of languages) if (!existsSync(join(into, `${lang}.md`))) cpSync(join(into, 'en.md'), join(into, `${lang}.md`));
  }
}

/** `pnpm check` in a scaffolded site: the template's own script, run with its installed dependencies. */
export function check(out) {
  if (!existsSync(join(out, 'node_modules'))) symlinkSync(join(root, 'template/node_modules'), join(out, 'node_modules'), 'dir');
  fakeSkillFetch(out);
  const command = json(out, 'package.json').scripts.check;
  const r = spawnSync('sh', ['-c', command], { cwd: out, encoding: 'utf8', env: { ...process.env, PATH: `${join(out, 'node_modules/.bin')}:${process.env.PATH}` } });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** Asserts `pnpm check` passes, and returns its output. */
export function checked(out) {
  const r = check(out);
  assert.equal(r.status, 0, `pnpm check failed in ${out}:\n${r.stderr}${r.stdout}`);
  return r.stdout;
}

const PLACEHOLDER = /\[\[[^\]]+\]\]/g;
const withoutComments = (v) => (Array.isArray(v) ? v.map(withoutComments)
  : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([k]) => k !== '$comment').map(([k, x]) => [k, withoutComments(x)])) : v);

/** Placeholders per file under content/, counted the way `pnpm check` counts them, independently of the script. */
export function placeholderCounts(out) {
  const counts = {};
  for (const rel of files(join(out, 'content'))) {
    if (rel.startsWith('ui/') || /\/blog\//.test(rel)) continue;
    const text = read(out, `content/${rel}`);
    let n = rel.endsWith('.json') ? (JSON.stringify(withoutComments(JSON.parse(text))).match(PLACEHOLDER) ?? []).length : (text.match(PLACEHOLDER) ?? []).length;
    if (rel === 'site.json' && JSON.parse(text).photo === null) n += 1;
    if (n) counts[`content/${rel}`] = n;
  }
  return counts;
}

/** Every [[placeholder]] in a file, as text. */
export const placeholdersIn = (out, rel) => read(out, rel).match(PLACEHOLDER) ?? [];

/** A fictional person for the tests: not the template's demo person, not the answers.md example. */
export const person = {
  en: 'Lia Testadze',
  ka: 'ლია ტესტაძე',
  email: 'lia@testadze.example',
  domain: 'testadze.example',
};

/** Answers for a site with everything: two languages, every section, both kinds of project. */
export function fullAnswers(overrides = {}) {
  return {
    languages: ['en', 'ka'],
    sections: [...SECTIONS],
    name: { en: person.en, ka: person.ka },
    jobTitle: { en: 'Potter', ka: 'მეთუნე' },
    email: person.email,
    domain: person.domain,
    links: [
      { label: 'GitHub', url: 'https://github.com/testadze-example' },
      { label: { en: 'Shop', ka: 'მაღაზია' } },
    ],
    projects: [
      { kind: 'skill', repo: 'example/fixture', ref: 'v0.2.0' },
      { kind: 'plain', title: { en: 'Glaze notes', ka: 'მინანქრის ჩანაწერები' }, summary: { en: 'Notes on glazes, kept per firing.' }, date: '2026-04-02' },
      { kind: 'plain', title: 'Kiln log', date: '2025-08-19', link: 'https://kiln.testadze.example' },
    ],
    ...overrides,
  };
}

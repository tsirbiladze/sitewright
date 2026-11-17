// The skill's pages, held to the repository: what they name exists, and what an installer and
// tsirbiladze.com read from SKILL.md's frontmatter is there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const skill = join(root, 'skills/sitewright');
const pages = readdirSync(skill).filter((f) => f.endsWith('.md'));
const read = (file) => readFileSync(join(skill, file), 'utf8');
const template = (file) => readFileSync(join(root, 'template', file), 'utf8');

const skillMd = read('SKILL.md');
const frontmatter = skillMd.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? '';
const field = (name) => frontmatter.match(new RegExp(`^\\s*${name}:\\s*"?([^"\\n]*)"?\\s*$`, 'm'))?.[1];

test('SKILL.md’s frontmatter: the name is the folder’s, the description fits, the version is one a tag can carry', () => {
  assert.equal(field('name'), 'sitewright');
  const description = field('description');
  assert.ok(description.length >= 80 && description.length <= 1024, `${description.length} characters`);
  assert.match(description, /Use when /, 'it says when to reach for the skill');
  assert.doesNotMatch(description, /: /, 'a colon and a space would end the value in YAML');
  assert.equal(field('license'), 'MIT');
  assert.match(field('version'), /^\d+\.\d+\.\d+$/);
  assert.equal(field('homepage'), 'https://tsirbiladze.com/skills/sitewright');
});

test('the scaffold reads the same version', () => {
  const out = execFileSync(process.execPath, [join(skill, 'scripts/scaffold.mjs'), '--version'], { encoding: 'utf8' }).trim();
  assert.equal(out, field('version'));
});

test('every page the skill links to exists, and every page is reached from SKILL.md', () => {
  const linked = new Set(['SKILL.md']);
  for (const page of pages)
    for (const [, target] of read(page).matchAll(/\]\((?!https?:)([^)#\s]+)(?:#[^)]*)?\)/g)) {
      assert.ok(existsSync(join(skill, target)), `${page} links to ${target}`);
      linked.add(target);
    }
  for (const page of pages) assert.ok(linked.has(page), `${page} is linked from no page`);
});

test('each step ends on what makes it done', () => {
  const steps = skillMd.split(/\n(?=\d+\. \*\*)/).slice(1);
  assert.deepEqual(steps.map((s) => s.match(/^(\d+)\. \*\*([^.*]+)\./)?.slice(1, 3).join(' ')), ['1 Ask', '2 Scaffold', '3 Write', '4 Repository', '5 Live', '6 Domain', '7 Hand over']);
  for (const step of steps.slice(0, 6)) assert.match(step, /Done when /, step.slice(0, 20));
  // The three steps that reach other people say whose word they wait for.
  for (const step of steps.slice(3, 6)) assert.match(step, /\*The owner’s yes|\*The owner's yes/, step.slice(0, 20));
});

test('every pnpm command the pages name is one the template has', () => {
  const scripts = Object.keys(JSON.parse(template('package.json')).scripts);
  const builtIn = ['install'];
  let checked = 0;
  for (const page of pages)
    for (const [, name] of read(page).matchAll(/\bpnpm ([a-z][\w:-]*)/g)) {
      assert.ok(scripts.includes(name) || builtIn.includes(name), `${page} names pnpm ${name}`);
      checked += 1;
    }
  assert.ok(checked >= 12, `${checked} commands checked`);
});

test('the pages name the Vercel CLI at the version the template pins', () => {
  const pin = template('scripts/lib/vercel.mjs').match(/vercel@(\d+\.\d+\.\d+)/)?.[1];
  assert.ok(pin, 'the template pins a version');
  const named = pages.flatMap((page) => [...read(page).matchAll(/vercel@(\d+\.\d+\.\d+)/g)].map((m) => m[1]));
  assert.ok(named.length >= 3);
  for (const v of named) assert.equal(v, pin);
});

test('every scaffold flag the pages name is one it has', () => {
  const help = execFileSync(process.execPath, [join(skill, 'scripts/scaffold.mjs'), '--help'], { encoding: 'utf8' });
  for (const page of pages)
    for (const line of read(page).split('\n').filter((l) => /scaffold\.mjs/.test(l)))
      for (const [flag] of line.matchAll(/--[a-z][\w-]*/g)) assert.ok(help.includes(flag), `${page} names ${flag}`);
});

test('the mark the pages write is the one the commands check', () => {
  assert.match(template('scripts/lib/vercel.mjs'), /SITE_GO_LIVE/);
  const live = read('live.md');
  assert.match(live, /SITE_GO_LIVE=<domain> pnpm go-live/);
  assert.match(live, /SITE_GO_LIVE=<domain> pnpm domain\n/);
  assert.match(live, /\npnpm domain --check\n/, 'the check carries no mark: it changes nothing');
});

test('the pages hold no person: not the template’s demo, and nothing of the source site but its address', () => {
  for (const page of pages.filter((p) => p !== 'answers.md')) assert.doesNotMatch(read(page), /Nimushadze|ნიმუშაძე/, page);
  for (const page of pages) {
    const text = read(page).replaceAll('https://tsirbiladze.com/skills/sitewright', '').replaceAll('tsirbiladze/sitewright', '');
    assert.doesNotMatch(text, /Elisabed|Shabloni|ელისაბედ|Tornike|Sirbiladze|თორნიკე|სირბილაძე|tsirbiladze|logisticshub/i, page);
  }
});

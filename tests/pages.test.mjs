// The texts people read about the skill: its page on tsirbiladze.com in two languages (docs/), the
// README and the changelog, held to each other and to what the site that shows them needs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const read = (file) => readFileSync(join(root, file), 'utf8');
const en = read('docs/sitewright.md');
const ka = read('docs/sitewright.ka.md');
const readme = read('README.md');
const split = (doc) => { const m = doc.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/); return { front: Object.fromEntries(m[1].split('\n').map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1).trim()])), body: m[2] }; };
const version = read('skills/sitewright/SKILL.md').match(/^\s*version:\s*"?([\d.]+)"?\s*$/m)[1];

test('each page has what the site reads from it: title, summary, category, status, source', () => {
  for (const [name, doc] of [['en', en], ['ka', ka]]) {
    const { front, body } = split(doc);
    assert.deepEqual(Object.keys(front), ['title', 'summary', 'category', 'status', 'source'], name);
    for (const [key, value] of Object.entries(front)) assert.ok(value.length > 3, `${name}: ${key}`);
    assert.match(front.status, /^(stable|beta|experimental)$/);
    assert.equal(front.source, 'https://github.com/tsirbiladze/sitewright/blob/main/skills/sitewright/SKILL.md');
    assert.doesNotMatch(body, /^# /m, `${name}: the site writes the h1`);
    assert.match(body.trimStart(), /^## /, `${name}: the page starts with its first section`);
    assert.doesNotMatch(body, /npx skills|skills@latest/, `${name}: the site draws the install box`);
    assert.doesNotMatch(body, /\]\((?!https:\/\/)/, `${name}: every link is absolute`);
  }
  assert.equal(split(en).front.status, split(ka).front.status);
});

test('the two languages say the same thing: sections, table rows, list items, pictures, links, numbers', () => {
  const count = (doc, re) => (split(doc).body.match(re) ?? []).length;
  for (const [what, re] of [['sections', /^## /gm], ['table rows', /^\|/gm], ['list items', /^(- |\d+\. )/gm], ['pictures', /^!\[/gm], ['paragraphs', /\n\n/g]])
    assert.equal(count(ka, re), count(en, re), what);
  const links = (doc) => [...split(doc).body.matchAll(/\]\((https:\/\/[^)\s]+)\)/g)].map((m) => m[1]).sort();
  assert.deepEqual(links(ka), links(en));
  // The day of the real run is written as each language writes a date.
  const numbers = (doc) => (split(doc).body.replace(/https?:\/\/\S+/g, '').replace(/2026-11-17|2026 წლის 17 ნოემბერს/g, '').match(/\d+/g) ?? []).map(Number).sort((a, b) => a - b);
  assert.deepEqual(numbers(ka), numbers(en), 'every number of one page is on the other');
  assert.doesNotMatch(split(ka).body.replace(/`[^`]*`|\(https[^)]*\)/g, ''), /\b(the|and|with|your|you)\b/, 'no English sentence left in the Georgian page');
});

test('the pictures the pages show are in docs/, under the address the site fetches them from', () => {
  const pictures = [...en.matchAll(/!\[[^\]]+\]\((https:\/\/[^)\s]+)\)/g)].map((m) => m[1]);
  assert.ok(pictures.length >= 2);
  for (const url of pictures) {
    const m = url.match(/^https:\/\/raw\.githubusercontent\.com\/tsirbiladze\/sitewright\/main\/(docs\/[\w.-]+\.png)$/);
    assert.ok(m, url);
    assert.ok(existsSync(join(root, m[1])), m[1]);
  }
  for (const m of readme.matchAll(/!\[[^\]]+\]\(([^)\s]+)\)/g)) assert.ok(existsSync(join(root, m[1])), `README shows ${m[1]}`);
});

test('the README and the pages give the same test counts, the same day of the real run, and the same limits of what was seen', () => {
  const counts = (text) => [...text.matchAll(/\b(\d{2,4}) (?:unit )?tests?\b|(\d{2,4}) ტესტი/g)].map((m) => Number(m[1] ?? m[2])).sort((a, b) => a - b);
  assert.deepEqual(counts(split(en).body), counts(split(ka).body));
  assert.deepEqual(counts(readme), counts(split(en).body));
  for (const text of [en, readme]) assert.match(text, /2026-11-17/);
  assert.match(ka, /2026 წლის 17 ნოემბერს/);
  assert.match(readme, /npx skills@latest add tsirbiladze\/sitewright/);
});

test('the changelog’s newest entry is the skill’s version, dated, and package.json says what SKILL.md and the README say', () => {
  const [, newest, date] = read('CHANGELOG.md').match(/^## (\S+) — (\d{4}-\d{2}-\d{2})$/m);
  assert.equal(newest, version);
  assert.ok(!Number.isNaN(Date.parse(date)));
  // package.json repeats the version, so a release bumps it together with SKILL.md's.
  const pkg = JSON.parse(read('package.json'));
  const skill = (name) => read('skills/sitewright/SKILL.md').match(new RegExp(`^\\s*${name}:\\s*"?([^"\\n]*)"?\\s*$`, 'm'))[1];
  assert.equal(pkg.version, version);
  assert.equal(pkg.license, skill('license'));
  assert.equal(pkg.homepage, skill('homepage'));
  assert.ok(readme.startsWith(`# sitewright\n\n${pkg.description} `), 'the description is the README’s first sentence');
  assert.equal(pkg.repository.url, 'git+https://github.com/tsirbiladze/sitewright.git');
  assert.equal(pkg.private, true, 'the skill is installed from the repository, not from npm');
});

test('the palettes the texts name are the template’s', () => {
  const source = read('template/lib/colours.ts');
  const names = [...source.slice(source.indexOf('export const PRESETS = {'), source.indexOf('} as const')).matchAll(/^\s*(\w+): \{ field:/gm)].map((m) => m[1]);
  for (const doc of [en, ka]) assert.ok(doc.includes(names.join(', ').replace(/, (\w+)$/, ' and $1')) || doc.includes(names.join(', ').replace(/, (\w+)$/, ' და $1')), 'the palettes in the template’s order');
});

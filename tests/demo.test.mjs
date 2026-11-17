// Nothing of the template's demo person survives in a scaffolded site: not their name in any script,
// their email, their CV, their projects, their posts or their pictures. What the demo is, is read from
// the committed template's own demo content, so the test follows it when the demo changes. The
// template's tests keep their copy of the demo in tests/fixtures/, which is allowed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { committedTemplate, files, fullAnswers, made } from './helpers.mjs';

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

/** The demo person's identifying strings (`person`) and their projects' and posts' names (`items`). */
function demo() {
  const content = join(committedTemplate(), 'content');
  const site = readJson(join(content, 'site.json'));
  const person = new Set();
  for (const lang of site.languages) {
    const name = readJson(join(content, lang, 'site.json')).name;
    person.add(name);
    const [first, ...rest] = name.split(/\s+/);
    person.add(first);
    // A Latin surname is a name; the Georgian demo surname is also the common word for "template".
    if (!/[Ⴀ-ჿ]/u.test(name)) for (const part of rest) if (part.length >= 4) person.add(part);
    const cv = readJson(join(content, lang, 'about.json')).cv?.href;
    if (cv) person.add(basename(cv));
  }
  person.add(site.email);
  person.add(site.email.split('@')[0]);
  for (const link of site.links) if (/^https:/.test(link.url)) person.add(link.url);
  // Places and employers of the demo's About page.
  for (const marker of ['Kutaisi', 'ქუთაის', 'Example Studio']) person.add(marker);
  const items = new Set(readdirSync(join(content, 'projects')).map((f) => basename(f, '.json')));
  for (const lang of site.languages)
    for (const post of readdirSync(join(content, lang, 'blog'))) if (post !== 'template.md') items.add(basename(post, '.md'));
  return { person: [...person].filter((s) => s.length >= 4), items: [...items] };
}

function hits(out, markers, { within = '', skip = [] } = {}) {
  const found = [];
  for (const rel of files(join(out, within), ['node_modules', '.git', ...skip])) {
    const path = within ? `${within}/${rel}` : rel;
    const text = /\.(png|webp|jpe?g|ttf|woff2?|ico)$/.test(rel) ? '' : readFileSync(join(out, path), 'utf8');
    for (const m of markers) if (path.toLowerCase().includes(m.toLowerCase()) || text.toLowerCase().includes(m.toLowerCase())) found.push(`${path}: ${m}`);
  }
  return found;
}

const site = () => made(fullAnswers()).out;
let out;

test('the demo is what the test looks for: its name, email and CV are found in the template', () => {
  const d = demo();
  assert.ok(d.person.length >= 6, d.person.join(', '));
  assert.ok(d.items.length >= 3, d.items.join(', '));
  assert.ok(hits(committedTemplate(), d.person, { within: 'content' }).length > 0, 'the markers match the template’s demo');
});

test('no trace of the demo person anywhere outside the template’s tests: names, email, CV, places', () => {
  out = site();
  assert.deepEqual(hits(out, demo().person, { skip: ['tests'] }), []);
});

test('what is true only of the template is left behind: no TEMPLATE.md, and a README that is the site’s own', () => {
  out ??= site();
  assert.ok(existsSync(join(committedTemplate(), 'TEMPLATE.md')), 'the template has the file');
  assert.ok(!existsSync(join(out, 'TEMPLATE.md')));
  const readme = readFileSync(join(out, 'README.md'), 'utf8');
  assert.match(readme, /^# This site\n/);
  assert.doesNotMatch(readme, /the demo person|Not yet in this template|TEMPLATE\.md/);
});

test('no trace of the demo’s projects, posts or pictures in content/ and public/', () => {
  out ??= site();
  const { person, items } = demo();
  assert.deepEqual([...hits(out, [...person, ...items], { within: 'content' }), ...hits(out, [...person, ...items], { within: 'public' })], []);
});

test('the site’s own tests may name the demo: it is the fixture they read, kept under tests/ only', (t) => {
  out ??= site();
  assert.ok(existsSync(join(out, 'tests/fixtures/site/content')), 'the fixture the site’s tests run on is there');
  const found = hits(out, demo().person, { within: 'tests', skip: ['fixtures'] });
  if (found.length) t.diagnostic(`test files that assert the fixture person: ${[...new Set(found.map((f) => f.split(':')[0]))].join(', ')}`);
});

test('the template’s code names the demo’s projects only in examples, which the scaffold leaves', (t) => {
  out ??= site();
  const found = hits(out, demo().items, { skip: ['tests', 'content', 'public'] });
  if (found.length) t.diagnostic(`left as they are: ${found.join('; ')}`);
});

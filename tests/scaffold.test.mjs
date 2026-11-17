// Each shape a site can take, scaffolded from the committed template: the files it writes, the
// placeholders in the language of their file, what it prints, and the template's own `pnpm check`
// passing in the new folder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  checked, committedTemplate, fullAnswers, has, json, made, person, placeholderCounts, placeholdersIn, read, scaffold, SECTIONS, temp,
} from './helpers.mjs';

const GEORGIAN = /[Ⴀ-ჿᲐ-Ჿ]/u;

/** The output's placeholder lines agree with the files, and with `pnpm check`'s own count. */
function assertPlaceholderReport(stdout, out, checkOutput) {
  const counts = placeholderCounts(out);
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  assert.match(stdout, new RegExp(`^Placeholders: ${total} in ${Object.keys(counts).length} files`, 'm'));
  for (const [file, n] of Object.entries(counts)) assert.match(stdout, new RegExp(`^  ${file.replace(/[.]/g, '\\.')}: ${n}$`, 'm'), `${file} is listed with ${n}`);
  const listed = stdout.split('\n').filter((l) => /^ {2}content\//.test(l));
  assert.equal(listed.length, Object.keys(counts).length, 'no file is listed that has none');
  assert.match(checkOutput, new RegExp(`^${total} placeholder\\(s\\) to fill:`, 'm'), 'pnpm check counts the same placeholders');
}

test('one language: English, every section, no domain, no projects', () => {
  const { out, stdout } = made({ languages: ['en'], sections: [...SECTIONS], name: person.en, email: person.email });
  const site = json(out, 'content/site.json');
  assert.deepEqual(site.languages, ['en']);
  assert.deepEqual(site.sections, { projects: true, work: true, about: true, blog: true });
  assert.equal(site.domain, 'lia-testadze.vercel.app', 'a provisional address from the package name');
  assert.match(site.$comment, /provisional.*lia-testadze\.vercel\.app/);
  assert.equal(site.email, person.email);
  assert.deepEqual(site.links, []);
  assert.equal(site.photo, null);
  assert.equal(site.year, new Date().getFullYear());
  assert.equal(json(out, 'package.json').name, 'lia-testadze');
  assert.equal(json(out, 'content/en/site.json').name, person.en);
  assert.equal(json(out, 'content/en/site.json').jobTitle, '[[what you do, in a few words]]', 'a fact not given is a placeholder');
  assert.ok(!has(out, 'content/ka'), 'no second language');
  assert.ok(!has(out, 'content/projects'), 'no projects');
  for (const s of SECTIONS) assert.ok(has(out, `content/en/${s}.json`), `${s} is on`);
  assert.ok(has(out, 'content/ui/en.json') && has(out, 'content/ui/ka.json'), 'the interface words the template ships stay');
  assert.match(stdout, /^Languages: en \(main, at \/\)\.$/m);
  assert.match(stdout, /^Sections: home, projects, work, about, blog\.$/m);
  assert.match(stdout, /^Domain: lia-testadze\.vercel\.app, provisional/m);
  assert.match(stdout, /^Next: cd \S+ && pnpm install && pnpm check;/m);
  const c = checked(out);
  assert.match(c, /^content: lia-testadze\.vercel\.app, en \(main: en\)$/m);
  assertPlaceholderReport(stdout, out, c);
});

test('English with Georgian, a domain, and both kinds of project', () => {
  const { out, stdout } = made(fullAnswers());
  const site = json(out, 'content/site.json');
  assert.equal(site.domain, person.domain);
  assert.doesNotMatch(site.$comment, /provisional/);
  assert.equal(json(out, 'package.json').name, person.domain, 'the package is named after the domain');
  assert.deepEqual(site.links, [
    { label: 'GitHub', url: 'https://github.com/testadze-example' },
    { label: { en: 'Shop', ka: 'მაღაზია' }, url: '[[Shop URL]]' },
  ]);
  assert.equal(json(out, 'content/ka/site.json').name, person.ka);
  assert.equal(json(out, 'content/ka/site.json').jobTitle, 'მეთუნე');
  assert.deepEqual(json(out, 'content/projects/fixture.json'), { kind: 'skill', repo: 'example/fixture', ref: 'v0.2.0' });
  assert.deepEqual(json(out, 'content/projects/glaze-notes.json'), { kind: 'plain', date: '2026-04-02' });
  assert.deepEqual(json(out, 'content/projects/kiln-log.json'), { kind: 'plain', date: '2025-08-19', link: 'https://kiln.testadze.example' });
  assert.ok(!has(out, 'content/en/projects/fixture.md'), 'a skill’s text comes from its repository');
  assert.equal(read(out, 'content/en/projects/glaze-notes.md'),
    '---\ntitle: "Glaze notes"\nsummary: "Notes on glazes, kept per firing."\n---\n\n[[The project’s page: what it is, who it is for and what came of it. Parts start at a ## heading.]]\n');
  assert.match(read(out, 'content/ka/projects/glaze-notes.md'), /^title: "მინანქრის ჩანაწერები"\nsummary: "\[\[ერთი წინადადება: რა არის ეს პროექტი\]\]"$/m, 'a summary given in English only is a Georgian placeholder in Georgian');
  assert.equal(read(out, 'content/en/projects/kiln-log.md'), '---\ntitle: "Kiln log"\nsummary: "[[one sentence: what the project is]]"\n---\n', 'with a link, no page');
  // Placeholders speak the language of their file.
  for (const file of Object.keys(placeholderCounts(out))) {
    if (file === 'content/site.json') continue;
    for (const p of placeholdersIn(out, file))
      if (file.startsWith('content/ka/')) assert.match(p, GEORGIAN, `${file}: ${p} is Georgian`);
      else assert.doesNotMatch(p, GEORGIAN, `${file}: ${p} is English`);
  }
  assert.match(stdout, /^Projects: fixture \(agent skill, example\/fixture at v0\.2\.0\), glaze-notes \(plain\), kiln-log \(plain\)\.$/m);
  assert.match(stdout, /^Agent skills: the build fetches/m);
  assert.match(stdout, /&& pnpm install && pnpm fetch-skills && pnpm check;/);
  const c = checked(out);
  assert.match(c, /^content: testadze\.example, en \+ ka \(main: en\)$/m);
  assert.match(c, /^ {2}en: \/ {2}\/projects {2}\/projects\/fixture {2}\/projects\/glaze-notes {2}\/work {2}\/about {2}\/blog$/m);
  assert.match(c, /^ {2}ka: \/ka {2}\/ka\/projects {2}\/ka\/projects\/fixture {2}\/ka\/projects\/glaze-notes {2}\/ka\/work {2}\/ka\/about {2}\/ka\/blog$/m);
  assertPlaceholderReport(stdout, out, c);
});

test('Georgian as the main language, English second', () => {
  const { out, stdout } = made(fullAnswers({ languages: ['ka', 'en'], name: { ka: person.ka, en: person.en }, domain: null }));
  const site = json(out, 'content/site.json');
  assert.deepEqual(site.languages, ['ka', 'en']);
  assert.equal(site.domain, 'lia-testadze.vercel.app', 'the package name takes the Latin spelling');
  assert.equal(site.email, person.email);
  assert.deepEqual(site.links[1], { label: { ka: 'მაღაზია', en: 'Shop' }, url: '[[Shop URL]]' }, 'site.json is read by both languages: its placeholders are in Latin letters');
  // The post draft's links follow the layout: Georgian at /, English under /en/.
  assert.match(read(out, 'content/ka/blog/template.md'), /\]\(\/projects\)/);
  assert.doesNotMatch(read(out, 'content/ka/blog/template.md'), /\]\(\/ka\//);
  assert.match(read(out, 'content/en/blog/template.md'), /\]\(\/en\/projects\)/);
  assert.match(stdout, /^Languages: ka \(main, at \/\), en \(at \/en\/\)\.$/m);
  const c = checked(out);
  assert.match(c, /^content: lia-testadze\.vercel\.app, ka \+ en \(main: ka\)$/m);
  assert.match(c, /^ {2}ka: \/ {2}\/projects/m);
  assert.match(c, /^ {2}en: \/en {2}\/en\/projects/m);
  assertPlaceholderReport(stdout, out, c);
});

test('Georgian only: the package name is the name in Latin letters', () => {
  const { out } = made({ languages: ['ka'], sections: ['about'], name: person.ka });
  assert.equal(json(out, 'package.json').name, 'lia-testadze');
  assert.equal(json(out, 'content/site.json').email, '[[email]]');
  checked(out);
});

test('English with German: German gets the English interface words to translate', () => {
  const { out, stdout } = made(fullAnswers({ languages: ['en', 'de'], name: person.en, jobTitle: { en: 'Potter', de: 'Töpferin' }, links: [{ label: { en: 'Shop', de: 'Laden' }, url: 'https://shop.testadze.example' }],
    projects: [{ kind: 'skill', repo: 'example/fixture', ref: 'v0.2.0' }, { kind: 'plain', title: { en: 'Glaze notes' }, date: '2026-04-02' }] }));
  const ui = json(out, 'content/ui/de.json');
  const en = json(committedTemplate(), 'content/ui/en.json');
  assert.equal(ui.locale, 'de_DE');
  assert.equal(ui.language.name, 'Deutsch');
  assert.equal(ui.date.months[2], 'März');
  assert.deepEqual(ui.chrome, en.chrome, 'every other word is the English one, to translate');
  assert.equal(json(out, 'content/de/site.json').jobTitle, 'Töpferin');
  assert.equal(json(out, 'content/de/projects.json').title, '[[“Projects” in German]]');
  assert.equal(json(out, 'content/de/home.json').lede, '[[a paragraph about you: who you are, what you do, and for whom, in German]]');
  assert.match(read(out, 'content/de/projects/glaze-notes.md'), /^title: "\[\[the project’s name, in German\]\]"$/m);
  assert.ok(has(out, 'content/de/blog/template.md'), 'the English post draft, to translate');
  assert.match(stdout, /^Translate: content\/ui\/de\.json \(a copy of the English interface words/m);
  assert.match(stdout, /^Translate: content\/de\/blog\/template\.md/m);
  const c = checked(out);
  assert.match(c, /^content: testadze\.example, en \+ de \(main: en\)$/m);
  assertPlaceholderReport(stdout, out, c);
});

for (const off of SECTIONS)
  test(`the ${off} section off`, () => {
    const answers = fullAnswers({ sections: SECTIONS.filter((s) => s !== off) });
    if (off === 'projects') delete answers.projects;
    const { out, stdout } = made(answers);
    assert.equal(json(out, 'content/site.json').sections[off], false);
    for (const lang of ['en', 'ka']) assert.ok(!has(out, `content/${lang}/${off}.json`), `no content/${lang}/${off}.json`);
    if (off === 'blog') assert.ok(!has(out, 'content/en/blog'), 'no post draft');
    assert.match(stdout, new RegExp(`; off: ${off}\\.$`, 'm'));
    const c = checked(out);
    assert.match(c, new RegExp(`^sections on: ${SECTIONS.filter((s) => s !== off).join(', ')}$`, 'm'));
    assert.doesNotMatch(c, new RegExp(`/${off}\\b`));
    assertPlaceholderReport(stdout, out, c);
  });

test('no section at all: a home page in each language', () => {
  const { out, stdout } = made(fullAnswers({ sections: [], projects: [] }));
  assert.ok(!has(out, 'content/projects'));
  assert.match(stdout, /^Sections: home; off: projects, work, about, blog\.$/m);
  const c = checked(out);
  assert.match(c, /^sections on: none$/m);
  assert.match(c, /^ {2}en: \/$/m);
  assert.match(c, /^ {2}ka: \/ka$/m);
});

test('an agent skill as the only project', () => {
  const { out } = made({ languages: ['en'], sections: ['projects'], name: person.en, projects: [{ kind: 'skill', repo: 'example/Fixture-Skill', ref: 'main', slug: 'fixture' }] });
  assert.deepEqual(json(out, 'content/projects/fixture.json'), { kind: 'skill', repo: 'example/Fixture-Skill', ref: 'main' });
  assert.match(checked(out), /^ {2}en: \/ {2}\/projects {2}\/projects\/fixture$/m);
});

test('a plain project as the only one: without a link it gets a page to write', () => {
  const { out } = made({ languages: ['en'], sections: ['projects'], name: person.en, projects: [{ kind: 'plain', title: 'Glaze notes', date: '2026-04-02', slug: 'glazes' }] });
  assert.deepEqual(json(out, 'content/projects/glazes.json'), { kind: 'plain', date: '2026-04-02' });
  assert.match(checked(out), /^ {2}en: \/ {2}\/projects {2}\/projects\/glazes$/m);
});

test('a Georgian project title makes a Latin address', () => {
  const { out } = made({ languages: ['ka'], sections: ['projects'], name: person.ka, projects: [{ kind: 'plain', title: 'ჭიქების წიგნი', date: '2026-01-05' }] });
  assert.ok(has(out, 'content/projects/chikebis-tsigni.json'));
  checked(out);
});

test('an empty folder that exists is used', () => {
  const out = join(temp, 'empty-site');
  mkdirSync(out);
  made({ languages: ['en'], sections: [], name: person.en }, { out });
  assert.ok(has(out, 'content/site.json'));
});

test('SITEWRIGHT_TEMPLATE names a local template, like --template', () => {
  const { out, stdout } = made({ languages: ['en'], sections: [], name: person.en }, { template: null, extraEnv: { SITEWRIGHT_TEMPLATE: committedTemplate() } });
  assert.match(stdout, new RegExp(`^Made ${out} from the sitewright template \\S+ \\(${committedTemplate()}\\)\\.$`, 'm'));
});

test('a template folder’s installs and builds are not copied', () => {
  const t = join(temp, 'dirty-template');
  cpSync(committedTemplate(), t, { recursive: true });
  for (const dir of ['node_modules/x', '.next/cache', '.content/skills', 'public/skills/x']) mkdirSync(join(t, dir), { recursive: true });
  writeFileSync(join(t, '.env.local'), 'TOKEN=not-a-real-one\n');
  writeFileSync(join(t, 'tsconfig.tsbuildinfo'), '{}');
  const { out } = made({ languages: ['en'], sections: [], name: person.en }, { template: t });
  for (const rel of ['node_modules', '.next', '.content', 'public/skills', '.env.local', 'tsconfig.tsbuildinfo']) assert.ok(!has(out, rel), `${rel} is not copied`);
});

test('--help and --version', () => {
  const help = scaffold({}, { args: ['--help'] });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /^usage: node scaffold\.mjs --answers/m);
  const version = scaffold({}, { args: ['--version'] });
  assert.equal(version.status, 0);
  assert.match(version.stdout, /^\d+\.\d+\.\d+\n$/);
});

test('colours: a palette by name or the owner’s own pair goes to content/site.json; none leaves the default', () => {
  const base = { languages: ['en'], sections: [], name: person.en };
  assert.equal(json(made(base).out, 'content/site.json').colours, undefined, 'the template’s default (wine)');
  assert.equal(json(made({ ...base, colours: 'Pine' }).out, 'content/site.json').colours, 'pine');
  assert.deepEqual(json(made({ ...base, colours: { field: '#123D2E', accent: '#c42b1c' } }).out, 'content/site.json').colours, { field: '#123d2e', accent: '#c42b1c' });
});

test('the palettes the scaffold offers are the template’s own', () => {
  const source = readFileSync(join(committedTemplate(), 'lib/colours.ts'), 'utf8');
  const block = source.slice(source.indexOf('export const PRESETS = {'), source.indexOf('} as const'));
  const names = [...block.matchAll(/^\s*(\w+): \{ field:/gm)].map((m) => m[1]);
  assert.ok(names.length >= 5, names.join(', '));
  for (const name of names) assert.equal(json(made({ languages: ['en'], sections: [], name: person.en, colours: name }).out, 'content/site.json').colours, name);
  const refused = scaffold({ languages: ['en'], sections: [], name: person.en, colours: 'no-such-palette' });
  assert.match(refused.stderr + refused.stdout, new RegExp(`choose one of ${names.join(', ')},`), 'the scaffold lists the same palettes, in the template’s order');
});

test('a project whose date the owner does not remember gets a placeholder date, and the site is still valid', () => {
  const { out } = made({ languages: ['en'], sections: ['projects'], name: person.en, projects: [{ kind: 'plain', title: 'Kiln log' }] });
  assert.deepEqual(json(out, 'content/projects/kiln-log.json'), { kind: 'plain', date: '[[date]]' });
  checked(out);
});

test('About is written without a CV file: the owner adds one when they have it', () => {
  const { out } = made({ languages: ['en', 'ka'], sections: ['about'], name: { en: person.en, ka: person.ka } });
  for (const lang of ['en', 'ka']) assert.equal(json(out, `content/${lang}/about.json`).cv, undefined);
  checked(out);
});

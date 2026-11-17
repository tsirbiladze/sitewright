// Every refusal: one line naming the field or the path, the right exit code, and nothing made.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { committedTemplate, fullAnswers, has, person, scaffold, script, temp } from './helpers.mjs';

const one = { languages: ['en'], sections: ['projects'], name: person.en };

/** Answers that must be refused with exit 1 and exactly this one line (after "<answers file>: "). */
const refused = [
  ['an unknown field, with the one it was probably meant to be', { ...one, emial: person.email }, '"emial" is not a field here (did you mean "email"?)'],
  ['a field under another name', { ...one, job: 'Potter' }, '"job" is not a field here (did you mean "jobTitle"?)'],
  ['an unknown field with nothing near', { ...one, favouriteFood: 'khinkali' }, '"favouriteFood" is not a field here (the fields are languages, sections, name, jobTitle, email, domain, colours, links, projects)'],
  ['a misspelt field in a project', { ...one, projects: [{ kind: 'skill', repository: 'example/fixture', ref: 'v1' }] }, '"projects[0].repository" is not a field here (did you mean "repo"?)', { lines: 2 }],
  ['a misspelt field in a link', { ...one, links: [{ label: 'GitHub', ulr: 'https://github.com/x' }] }, '"links[0].ulr" is not a field here (did you mean "url"?)'],
  ['a third language', { ...one, languages: ['en', 'ka', 'de'] }, '"languages" lists 3 languages: a site has one main language and at most one more ("en", "ka"), so leave out "de"'],
  ['no language', { sections: [], name: person.en }, '"languages" is missing (the site’s languages, the main one first: ["en"] or ["ka", "en"])'],
  ['a language twice', { ...one, languages: ['en', 'en'] }, '"languages" lists "en" twice'],
  ['a language in Cyrillic', { ...one, languages: ['en', 'ru'], name: { en: person.en, ru: 'Lia' } }, '"languages[1]" is Russian, written in Cyrillic: the template takes Latin-script languages and Georgian ("ka")'],
  ['a language in Armenian script', { ...one, languages: ['hy'] }, '"languages[0]" is Armenian, written in Armenian: the template takes Latin-script languages and Georgian ("ka")'],
  ['a right-to-left language', { ...one, languages: ['ar'] }, '"languages[0]" is Arabic, written in Arabic: the template takes Latin-script languages and Georgian ("ka")'],
  ['a country code for a language', { ...one, languages: ['ge'] }, '"languages[0]" is "ge", the country code of Georgia; its language Georgian is "ka"'],
  ['a three-letter code where the template takes two', { ...one, languages: ['geo'] }, '"languages[0]" must be written "ka" (Georgian): two or three lower-case letters, no region'],
  ['a language with a region', { ...one, languages: ['en-US'] }, '"languages[0]" must be written "en" (English): two or three lower-case letters, no region'],
  ['a code that is no language', { ...one, languages: ['xq'] }, '"languages[0]" is "xq", which is not a language code (like "en", "ka" or "de")'],
  ['no name', { languages: ['en'], sections: [] }, '"name" is missing (the person’s name)'],
  ['a name missing in a language the site has', { ...one, languages: ['en', 'ka'], name: { en: person.en } }, '"name.ka" is missing: the site is in Georgian too, so it needs the person’s name as Georgian writes it (the same spelling in both is fine: give one string)'],
  ['a name in a language the site does not have', { ...one, name: { en: person.en, de: person.en } }, '"name.de" is not a language of this site (en)'],
  ['a name that is a placeholder', { ...one, name: '[[name]]' }, '"name" must be the person’s name itself, not a placeholder: the site cannot be made without it'],
  ['Georgian letters in an English text', { ...one, languages: ['en', 'ka'], name: { en: person.ka, ka: person.ka } }, '"name.en" has "ლ", a Georgian letter, but English pages are Latin-script: write it as English writes it'],
  ['a letter of a script the template has no font for', { ...one, jobTitle: 'Гончар' }, '"jobTitle" has "Г", a letter of a script the template has no font for: it takes Latin and Georgian letters only'],
  ['a fill-in token in a text', { ...one, jobTitle: 'Potter {price}' }, '"jobTitle" has { or }, which the site reads as a fill-in token: leave them out'],
  ['a malformed email', { ...one, email: 'lia@testadze' }, '"email" is "lia@testadze", which is not an email address like "name@example.com"'],
  ['an email written as a link', { ...one, email: `mailto:${person.email}` }, `"email" must be the address alone, without mailto: "${person.email}"`],
  ['a domain with its scheme', { ...one, domain: 'https://testadze.example/' }, '"domain" must be the bare domain, without https://: "testadze.example"'],
  ['a domain with www.', { ...one, domain: 'www.testadze.example' }, '"domain" must be the bare domain, without www.: "testadze.example" (pnpm domain adds the www name and sends it to the bare one)'],
  ['a domain in capitals', { ...one, domain: 'Testadze.Example' }, '"domain" must be lower-case: "testadze.example"'],
  ['a domain with no dot', { ...one, domain: 'testadze' }, '"domain" must be a whole domain like "example.com"'],
  ['a domain with an empty label', { ...one, domain: 'testadze..example' }, '"domain" must be a domain of letters, digits, hyphens and dots, like "example.com"'],
  ['a domain in Georgian letters', { ...one, domain: 'ტესტი.გე' }, `"domain" must be written in ASCII: "${new URL('https://ტესტი.გე').hostname}"`],
  ['a repository written as an address', { ...one, projects: [{ kind: 'skill', repo: 'https://github.com/example/fixture', ref: 'v1.0.0' }] }, '"projects[0].repo" must be "owner/name", not an address: "example/fixture"'],
  ['a repository without its owner', { ...one, projects: [{ kind: 'skill', repo: 'fixture', ref: 'v1.0.0' }] }, '"projects[0].repo" is "fixture", which is not a GitHub repository written as "owner/name"'],
  ['a repository path too deep', { ...one, projects: [{ kind: 'skill', repo: 'example/fixture/skills', ref: 'v1.0.0' }] }, '"projects[0].repo" is "example/fixture/skills", which is not a GitHub repository written as "owner/name"'],
  ['a skill without a ref', { ...one, projects: [{ kind: 'skill', repo: 'example/fixture' }] }, '"projects[0].ref" is missing (the release tag the page text is fetched from, like "v1.0.0")'],
  ['a skill whose repository name is no address', { ...one, projects: [{ kind: 'skill', repo: 'example/My_Skill', ref: 'v1.0.0' }] }, '"projects[0].slug" is missing: "My_Skill" cannot be a page address, so give the skill’s folder name under skills/ in example/My_Skill (lower-case letters, digits and hyphens)'],
  ['a project without a kind', { ...one, projects: [{ repo: 'example/fixture', ref: 'v1.0.0' }] }, '"projects[0].kind" is missing: "skill" (an agent skill whose page text comes from its GitHub repository) or "plain" (a project written in the site); this one has a "repo", so probably "skill"'],
  ['a project of an unknown kind', { ...one, projects: [{ kind: 'skil', repo: 'example/fixture', ref: 'v1.0.0' }] }, '"projects[0].kind" is "skil": it must be "skill" or "plain" (did you mean "skill"?)'],
  ['a palette that does not exist', { ...one, colours: 'ocean' }, '"colours" is "ocean", which is not a palette: choose one of wine, ink, pine, sea, walnut, slate, or give two colours of the owner’s own as { "field": "#rrggbb", "accent": "#rrggbb" }'],
  ['a colour under another name', { ...one, color: 'pine' }, '"color" is not a field here (did you mean "colours"?)'],
  ['a pair of colours with one missing', { ...one, colours: { field: '#123d2e' } }, '"colours.accent" is missing: the colour of the one button a page has, written #rrggbb'],
  ['a colour that is not a hex colour', { ...one, colours: { field: 'dark green', accent: '#c42b1c' } }, '"colours.field" is "dark green": the deep colour the name stands on, written #rrggbb'],
  ['a plain project with half a date', { ...one, projects: [{ kind: 'plain', title: 'Kiln log', date: '2025-08' }] }, '"projects[0].date" is "2025-08", which is not a date written YYYY-MM-DD'],
  ['a plain project without a title', { ...one, projects: [{ kind: 'plain', date: '2025-08-19' }] }, '"projects[0].title" is missing (the project’s name, in at least the main language)'],
  ['a plain project link over http', { ...one, projects: [{ kind: 'plain', title: 'Kiln log', date: '2025-08-19', link: 'http://kiln.testadze.example' }] }, '"projects[0].link" must start with https://: "https://kiln.testadze.example"'],
  ['two projects at one address', { ...one, projects: [{ kind: 'plain', title: 'Kiln log', date: '2025-08-19' }, { kind: 'plain', title: 'Kiln Log', date: '2025-08-20' }] }, '"projects[1].slug" is "kiln-log", the same address as projects[0]: give one of them its own "slug"'],
  ['projects with the projects section off', { ...one, sections: ['about'], projects: [{ kind: 'plain', title: 'Kiln log', date: '2025-08-19' }] }, '"projects" lists 1 project, but "sections" leaves the projects section out: add "projects" to "sections", or leave the projects out'],
  ['an unknown section', { ...one, sections: ['projects', 'contact'] }, '"sections[1]" is "contact", not a section (did you mean "work"?): the sections are projects, work, about, blog'],
  ['a misspelt section', { ...one, sections: ['blgo'] }, '"sections[0]" is "blgo", not a section (did you mean "blog"?): the sections are projects, work, about, blog'],
  ['the home as a section', { ...one, sections: ['home'] }, '"sections[0]" is "home", which is always there: list only projects, work, about, blog'],
  ['no sections', { languages: ['en'], name: person.en }, '"sections" is missing (the sections that are on: any of "projects", "work", "about", "blog"; [] for a home page only)'],
  ['a link without a label', { ...one, links: [{ url: 'https://github.com/x' }] }, '"links[0].label" is missing (the link’s name, like "GitHub")'],
];

for (const [name, answers, line, { lines = 1 } = {}] of refused)
  test(`refuses ${name}`, () => {
    const r = scaffold(answers);
    assert.equal(r.status, 1, r.stdout);
    const got = r.stderr.trim().split('\n');
    assert.equal(got.length, lines, `one line a problem:\n${r.stderr}`);
    assert.ok(got.includes(`${r.answersFile}: ${line}`), `expected:\n${r.answersFile}: ${line}\ngot:\n${r.stderr}`);
    assert.equal(r.stdout, '');
    assert.ok(!has(r.out, ''), 'nothing is made');
  });

test('refuses answers that are not JSON, with the parser’s reason', () => {
  const r = scaffold('{ "languages": ["en"], }');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^\S+answers-\d+\.json: is not valid JSON \(.+\)\n$/);
});

test('refuses every problem at once, one line each', () => {
  const r = scaffold({ languages: ['en', 'ka'], sections: ['projects'], name: { en: person.en }, email: 'nobody', domain: 'https://x.example' });
  assert.equal(r.status, 1);
  assert.equal(r.stderr.trim().split('\n').length, 3, r.stderr);
  for (const field of ['name.ka', 'email', 'domain']) assert.match(r.stderr, new RegExp(`"${field.replace('.', '\\.')}" `));
});

test('refuses a folder that exists and is not empty, and leaves it as it was', () => {
  const out = join(temp, 'taken');
  mkdirSync(out);
  writeFileSync(join(out, 'notes.txt'), 'mine\n');
  const r = scaffold(fullAnswers(), { out });
  assert.equal(r.status, 2);
  assert.equal(r.stderr, `--out ${out}: exists and is not empty: give a new folder\n`);
  assert.deepEqual(readdirSync(out), ['notes.txt']);
});

test('refuses a file where the folder should be', () => {
  const out = join(temp, 'a-file');
  writeFileSync(out, '');
  const r = scaffold(fullAnswers(), { out });
  assert.equal(r.status, 2);
  assert.equal(r.stderr, `--out ${out}: exists and is a file: give a new folder\n`);
});

test('refuses a folder inside the template', () => {
  const out = join(committedTemplate(), 'my-site');
  const r = scaffold(fullAnswers(), { out });
  assert.equal(r.status, 2);
  assert.equal(r.stderr, `--out ${out}: is inside the template folder: give a folder outside it\n`);
  assert.ok(!has(out, ''), 'nothing is made');
});

test('refuses unknown flags and missing ones, with exit 2', () => {
  const r = scaffold(fullAnswers(), { args: ['--tempalte', '/x'] });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /^--tempalte is not an option \(did you mean --template\?\)\. usage: /);
  const missing = spawnSync(process.execPath, [script, '--out', join(temp, 'x')], { encoding: 'utf8' });
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /^--answers is missing\. usage: /);
});

test('refuses an answers file that does not exist', () => {
  const r = spawnSync(process.execPath, [script, '--answers', join(temp, 'none.json'), '--out', join(temp, 'y')], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.equal(r.stderr, `--answers ${join(temp, 'none.json')}: no such file\n`);
  assert.ok(!has(join(temp, 'y'), ''));
});

test('refuses a template folder that is not the template', () => {
  const t = join(temp, 'not-a-template');
  mkdirSync(t);
  const r = scaffold(fullAnswers(), { template: t });
  assert.equal(r.status, 2);
  assert.match(r.stderr, new RegExp(`^--template ${t}: ${t}/package\\.json is missing, so this is not the sitewright template\\n$`));
  assert.ok(!has(r.out, ''), 'nothing is made');
});

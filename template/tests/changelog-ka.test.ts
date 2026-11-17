// A skill repo with a changelog in the site's second language (CHANGELOG.ka.md): the Georgian page and
// its Markdown twin show it in full, in Georgian; the English side keeps CHANGELOG.md. Without the
// file, see tests/agent-md.test.ts (released versions and a link to the English file).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { useSite, slug, siteUrl as site } from './helpers';
import type { Project } from '../lib/projects';

let skill: Project;
let md: typeof import('../lib/agent-md');

before(async () => {
  useSite({ skill: ['skill-ka-changelog'] });
  skill = (await import('../lib/projects')).getProject(slug)!;
  md = await import('../lib/agent-md');
});

test('reads CHANGELOG.ka.md when the repo has one: versions and dates as in the English file', () => {
  assert.deepEqual(skill.changelogs.ka!.map(({ version, date }) => ({ version, date })), [
    { version: '0.2.0', date: '2026-12-01' },
    { version: '0.1.1', date: '2026-11-14' },
    { version: '0.1.0', date: null },
  ]);
  assert.equal(skill.changelog[0].version, 'Unreleased', 'the English changelog is still CHANGELOG.md');
});

test('renders the Georgian entries as written: Markdown, Georgian quotes, no English curly quotes', () => {
  const entry = skill.changelogs.ka![0].html;
  assert.match(entry, /<code>inline code<\/code>-ით/);
  assert.match(entry, /<h3>გასწორდა<\/h3>/);
  assert.match(entry, /„ციტატა“/);
  assert.match(entry, /(&#39;|')ესეც(&#39;|')/, 'straight quotes stay straight: smartQuotes is for English');
  assert.doesNotMatch(entry, /[‘’”]/, 'no English curly quotes (Georgian closes with “)');
});

test('a link whose text is a URL may break after each slash, and its href is untouched', () => {
  const entry = skill.changelogs.ka![0].html;
  const url = 'https://github.com/example/fixture/releases/tag/v0.2.0';
  assert.ok(entry.includes(`<a href="${url}">https://github.com/<wbr>example/<wbr>fixture/<wbr>releases/<wbr>tag/<wbr>v0.2.0</a>`), entry);
  assert.doesNotMatch(entry, /https:\/<wbr>|\/\/<wbr>/, 'never inside the scheme’s //');
  assert.match(entry, /<a href="https:\/\/example\.com\/ka">ბმულით<\/a>/, 'a link with words is left alone');
});

test('the Georgian twin carries the Georgian changelog in full, like its page', () => {
  const out = md.projectMarkdown(skill, 'ka');
  const part = out.slice(out.indexOf('## ცვლილებები'));
  assert.ok(out.includes('## ცვლილებები'));
  assert.match(part, /^### 0\.2\.0 \(1 დეკემბერი 2026\)\n\nპირველი ხაზი `inline code`-ით და \[ბმულით\]\(https:\/\/example\.com\/ka\)\.\n\n#### გასწორდა\n\n- „ციტატა“ რჩება ისე, როგორც დაიწერა, 'ესეც' ასევე\.$/m);
  assert.match(part, /^### 0\.1\.1 \(14 ნოემბერი 2026\)\n\n- პატჩი\.$/m);
  assert.match(part, /^### 0\.1\.0\n\nპირველი ვერსია\.$/m);
  assert.ok(part.includes('- სრული აღწერა: <https://github.com/example/fixture/releases/tag/v0.2.0>'), 'the twin keeps the raw URL, no <wbr>');
  assert.ok(part.includes(`[სკილის გვერდი](${site}/ka/skills/fixture)`), 'site links become absolute');
  // The full entries replace the fallback: no version list, no pointer to the English file.
  assert.doesNotMatch(out, /ინგლისურად|CHANGELOG\.md|Changelog|Unreleased/);
  assert.equal(out.match(/^## ცვლილებები$/gm)!.length, 1);
});

test('the English twin keeps CHANGELOG.md', () => {
  const out = md.projectMarkdown(skill, 'en');
  assert.match(out, /^## Changelog\n\n### Unreleased\n\n- Nothing yet\.$/m);
  assert.doesNotMatch(out, /ცვლილებები|პატჩი|გასწორდა/);
});

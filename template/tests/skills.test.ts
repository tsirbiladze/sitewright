// The fetched-skill kind of project: the Markdown render and the changelog parser, through
// getProject() on the fixture skill (as scripts/fetch-skills.mjs would leave it).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { useSite, slug } from './helpers';
import type { Project } from '../lib/projects';

let skill: Project;
before(async () => {
  useSite({ skill: true });
  const { getProject } = await import('../lib/projects');
  skill = getProject(slug)!;
});

test('takes title, summary and the rest from the doc frontmatter', () => {
  const en = skill.docs.en!;
  assert.equal(en.title, 'The /fixture Skill');
  assert.equal(en.summary, 'Checks fixture documents: one line, quoted.');
  assert.equal(en.category, 'Test documents');
  assert.equal(en.status, 'stable');
  assert.equal(skill.docs.ka!.title, 'სკილი /fixture');
});

test('gives headings ids from their text, code and entities included', () => {
  const { html, toc } = skill.docs.en!;
  assert.match(html, /<h2 id="what-it-does"><a class="h-anchor" href="#what-it-does">What it does<\/a><\/h2>/);
  assert.match(html, /<h2 id="the-check-command-more"><a class="h-anchor" href="#the-check-command-more">The <code>check<\/code> command &amp; more<\/a><\/h2>/);
  assert.match(html, /<h3 id="a-third-level-heading">/);
  // "On this page" lists the h2s only, with readable text.
  assert.deepEqual(toc, [
    { id: 'what-it-does', text: 'What it does' },
    { id: 'the-check-command-more', text: 'The check command & more' },
    { id: 'limits', text: 'Limits' },
  ]);
});

test('gives repeated headings distinct ids and never reuses the page’s own', async () => {
  const { renderMarkdownForTest } = await import('../lib/projects');
  const { html, toc } = renderMarkdownForTest('## Notes\n\n### Notes\n\n## Changelog\n', 'en');
  assert.deepEqual(toc.map((t) => t.id), ['notes', 'changelog-2']);
  assert.match(html, /<h3 id="notes-2">/);
});

test('keeps Georgian letters in heading ids', () => {
  const { html, toc } = skill.docs.ka!;
  assert.match(html, /<h2 id="რას-აკეთებს"><a class="h-anchor" href="#რას-აკეთებს">რას აკეთებს<\/a><\/h2>/);
  assert.deepEqual(toc.map((t) => t.id), ['რას-აკეთებს', 'შეზღუდვები']);
});

test('wraps each table in a focusable region named by the section above it', () => {
  const { html } = skill.docs.en!;
  assert.match(html, /<div class="table-wrap" role="region" aria-label="Table" tabindex="0"><table role="table">/, 'a table before any h2 gets a plain label');
  assert.match(html, /<div class="table-wrap" role="region" aria-labelledby="the-check-command-more" tabindex="0"><table role="table">/);
  assert.equal(html.match(/<table role="table">/g)!.length, html.match(/<\/table><\/div>/g)!.length);
  // A phone draws a two-column table as stacked rows, so every part states its table role.
  assert.match(html, /<thead role="rowgroup">\n<tr role="row">\n<th role="columnheader" scope="col">Situation<\/th>/);
  assert.match(html, /<tbody role="rowgroup"><tr role="row">\n<td role="cell">Before a shipment<\/td>\n<td role="cell">Quantities that differ<\/td>/);
  assert.doesNotMatch(html, /<(table|thead|tbody|tr|th|td)>/, 'no table element is left without a role');
  assert.doesNotMatch(html, /<th(?! role="columnheader" scope="col")[\s>]/);
  assert.match(skill.docs.ka!.html, /aria-labelledby="შეზღუდვები"/);
});

test('rewrites the repo images to the self-hosted copies, with their size', () => {
  const { html, markdown } = skill.docs.en!;
  // The image links to its full-size copy, so a phone reader can zoom it.
  assert.match(html, /<figure><a class="zoom" href="\/skills\/fixture\/demo\.png"><img src="\/skills\/fixture\/demo\.png" alt="A marked &quot;demo&quot; invoice" width="1242" height="862" loading="lazy" decoding="async">/);
  assert.doesNotMatch(html, /raw\.githubusercontent\.com/);
  assert.match(markdown, /!\[A marked "demo" invoice\]\(\/skills\/fixture\/demo\.png\)/);
  assert.doesNotMatch(markdown, /^---/, 'the Markdown has no frontmatter');
});

test('serves the WebP twin in a picture and keeps the original as fallback and full-size link', async () => {
  const { renderMarkdownForTest } = await import('../lib/projects');
  const url = 'https://raw.githubusercontent.com/x/y/main/docs/a.png';
  const { html } = renderMarkdownForTest(`![A demo](${url})\n`, 'en', { [url]: { src: '/skills/y/a.png', width: 10, height: 5, webp: '/skills/y/a.webp' } });
  assert.match(html, /<figure><a class="zoom" href="\/skills\/y\/a\.png"><picture><source srcset="\/skills\/y\/a\.webp" type="image\/webp"><img src="\/skills\/y\/a\.png" alt="A demo" width="10" height="5" loading="lazy" decoding="async"><\/picture>/);
});

test('keeps links as written', () => {
  assert.match(skill.docs.en!.html, /<a href="\/skills\/fixture\/rules">the rules<\/a>/);
});

test('reads the changelog: versions with or without brackets, v and a date', () => {
  assert.deepEqual(skill.changelog.map(({ version, date }) => ({ version, date })), [
    { version: 'Unreleased', date: null },
    { version: '0.2.0', date: '2026-12-01' },
    { version: '0.1.1', date: '2026-11-14' },
    { version: '0.1.0', date: null },
  ]);
  const entry = skill.changelog[1].html;
  assert.match(entry, /<code>inline code<\/code>/);
  assert.match(entry, /<h3>Fixed<\/h3>/);
});

test('takes version and licence from SKILL.md and the date from that version’s changelog entry', () => {
  assert.equal(skill.version, '0.2.0');
  assert.equal(skill.license, 'MIT');
  assert.equal(skill.updated, '2026-12-01');
  assert.equal(skill.repoUrl, `https://github.com/${skill.repo}`);
});

test('is named "/slug" in lists, the way agents call it', () => {
  assert.equal(skill.docs.en!.name, '/fixture');
  assert.equal(skill.kind, 'skill');
});

test('the install tabs come from the project file, with the repo filled in', () => {
  const first = skill.install[0];
  assert.ok('commands' in first);
  assert.deepEqual(first.commands, ['npx skills@latest add example/fixture']);
  assert.equal(first.label.ka, 'აგენტის სკილი');
  assert.equal(first.short?.ka, 'სკილი');
});

// The content loader (lib/content.ts): the demo passes, and every kind of mistake fails the build and
// the tests with one line that names the file and the field.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync } from 'node:fs';
import { join } from 'node:path';
import { useSite, editJson, writeContent, removeContent, fixtures } from './helpers';
import { loadContent, placeholders, ContentError, fill, plural, languageName, formatDate, getContent } from '../lib/content';

beforeEach(() => { useSite(); });

/** The problems loading the content reports, one per line; [] when it loads. */
function problems(): string[] {
  try {
    loadContent();
    return [];
  } catch (err) {
    if (!(err instanceof ContentError)) throw err;
    return err.message.split('\n');
  }
}

test('the demo content loads with no problem', () => {
  assert.deepEqual(problems(), []);
  const c = getContent();
  assert.deepEqual(c.languages, ['en', 'ka']);
  assert.equal(c.url, 'https://example.com');
  assert.deepEqual(Object.keys(c.lang.en).filter((k) => ['projects', 'work', 'about', 'blog'].includes(k)).sort(), ['about', 'blog', 'projects', 'work']);
});

test('a missing required field: one line naming the file and the field', () => {
  editJson('en/work.json', (w) => { delete w.lede; });
  assert.deepEqual(problems(), ['content/en/work.json: "lede" is missing (the sentence under the title)']);
});

test('a missing field deep inside: the path to it', () => {
  editJson('ka/about.json', (a) => { delete a.sections[1].entries[0].title; });
  assert.deepEqual(problems(), ['content/ka/about.json: "sections[1].entries[0].title" is missing (the role or the project)']);
});

test('an unknown section fails, naming the sections there are', () => {
  editJson('site.json', (s) => { s.sections.shop = true; });
  assert.deepEqual(problems(), ['content/site.json: "sections.shop" is not a section: the sections are projects, work, about, blog']);
});

test('a section without its switch fails', () => {
  editJson('site.json', (s) => { delete s.sections.blog; });
  assert.deepEqual(problems(), ['content/site.json: "sections.blog" is missing (the blog: true or false)']);
});

test('a second language that lacks a text a page needs fails, naming its file and field', () => {
  editJson('ka/work.json', (w) => { delete w.price; });
  assert.deepEqual(problems(), ['content/ka/work.json: "price" is missing (the price with its currency, as written in this language, e.g. "1,500 ₾")']);
});

test('a second language without its home or its interface words fails', () => {
  removeContent('ka/home.json');
  assert.deepEqual(problems(), ['content/ka/home.json is missing: every language has a home page']);
  useSite();
  removeContent('ui/ka.json');
  assert.deepEqual(problems(), ['content/ui/ka.json is missing: every language needs its interface words (copy content/ui/en.json and translate it)']);
});

test('a language the site adds without its interface file fails; with the file, it loads', () => {
  editJson('site.json', (s) => { s.languages = ['en', 'de']; s.links[0].label.de = 'Code'; delete s.links[0].label.ka; });
  cpSync(join(fixtures, 'de'), join(process.cwd(), 'content/de'), { recursive: true });
  editJson('projects/menu-cards.json', (p) => { for (const t of p.install) { t.label.de = t.label.en; t.note.de = t.note.en; delete t.label.ka; delete t.note.ka; if (t.download) { t.download.label.de = 'Zip'; delete t.download.label.ka; } delete t.short; } });
  assert.deepEqual(problems(), ['content/ui/de.json is missing: every language needs its interface words (copy content/ui/en.json and translate it)']);
  cpSync(join(fixtures, 'ui-de.json'), join(process.cwd(), 'content/ui/de.json'));
  assert.deepEqual(problems(), []);
});

test('the second language may lack a section page: the page does not exist there', () => {
  removeContent('ka/about.json');
  assert.deepEqual(problems(), []);
  assert.equal(getContent().lang.ka.about, undefined);
  assert.ok(getContent().lang.en.about);
});

test('the main language must have every section that is on', () => {
  removeContent('en/blog.json');
  assert.deepEqual(problems(), ['content/en/blog.json is missing: the blog section is on (content/site.json "sections.blog"), so the main language needs its page']);
});

test('a section that is off needs no files, and its files are ignored', () => {
  editJson('site.json', (s) => { s.sections.blog = false; });
  removeContent('en/blog.json');
  assert.deepEqual(problems(), []);
  assert.equal(getContent().lang.en.blog, undefined);
  assert.equal(getContent().lang.ka.blog, undefined);
});

test('a misspelt field is named with the field it was probably meant to be', () => {
  editJson('en/home.json', (h) => { h.leed = h.lede; delete h.lede; });
  assert.deepEqual(problems(), [
    'content/en/home.json: "lede" is missing (the paragraph under the name)',
    'content/en/home.json: "leed" is not a field here (did you mean "lede"?)',
  ]);
});

test('broken JSON is a problem with the file named, not a crash', () => {
  writeContent('en/home.json', '{ "lede": "unfinished }');
  const out = problems();
  assert.equal(out.length, 1);
  assert.match(out[0], /^content\/en\/home\.json: is not valid JSON \(/);
});

test('a text may use only the {tokens} it can fill', () => {
  editJson('en/work.json', (w) => { w.teaser.button = 'From {cost}'; });
  assert.deepEqual(problems(), ['content/en/work.json: "teaser.button" uses {cost}, which this text cannot fill (it can use {price})']);
});

test('a wrong kind of value: a list, a date, a link, a domain', () => {
  editJson('en/work.json', (w) => { w.how.steps = 'one step'; });
  assert.deepEqual(problems(), ['content/en/work.json: "how.steps" must be a list (the steps, in order)']);
  useSite();
  editJson('projects/opening-hours.json', (p) => { p.date = '12 March 2026'; });
  assert.deepEqual(problems(), ['content/projects/opening-hours.json: "date" must be a date as YYYY-MM-DD']);
  useSite();
  editJson('site.json', (s) => { s.domain = 'https://example.com'; });
  assert.deepEqual(problems(), ['content/site.json: "domain" must be a bare domain like "example.com", without https://']);
  useSite();
  editJson('en/about.json', (a) => { a.cv.href = 'cv.pdf'; });
  assert.deepEqual(problems(), ['content/en/about.json: "cv.href" must be a link: https://…, mailto:… or a path on this site starting with /']);
});

test('more than two languages, or one twice, fails', () => {
  editJson('site.json', (s) => { s.languages = ['en', 'ka', 'de']; });
  assert.ok(problems().includes('content/site.json: "languages" lists more than two: one main language and at most one more'));
});

test('a Latin-script language with Georgian letters, or any language with another script, fails', () => {
  editJson('en/home.json', (h) => { h.lede = 'Hello, გამარჯობა.'; });
  assert.deepEqual(problems(), ['content/en/home.json: "lede" has "გ", a letter of another script: this language’s pages are Latin-script only']);
  useSite();
  editJson('ka/home.json', (h) => { h.lede = 'Привет, Next.js-ით.'; });
  assert.deepEqual(problems(), ['content/ka/home.json: "lede" has "П", a letter of another script: Georgian pages may use Georgian and Latin letters only']);
});

test('projects: a plain one needs its text in the main language, and a link or a page', () => {
  removeContent('en/projects/bakery-site.md');
  assert.deepEqual(problems(), ['content/en/projects/bakery-site.md is missing: a plain project needs its title and summary in the main language']);
  useSite();
  editJson('projects/bakery-site.json', (p) => { delete p.link; });
  assert.deepEqual(problems(), ['content/projects/bakery-site.json: "link" is missing: a plain project needs a link, or a page (text under the frontmatter of content/en/projects/bakery-site.md)']);
  useSite();
  writeContent('en/projects/bakery-site.md', '---\ntitle: A bakery\n---\n');
  assert.deepEqual(problems(), ['content/en/projects/bakery-site.md: "summary" is missing from the frontmatter (one sentence: what it is)']);
});

test('projects: a picture must exist, an install tab must say what it does, every language gets its words', () => {
  editJson('projects/menu-cards.json', (p) => { p.image.src = '/projects/menu-cards/gone.webp'; });
  assert.deepEqual(problems(), ['content/projects/menu-cards.json: "image.src" is /projects/menu-cards/gone.webp, but public/projects/menu-cards/gone.webp does not exist']);
  useSite();
  editJson('projects/menu-cards.json', (p) => { delete p.install[0].commands; });
  assert.deepEqual(problems(), ['content/projects/menu-cards.json: "install[0]" needs either "commands" or "download"']);
  useSite();
  editJson('projects/menu-cards.json', (p) => { delete p.install[0].note.ka; });
  assert.deepEqual(problems(), ['content/projects/menu-cards.json: "install[0].note.ka" is missing (the line under the commands)']);
});

test('projects: the file name is the address; an agent skill takes no text from content/', () => {
  writeContent('projects/Menu Cards.json', '{ "kind": "plain", "date": "2026-01-01", "link": "https://example.com" }');
  assert.deepEqual(problems(), ['content/projects/Menu Cards.json: the file name is the project’s address, so it must be lower-case letters, digits and single hyphens']);
  useSite({ skill: true });
  writeContent('en/projects/fixture.md', '---\ntitle: x\nsummary: y\n---\n');
  assert.deepEqual(problems(), ['content/en/projects/fixture.md: fixture is an agent skill (content/projects/fixture.json); its text comes from its repository, so delete this file']);
});

test('the Work page’s example must be a project with a picture', () => {
  editJson('en/work.json', (w) => { w.example.project = 'opening-hours'; });
  assert.deepEqual(problems(), ['content/en/work.json: "example.project" is "opening-hours", which has no picture (a skill\'s "specimen" or a plain project\'s "image")']);
});

test('a profile link named per language needs a name in every language', () => {
  editJson('site.json', (s) => { delete s.links[0].label.ka; });
  assert.deepEqual(problems(), ['content/site.json: "links[0].label.ka" is missing (the link’s name in that language)']);
});

test('a plain project’s date may wait as a [[placeholder]]: drawn as one, listed after the dated projects, given to no machine', async () => {
  editJson('projects/menu-cards.json', (p) => { p.date = '[[when it was made]]'; });
  const { getProjects } = await import('../lib/projects');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { createElement } = await import('react');
  const { ProjectPage } = await import('../components/ProjectPage');
  const { ProjectsIndex } = await import('../components/ProjectsIndex');
  const { projectMarkdown } = await import('../lib/agent-md');
  const { routes } = await import('../lib/routes');
  const { projectJsonLd } = await import('../lib/project-seo');
  const projects = getProjects();
  assert.deepEqual(projects.map((p) => p.slug), ['opening-hours', 'bakery-site', 'menu-cards'], 'the dated ones newest first, then the undated');
  const menu = projects.find((p) => p.slug === 'menu-cards')!;
  assert.equal(menu.updated, null);
  for (const lang of ['en', 'ka']) {
    const page = renderToStaticMarkup(createElement(ProjectPage, { project: menu, lang }));
    assert.match(page, /<dd><span class="ph">\[\[when it was made\]\]<\/span><\/dd>/);
    assert.doesNotMatch(page, /<time dateTime="\[\[/);
    assert.match(renderToStaticMarkup(createElement(ProjectsIndex, { lang })), /<span class="ph">\[\[when it was made\]\]<\/span>/);
    assert.match(projectMarkdown(menu, lang), /: \[\[when it was made\]\]$/m);
  }
  assert.equal(routes().find((r) => r.key === '/projects/menu-cards')!.lastModified, undefined, 'the sitemap gives no date');
  assert.doesNotMatch(JSON.stringify(projectJsonLd(menu, 'en')), /\[\[/);
  assert.ok(placeholders().some((p) => p.file === 'content/projects/menu-cards.json' && p.text === '[[when it was made]]'), 'pnpm check lists it');
});

test('the placeholders still waiting for a fact are listed with their files', () => {
  assert.deepEqual(placeholders(), [
    { file: 'content/site.json', text: '[[LinkedIn URL]]' },
    { file: 'content/site.json', text: '[[photo]] ("photo" is null)' },
  ]);
});

test('fill, plural forms, language names and dates', () => {
  assert.equal(fill('From {price}', { price: '1,500 ₾' }), 'From 1,500 ₾');
  assert.equal(fill('{a} and {b}', { a: 1 }), '1 and {b}', 'an unknown token stays as written');
  assert.equal(plural('en', { one: '{n} project', other: '{n} projects' }, 1), '1 project');
  assert.equal(plural('en', { one: '{n} project', other: '{n} projects' }, 3), '3 projects');
  assert.equal(plural('ka', { one: '{n} პროექტი', other: '{n} პროექტი' }, 3), '3 პროექტი');
  assert.equal(languageName('ka', 'en'), 'Georgian');
  assert.equal(languageName('en', 'ka'), 'ინგლისური');
  assert.equal(formatDate('2026-11-14', 'en'), '14 Nov 2026');
  assert.equal(formatDate('2026-11-14', 'ka'), '14 ნოემბერი 2026');
  assert.equal(formatDate('2027-01-05', 'en'), '5 Jan 2027');
});

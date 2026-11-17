// The shapes a site can take (scripts/lib/shapes.mjs), checked on the demo of tests/fixtures/site
// without a build: English and Georgian, English only, English and German (its interface file supplied
// by the test), and each section off in turn. For each: the pages that exist, the route files Next
// takes, and tests/site-checks.ts (the navigation, the sitemap, /llms.txt, and every page rendered with
// react-dom/server, every internal link on it reaching a page or a file of the site). `pnpm shapes`
// builds each shape with Next (scripts/shapes.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useSite, root } from './helpers';
import { checkSite } from './site-checks';
import { SHAPES, expectedPages } from '../scripts/lib/shapes.mjs';
import { loadContent, SECTIONS } from '../lib/content';
import { routes } from '../lib/routes';
import { getProject, hasPage } from '../lib/projects';
import { getPosts } from '../lib/blog';
import { llmsTxt } from '../lib/agent-md';
import { pageExtensionsFor } from '../next.config';
import { ProjectsIndex } from '../components/ProjectsIndex';
import { WorkPage } from '../components/WorkPage';
import { Header } from '../components/Chrome';

for (const name of Object.keys(SHAPES)) {
  test(`shape ${name} (${SHAPES[name].note}): the pages, the navigation, the sitemap, /llms.txt and every link`, async () => {
    useSite({ shape: name });
    const c = loadContent();
    assert.deepEqual([...new Set(routes().map((r) => r.path))].sort(), expectedPages(name).sort(), 'the pages that exist');

    // A section that is off: not a route extension, so none of its route files is a route.
    const extensions = pageExtensionsFor(c);
    for (const s of SECTIONS) assert.equal(extensions.includes(`${s}.tsx`), c.sections[s], `${s}: route files ${c.sections[s] ? 'on' : 'off'}`);

    // What holds for any content: every page renders with one call to action, every link leads somewhere (tests/site-checks.ts).
    assert.equal(await checkSite(), expectedPages(name).length);
  });
}

test('English and German: the language link says "Auf Deutsch" where a page has a German twin, "Deutsch" where not', () => {
  useSite({ shape: 'en+de' });
  const work = renderToStaticMarkup(createElement(Header, { lang: 'en', page: '/work' }));
  assert.match(work, /<a class="lang" href="\/de\/work" lang="de" hrefLang="de">Auf Deutsch<\/a>/);
  const about = renderToStaticMarkup(createElement(Header, { lang: 'en', page: '/about' }));
  assert.match(about, /<a class="lang" href="\/de" lang="de" hrefLang="de">Deutsch<\/a>/);
  const back = renderToStaticMarkup(createElement(Header, { lang: 'de', page: '/work' }));
  assert.match(back, /<a class="lang" href="\/work" lang="en" hrefLang="en">In English<\/a>/);
  const de = renderToStaticMarkup(createElement(WorkPage, { lang: 'de' }));
  assert.match(de, /Ab 1\.500 <span class="lari">₾<\/span>/, 'the price in German, kept on one line');
  assert.doesNotMatch(de, /class="example"/, 'the German pages have no projects, so Work shows no example');
  assert.ok(llmsTxt().includes('English is the main language; German pages live under /de/.'));
});

test('a page missing in the second language exists only in the main one, and links to the other home', () => {
  useSite();
  rmSync(join(process.cwd(), 'content/ka/about.json'));
  const paths = routes().map((r) => r.path);
  assert.ok(paths.includes('/about') && !paths.includes('/ka/about'));
  assert.match(renderToStaticMarkup(createElement(Header, { lang: 'en', page: '/about' })), /<a class="lang" href="\/ka" lang="ka" hrefLang="ka">ქართული<\/a>/);
  assert.doesNotMatch(renderToStaticMarkup(createElement(Header, { lang: 'ka' })), /href="\/ka\/about"/, 'the Georgian navigation has no About');
});

test('a plain project without a page links to its own address; with a page in one language only, it has a page there only', () => {
  useSite();
  const bakery = getProject('bakery-site')!;
  assert.equal(hasPage(bakery, 'en'), false);
  assert.match(renderToStaticMarkup(createElement(ProjectsIndex, { lang: 'en' })), /<a href="https:\/\/bakery\.example\.org">A bakery’s website<\/a>/);
  writeFileSync(join(process.cwd(), 'content/ka/projects/opening-hours.md'), '---\ntitle: სამუშაო საათები\nsummary: ვიჯეტი.\n---\n');
  assert.ok(routes().some((r) => r.path === '/projects/opening-hours'));
  assert.ok(!routes().some((r) => r.path === '/ka/projects/opening-hours'), 'no text under the frontmatter in Georgian: no Georgian page');
  assert.equal(getPosts('ka').length, 1);
});

test('every route handler of a section carries its section’s name; its pages are plain and switched off otherwise', async () => {
  const app = join(root, 'app');
  const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
  let handlers = 0;
  let pages = 0;
  for (const file of walk(app)) {
    const rel = relative(app, file).split('/');
    const name = rel.at(-1)!;
    const parts = rel.filter((p) => !/^\(.*\)$/.test(p) && p !== '[lang]');
    const section = parts[0] === 'projects.md' || parts[0] === 'md' ? 'projects' : (SECTIONS as readonly string[]).includes(parts[0]) ? parts[0] : null;
    if (!section) continue;
    if (/^route\./.test(name)) {
      assert.match(name, new RegExp(`^route\\.${section}\\.tsx?$`), `app/${rel.join('/')} belongs to ${section}: name it route.${section}.ts(x)`);
      handlers += 1;
    }
    if (/^page\./.test(name)) {
      // Next finds a page's font preloads by its name less one extension, so pages stay page.tsx.
      assert.equal(name, 'page.tsx', `app/${rel.join('/')}`);
      pages += 1;
    }
  }
  assert.ok(handlers >= 13 && pages === 12, `${handlers} route handlers, ${pages} pages`);

  // With a section off, the main language's page for it is a 404 (and next.config.ts rewrites its address).
  for (const s of SECTIONS) {
    useSite({ shape: `no-${s}` });
    const mod = await import(`../app/(primary)/${s}/page.tsx`);
    assert.throws(() => mod.default(), /NEXT_HTTP_ERROR_FALLBACK;404/, `${s} off: its page is a 404`);
    assert.deepEqual(mod.generateMetadata(), {});
  }
});

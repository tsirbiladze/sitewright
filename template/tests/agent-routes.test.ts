// The agent formats as Next serves them (the route handlers), and the files crawlers read
// (sitemap.xml, robots.txt), on the demo content with the fixture skill added.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { useSite, slug, siteUrl as site } from './helpers';

let md: typeof import('../lib/agent-md');
let getProject: typeof import('../lib/projects').getProject;

before(async () => {
  useSite({ skill: true });
  md = await import('../lib/agent-md');
  ({ getProject } = await import('../lib/projects'));
});

const route = (path: string) => import(`../app/${path}`);

test('/llms.txt, /llms-full.txt and /projects.md: static, typed, UTF-8, kept out of search results', async () => {
  for (const [path, body, type] of [
    ['llms.txt/route.ts', () => md.llmsTxt(), 'text/plain; charset=utf-8'],
    ['llms-full.txt/route.ts', () => md.llmsFullTxt(), 'text/plain; charset=utf-8'],
    ['projects.md/route.projects.ts', () => md.projectsIndexMarkdown(), 'text/markdown; charset=utf-8'],
  ] as const) {
    const mod = await route(path);
    assert.equal(mod.dynamic, 'force-static', path);
    const res: Response = mod.GET();
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), type, path);
    assert.equal(res.headers.get('x-robots-tag'), 'noindex', path);
    assert.equal(await res.text(), body(), path);
  }
});

test('the .md twins: one per project page in each language, 404 for anything else', async () => {
  const mod = await route('md/[lang]/[slug]/route.projects.ts');
  assert.equal(mod.dynamicParams, false, 'no twin is rendered on demand');
  const params = mod.generateStaticParams().map((p: { lang: string; slug: string }) => `${p.lang}/${p.slug}`).sort();
  assert.deepEqual(params, ['en/fixture', 'en/menu-cards', 'en/opening-hours', 'ka/fixture', 'ka/menu-cards', 'ka/opening-hours'], 'the bakery has no page, so no twin');
  const get = (lang: string, s: string) => mod.GET(new Request(`${site}/md/${lang}/${s}`), { params: Promise.resolve({ lang, slug: s }) });
  for (const lang of ['en', 'ka'] as const) {
    const res: Response = await get(lang, slug);
    assert.equal(res.headers.get('content-type'), 'text/markdown; charset=utf-8');
    assert.equal(await res.text(), md.projectMarkdown(getProject(slug)!, lang));
  }
  assert.equal((await get('de', slug)).status, 404);
  assert.equal((await get('en', 'no-such-project')).status, 404);
  assert.equal((await get('en', 'bakery-site')).status, 404);
});

test('sitemap: every page once, hreflang pairs, real dates only, no agent formats', async () => {
  const sitemap = (await import('../app/sitemap')).default();
  const urls = sitemap.map((e) => e.url);
  assert.equal(new Set(urls).size, urls.length, 'no duplicates');
  const pages = ['/', '/projects', `/projects/${slug}`, '/projects/menu-cards', '/projects/opening-hours', '/work', '/about', '/blog', '/blog/small-and-fast'];
  assert.deepEqual(urls.map((u) => u.replace(site, '') || '/').sort(), [...pages, ...pages.map((p) => (p === '/' ? '/ka' : `/ka${p}`))].sort());
  const byPath = (p: string) => sitemap.find((e) => e.url === site + p)!;
  assert.deepEqual(byPath('/work').alternates, { languages: { en: `${site}/work`, ka: `${site}/ka/work` } });
  assert.deepEqual(byPath('/ka/blog/small-and-fast').alternates, { languages: { en: `${site}/blog/small-and-fast`, ka: `${site}/ka/blog/small-and-fast` } }, 'a post with the same slug in both languages is its twin');
  assert.equal(byPath(`/projects/${slug}`).lastModified, '2026-12-01', 'the release date from the changelog');
  assert.equal(byPath('/projects/menu-cards').lastModified, '2026-10-20', 'a plain project’s date');
  assert.equal(byPath('/blog/small-and-fast').lastModified, '2026-11-10');
  assert.equal(byPath('/about').lastModified, undefined, 'no invented dates');
});

test('robots.txt allows everything but the twins’ internal paths, and names the sitemap', async () => {
  const robots = (await import('../app/robots')).default();
  assert.deepEqual(robots, { rules: [{ userAgent: '*', allow: '/', disallow: '/md/' }], sitemap: `${site}/sitemap.xml` });
});

test('the feeds: one per language with a blog, static and typed as RSS', async () => {
  const { blogFeed } = await import('../lib/blog');
  const primary = await route('(primary)/blog/feed.xml/route.blog.ts');
  assert.equal(primary.dynamic, 'force-static');
  const res: Response = primary.GET();
  assert.equal(res.headers.get('content-type'), 'application/rss+xml; charset=utf-8');
  assert.equal(await res.text(), blogFeed('en'));
  const second = await route('(second)/[lang]/blog/feed.xml/route.blog.ts');
  assert.deepEqual(second.generateStaticParams(), [{ lang: 'ka' }]);
  assert.equal(await (await second.GET(new Request(`${site}/ka/blog/feed.xml`), { params: Promise.resolve({ lang: 'ka' }) })).text(), blogFeed('ka'));
});

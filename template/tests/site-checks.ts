// What must hold for any site the template builds, whatever its content: every page renders in each
// language it has, with exactly one call to action; every internal link on a page reaches a page or a
// file of the site; the navigation lists exactly the sections a language has; nothing links into a
// section that is off; the sitemap lists every page once; /llms.txt names only pages and files that
// exist. tests/shapes.test.ts runs it on the demo in every shape, tests/live-content.test.ts on the
// site's own content/.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { href, loadContent, SECTIONS } from '../lib/content';
import { routes, type Route } from '../lib/routes';
import { getProject, getProjects } from '../lib/projects';
import { getPost, feedPath } from '../lib/blog';
import { llmsTxt, llmsFullTxt } from '../lib/agent-md';
import { Home } from '../components/Home';
import { ProjectsIndex } from '../components/ProjectsIndex';
import { ProjectPage } from '../components/ProjectPage';
import { WorkPage } from '../components/WorkPage';
import { AboutPage } from '../components/AboutPage';
import { BlogIndex, BlogPost } from '../components/Blog';
import { Header, NotFoundBody } from '../components/Chrome';

/** The page a route shows, as the route files render it. */
export function page(r: Route): ReactElement {
  const lang = r.lang;
  const [, section, slug] = r.key.split('/');
  if (r.key === '/') return createElement(Home, { lang });
  if (section === 'projects') return slug ? createElement(ProjectPage, { project: getProject(slug)!, lang }) : createElement(ProjectsIndex, { lang });
  if (section === 'work') return createElement(WorkPage, { lang });
  if (section === 'about') return createElement(AboutPage, { lang });
  if (section === 'blog') return slug ? createElement(BlogPost, { lang, post: getPost(lang, slug)! }) : createElement(BlogIndex, { lang });
  throw new Error(`no page for ${r.path}`);
}

/** Every internal address a page links to (a, link), without its #fragment. */
export const internalLinks = (html: string) =>
  [...html.matchAll(/\shref="(\/[^"#]*)[^"]*"/g)].map((m) => m[1]).filter((h) => h && !h.startsWith('//'));

/** What else an internal link may reach: the agent formats, the feeds, the Markdown twins. Files in public/ are checked on disk. */
function files(): Set<string> {
  const c = loadContent();
  const out = new Set(['/llms.txt', '/llms-full.txt']);
  if (c.lang[c.primary].projects) out.add('/projects.md');
  for (const lang of c.languages) if (c.lang[lang].blog) out.add(feedPath(lang));
  for (const r of routes()) if (/\/projects\/[^/]+$/.test(r.key)) out.add(`${r.path}.md`);
  return out;
}

/**
 * Checks the content in the working directory (a copy made by tests/helpers.ts `useSite`) and
 * returns how many pages it rendered. Fails with the page and the problem.
 */
export async function checkSite(): Promise<number> {
  const c = loadContent();
  const all = routes();
  const paths = new Set(all.map((r) => r.path));
  assert.equal(paths.size, all.length, 'every page has an address of its own');

  // The navigation lists exactly the sections each language has, in order.
  for (const lang of c.languages) {
    const html = renderToStaticMarkup(createElement(Header, { lang }));
    const nav = [...html.matchAll(/<li><a href="([^"]+)"/g)].map((m) => m[1]);
    const want = SECTIONS.filter((s) => c.lang[lang][s]).map((s) => href(lang, `/${s}`));
    assert.deepEqual(nav, want, `${lang} navigation`);
    if (c.languages.length === 1) assert.doesNotMatch(html, /class="lang"/, 'one language: no language link');
  }

  // Every page renders, in its language, with one call to action, and every internal link on it reaches a page or a file.
  const reachable = new Set([...paths, ...files()]);
  const publicFile = (p: string) => existsSync(join(process.cwd(), 'public', decodeURIComponent(p)));
  const rendered = [
    ...all.map((r) => ({ where: r.path, html: renderToStaticMarkup(page(r)) })),
    ...c.languages.map((lang) => ({ where: `404 (${lang})`, html: renderToStaticMarkup(createElement(NotFoundBody, { lang })) })),
  ];
  const off = SECTIONS.filter((s) => !c.sections[s]);
  for (const { where, html } of rendered) {
    assert.ok(html.length > 0, `${where} renders`);
    for (const link of internalLinks(html)) assert.ok(reachable.has(link) || publicFile(link), `${where} links to ${link}, which is not a page or a file of the site`);
    for (const s of off) assert.doesNotMatch(html, new RegExp(`href="(/[a-z]{2,3})?/${s}[/"#.]`), `${where} links into ${s}, which is off`);
    assert.equal((html.match(/class="cta(?: [^"]*)?"/g) ?? []).length, 1, `${where}: one call to action`);
    // A [[placeholder]] is drawn as one, and nothing links to it.
    assert.doesNotMatch(html, /href="[^"]*(\[\[|%5B%5B)/i, `${where} links to a [[placeholder]]`);
  }

  // The sitemap lists every page once, and the agent formats name nothing that is off or missing.
  const sitemap = (await import('../app/sitemap')).default();
  const listed = sitemap.map((e) => e.url.slice(c.url.length) || '/');
  assert.equal(new Set(listed).size, listed.length, 'the sitemap lists a page once');
  assert.deepEqual(listed.sort(), [...paths].sort(), 'the sitemap lists every page');
  const own = new RegExp(`${c.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(/[^\\s)>\\]]*)?`, 'g');
  for (const text of [llmsTxt(), llmsFullTxt()]) {
    assert.doesNotMatch(text, /\]\([^)]*\[\[/, '/llms.txt links to a [[placeholder]]');
    for (const [url] of text.matchAll(own)) {
      const path = url.slice(c.url.length) || '/';
      assert.ok(reachable.has(path) || publicFile(path), `/llms.txt names ${url}, which is not a page or a file of the site`);
    }
  }
  if (!c.sections.projects) assert.equal(getProjects().length, 0, 'projects off: no project anywhere');
  return all.length;
}

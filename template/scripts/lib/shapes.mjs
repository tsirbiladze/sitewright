// The shapes a site can take, applied to a copy of the template's content: two languages, one, a
// second language other than Georgian, and each section off in turn. tests/shapes.test.ts checks each
// shape without building; `pnpm shapes` (scripts/shapes.mjs) builds each one with Next.
import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const fixtures = new URL('../../tests/fixtures/', import.meta.url).pathname;

export const SHAPES = {
  'en+ka': { languages: ['en', 'ka'], note: 'English and Georgian (the demo as it ships)' },
  en: { languages: ['en'], note: 'English only' },
  'en+de': { languages: ['en', 'de'], note: 'English and German: interface words from tests/fixtures/ui-de.json, a German home and Work page' },
  'no-projects': { off: 'projects', note: 'the projects section off' },
  'no-work': { off: 'work', note: 'the Work page off' },
  'no-about': { off: 'about', note: 'the About page off' },
  'no-blog': { off: 'blog', note: 'the blog off' },
};

const json = (file) => JSON.parse(readFileSync(file, 'utf8'));

/** The demo's pages in each language (the main one at /): what a shape keeps of them. */
const demoKeys = ['/', '/projects', '/projects/menu-cards', '/projects/opening-hours', '/work', '/about', '/blog', '/blog/small-and-fast'];
const at = (lang, primary, key) => (lang === primary ? key : key === '/' ? `/${lang}` : `/${lang}${key}`);

/** Every page the shape must have, as addresses. The German test content has a home and Work only. */
export function expectedPages(name) {
  const shape = SHAPES[name];
  const languages = shape.languages ?? ['en', 'ka'];
  return languages.flatMap((lang) =>
    lang === 'de' ? ['/de', '/de/work'] : demoKeys.filter((key) => (key.split('/')[1] || 'home') !== shape.off).map((key) => at(lang, languages[0], key)));
}

/**
 * Everything a build of the shape must prerender, and nothing more: the pages, a share image beside
 * each page (a post shares its blog's), a feed per blog, the Markdown twins and index of the
 * projects, the agent formats, the second language's 404, and Next's own files.
 */
export function expectedBuild(name) {
  const shape = SHAPES[name];
  const languages = shape.languages ?? ['en', 'ka'];
  const pages = expectedPages(name);
  const prefix = (lang) => (lang === languages[0] ? '' : `/${lang}`);
  const out = new Set(['/_global-error', '/_not-found', '/apple-icon', '/icon', '/robots.txt', '/sitemap.xml', '/llms.txt', '/llms-full.txt', ...pages]);
  for (const page of pages) if (!/\/blog\/[^/]+$/.test(page)) out.add(page === '/' ? '/share.png' : `${page}/share.png`);
  for (const page of pages) if (/\/blog$/.test(page)) out.add(`${page}/feed.xml`);
  for (const page of pages) {
    const m = page.match(/^(?:\/([a-z]{2}))?\/projects\/([^/]+)$/);
    if (m) out.add(`/md/${m[1] ?? languages[0]}/${m[2]}`);
  }
  if (pages.includes('/projects')) out.add('/projects.md');
  if (languages[1]) out.add(`${prefix(languages[1])}/404`);
  // A section that is off: the main language's page file is still built, as a 404 that next.config.ts
  // never lets through (scripts/shapes.mjs asks the server for it).
  if (shape.off) out.add(`/${shape.off}`);
  return [...out].sort();
}

/** Addresses a server of the shape must answer with 404: everything of a section that is off. */
export function expectedMissing(name) {
  const shape = SHAPES[name];
  if (!shape.off) return [];
  const languages = shape.languages ?? ['en', 'ka'];
  return languages.flatMap((lang) => {
    const p = lang === languages[0] ? '' : `/${lang}`;
    return [`${p}/${shape.off}`, `${p}/${shape.off}/share.png`, ...(shape.off === 'blog' ? [`${p}/blog/feed.xml`, `${p}/blog/small-and-fast`] : []), ...(shape.off === 'projects' ? [`${p}/projects/menu-cards`, `${p}/projects/menu-cards.md`] : [])];
  }).concat(shape.off === 'projects' ? ['/projects.md'] : []);
}

/** Changes the content in `dir` (a copy of the template) into the shape `name`. */
export function applyShape(dir, name) {
  const shape = SHAPES[name];
  if (!shape) throw new Error(`no shape "${name}": ${Object.keys(SHAPES).join(', ')}`);
  const siteFile = join(dir, 'content/site.json');
  const site = json(siteFile);
  if (shape.languages) site.languages = shape.languages;
  if (shape.off) site.sections[shape.off] = false;
  if (shape.languages?.includes('de')) {
    cpSync(join(fixtures, 'ui-de.json'), join(dir, 'content/ui/de.json'));
    cpSync(join(fixtures, 'de'), join(dir, 'content/de'), { recursive: true });
    // A profile link's name per language needs a German one too.
    for (const link of site.links) if (typeof link.label === 'object') link.label.de = 'Code';
  }
  if (shape.languages && !shape.languages.includes('ka'))
    for (const link of site.links) if (typeof link.label === 'object') delete link.label.ka;
  writeFileSync(siteFile, JSON.stringify(site, null, 2));
  // Install tabs name their text per language: a project file follows the site's languages.
  if (shape.languages) {
    for (const file of ['content/projects/menu-cards.json']) {
      const path = join(dir, file);
      const project = json(path);
      const perLanguage = (map) => Object.fromEntries(shape.languages.map((l) => [l, map[l] ?? map.en]));
      for (const tab of project.install ?? []) {
        tab.label = perLanguage(tab.label);
        tab.note = perLanguage(tab.note);
        if (tab.download) tab.download.label = perLanguage(tab.download.label);
        if (tab.short) tab.short = Object.fromEntries(Object.entries(tab.short).filter(([l]) => shape.languages.includes(l)));
      }
      writeFileSync(path, JSON.stringify(project, null, 2));
    }
  }
  return shape;
}

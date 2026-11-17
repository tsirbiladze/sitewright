// Every page of the site, in each language, from the content: what the sitemap lists, what the 404
// suggests, what each page's language link and hreflang point to, and what the tests walk. A page
// exists in a language when that language has its content; a section that is off has no pages.
import { getContent, has, href, type Lang } from './content';
import { getProjects, hasPage } from './projects';
import { getPosts } from './blog';

export interface Route {
  lang: Lang;
  /** The same page in every language: '/', '/work', '/projects/menu-cards'. */
  key: string;
  /** Its address in this language: '/ka/work'. */
  path: string;
  /** A real date only: a project's current release or date, a post's date. */
  lastModified?: string;
}

export function routes(): Route[] {
  const { languages } = getContent();
  const out: Route[] = [];
  const add = (lang: Lang, key: string, lastModified?: string | null) => out.push({ lang, key, path: href(lang, key), ...(lastModified ? { lastModified } : {}) });
  for (const lang of languages) {
    add(lang, '/');
    if (has(lang, 'projects')) {
      add(lang, '/projects');
      for (const p of getProjects()) if (hasPage(p, lang)) add(lang, `/projects/${p.slug}`, p.updated);
    }
    if (has(lang, 'work')) add(lang, '/work');
    if (has(lang, 'about')) add(lang, '/about');
    if (has(lang, 'blog')) {
      add(lang, '/blog');
      for (const post of getPosts(lang)) add(lang, `/blog/${post.slug}`, post.date);
    }
  }
  return out;
}

/** The same page in another language, if it has one. */
export function twin(key: string, lang: Lang): string | undefined {
  return routes().find((r) => r.key === key && r.lang === lang)?.path;
}

/** hreflang for a page: each language it exists in, and x-default for the main language's. */
export function alternates(key: string): { languages: Record<string, string> } | undefined {
  const { primary } = getContent();
  const found = routes().filter((r) => r.key === key);
  if (found.length < 2) return undefined;
  const languages: Record<string, string> = Object.fromEntries(found.map((r) => [r.lang, r.path]));
  const main = found.find((r) => r.lang === primary);
  if (main) languages['x-default'] = main.path;
  return { languages };
}

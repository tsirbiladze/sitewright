// Blog posts: content/<lang>/blog/<slug>.md with frontmatter title, date (YYYY-MM-DD), summary, draft.
// A language has a blog when the blog section is on and content/<lang>/blog.json exists; each
// language's posts are its own. Posts with the same slug in both languages are each other's twin.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Marked } from 'marked';
import { frontmatter } from './frontmatter';
import { getContent, has, href, L, liveHref, type Lang } from './content';
import { escapeHtml, safeRenderer, safeUrl, smartenText } from './projects';

export interface Post { lang: Lang; slug: string; title: string; date: string; summary: string; html: string; minutes: number; draft: boolean }

export const blogPath = (lang: Lang) => href(lang, '/blog');
export const feedPath = (lang: Lang) => href(lang, '/blog/feed.xml');
export const postPath = (lang: Lang, slug: string) => href(lang, `/blog/${slug}`);

/** Reading time in whole minutes, at least one, counted on the Markdown with code blocks left out. */
export function readingMinutes(markdown: string, wordsPerMinute = 150): number {
  const words = markdown.replace(/```[\s\S]*?```/g, ' ').split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  return Math.max(1, Math.round(words / wordsPerMinute));
}

/**
 * Drafts are built only for a local preview: `BLOG_DRAFTS=1 pnpm build && pnpm start`. Never on
 * Vercel or in CI, even if the flag is set there, so a draft cannot reach the published site.
 */
export function draftPreview(): boolean {
  return process.env.BLOG_DRAFTS === '1' && !process.env.VERCEL && !process.env.CI;
}

const cache = new Map<Lang, Post[]>();

/** Every post of a language, drafts included (those with a title and a date), newest first. */
function readPosts(lang: Lang): Post[] {
  // Cached for the build; in `next dev` a new or edited post shows on reload.
  if (cache.has(lang) && process.env.NODE_ENV === 'production') return cache.get(lang)!;
  const dir = join(getContent().dir, lang, 'blog');
  if (!has(lang, 'blog') || !existsSync(dir)) { cache.set(lang, []); return []; }
  const marked = new Marked({
    gfm: true,
    ...(lang === 'en' ? { walkTokens: smartenText } : {}),
    // A post brings no markup of its own, like every Markdown the site renders (lib/projects.ts).
    renderer: {
      ...safeRenderer,
      link({ href: target, tokens }) {
        const inner = this.parser.parseInline(tokens);
        // A link into a section that is off keeps its words and loses the link. So does a link to an
        // address safeUrl refuses.
        const live = safeUrl(target, { mailto: true }) ? liveHref(target) : null;
        return live === null ? inner : `<a href="${escapeHtml(live)}">${inner}</a>`;
      },
    },
  });
  const wpm = L(lang).ui.wordsPerMinute;
  const posts = readdirSync(dir)
    .filter((f) => f.endsWith('.md') && f !== 'README.md')
    .flatMap((f): Post[] => {
      const { data, body } = frontmatter(readFileSync(join(dir, f), 'utf8'));
      const draft = String(data.draft) === 'true';
      if (!data.title || !/^\d{4}-\d{2}-\d{2}$/.test(data.date ?? '')) {
        // A draft may be unfinished; it just can't be previewed until it has both.
        if (draft) return [];
        throw new Error(`content/${lang}/blog/${f}: a published post needs a title and a date as YYYY-MM-DD`);
      }
      return [{
        lang,
        slug: f.replace(/\.md$/, ''),
        title: data.title,
        date: data.date,
        summary: data.summary ?? '',
        // A code block that scrolls sideways must be reachable by keyboard.
        html: (marked.parse(body, { async: false }) as string).replace(/<pre>/g, '<pre tabindex="0">'),
        minutes: readingMinutes(body, wpm),
        draft,
      }];
    })
    .sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
  cache.set(lang, posts);
  return posts;
}

/**
 * Published posts, newest first. The blog pages pass `drafts: draftPreview()`; everything else (the
 * feed, the sitemap, /llms.txt, the home) never sees a draft.
 */
export function getPosts(lang: Lang, { drafts = false }: { drafts?: boolean } = {}): Post[] {
  return readPosts(lang).filter((p) => drafts || !p.draft);
}

export const getPost = (lang: Lang, slug: string, options?: { drafts?: boolean }) => getPosts(lang, options).find((p) => p.slug === slug);

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cdata = (s: string) => `<![CDATA[${s.replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
/** RFC 822, as RSS wants it: "Fri, 20 Nov 2026 00:00:00 GMT". Posts have a day, not a time. */
const rssDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toUTCString();

/**
 * A language's blog as RSS 2.0, published posts only, newest first, each with its summary and full
 * text. Valid with no posts too: RSS needs only the channel's title, link and description.
 */
export function blogFeed(lang: Lang): string {
  const { url } = getContent();
  const { blog, site } = L(lang);
  const posts = getPosts(lang);
  const abs = (path: string) => `${url}${path}`;
  // Feed readers show the post away from the site: its own links and images need the full address.
  const absolute = (html: string) => html.replace(/\b(src|href)="\/(?!\/)/g, `$1="${url}/`);
  const items = posts.map((p) => [
    '    <item>',
    `      <title>${xml(p.title)}</title>`,
    `      <link>${abs(postPath(lang, p.slug))}</link>`,
    `      <guid isPermaLink="true">${abs(postPath(lang, p.slug))}</guid>`,
    `      <pubDate>${rssDate(p.date)}</pubDate>`,
    ...(p.summary ? [`      <description>${xml(p.summary)}</description>`] : []),
    `      <content:encoded>${cdata(absolute(p.html))}</content:encoded>`,
    '    </item>',
  ].join('\n'));
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">',
    '  <channel>',
    `    <title>${xml(`${blog!.title} – ${site.name}`)}</title>`,
    `    <link>${abs(blogPath(lang))}</link>`,
    `    <description>${xml(blog!.description)}</description>`,
    `    <language>${lang}</language>`,
    `    <atom:link href="${abs(feedPath(lang))}" rel="self" type="application/rss+xml"/>`,
    ...(posts.length ? [`    <pubDate>${rssDate(posts[0].date)}</pubDate>`] : []),
    ...items,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');
}

// What the route files share, so each is a few lines for either language: which second-language
// pages exist (generateStaticParams), each page's metadata, and its share image (drawn by the
// `share.png` route beside the page: Turbopack does not take `opengraph-image.<section>.tsx`).
// The main language's routes live in app/(primary)/, the second language's in app/(second)/[lang]/.
import { createHash } from 'node:crypto';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fill, getContent, has, href, L, type Lang, type Section } from './content';
import { getPost, getPosts, draftPreview, feedPath } from './blog';
import { getProjects, hasPage, getProject } from './projects';
import { pageMetadata, projectMetadata } from './project-seo';

/** The second language's pages: [{ lang }] where it has the section (or the home), [] otherwise. */
export function secondParams(section?: Section): { lang: string }[] {
  const { second } = getContent();
  return second && (!section || has(second, section)) ? [{ lang: second }] : [];
}

/** The language a second-language route is for; anything else is not a page. */
export async function secondLang(params: Promise<{ lang: string }>): Promise<Lang> {
  const { lang } = await params;
  if (lang !== getContent().second) notFound();
  return lang;
}

/** The project pages of a language, as static params. */
export const projectParams = (lang: Lang) => (has(lang, 'projects') ? getProjects().filter((p) => hasPage(p, lang)).map((p) => ({ slug: p.slug })) : []);
/** The posts of a language (drafts too, in a local preview), as static params. */
export const postParams = (lang: Lang) => (has(lang, 'blog') ? getPosts(lang, { drafts: draftPreview() }).map((p) => ({ slug: p.slug })) : []);

/**
 * A page's share image: the route beside it (`share.png/route*.tsx`) draws it at build time. The
 * query is a hash of what the image shows, so a changed image gets a new address and caches let go.
 */
export function withShareImage(meta: Metadata, lang: Lang, key: string, words: { alt: string; seed: string }): Metadata {
  const path = href(lang, key === '/' ? '/share.png' : `${key}/share.png`);
  // Every image also draws the name and the domain.
  const seed = [L(lang).site.name, getContent().site.domain, words.seed].join('\n');
  const image = { url: `${path}?${createHash('sha1').update(seed).digest('hex').slice(0, 12)}`, width: 1200, height: 630, alt: words.alt, type: 'image/png' };
  return { ...meta, openGraph: { ...meta.openGraph, images: [image] }, twitter: { card: 'summary_large_image', images: [image] } };
}
const sectionImage = (meta: Metadata, lang: Lang, section: Section | 'home') => {
  const w = shareWords(lang, section);
  return withShareImage(meta, lang, section === 'home' ? '/' : `/${section}`, { alt: w.alt, seed: `${w.title}\n${w.text}` });
};

export const homeMetadata = (lang: Lang): Metadata => sectionImage(pageMetadata(lang, '/', undefined, L(lang).site.description), lang, 'home');
export function projectsMetadata(lang: Lang): Metadata {
  const base = pageMetadata(lang, '/projects', L(lang).projects!.title, L(lang).projects!.description);
  // The Markdown index is the main language's.
  return sectionImage(lang === getContent().primary ? { ...base, alternates: { ...base.alternates, types: { 'text/markdown': '/projects.md' } } } : base, lang, 'projects');
}
export const workMetadata = (lang: Lang): Metadata => {
  const w = L(lang).work!;
  return sectionImage(pageMetadata(lang, '/work', w.title, fill(w.description, { price: w.price })), lang, 'work');
};
export const aboutMetadata = (lang: Lang): Metadata => sectionImage(pageMetadata(lang, '/about', L(lang).about!.title, L(lang).about!.description), lang, 'about');

function feedLink(lang: Lang) {
  const { blog, site } = L(lang);
  return { 'application/rss+xml': [{ url: feedPath(lang), title: `${blog!.title} – ${site.name}` }] };
}
export const blogMetadata = (lang: Lang): Metadata => {
  const base = pageMetadata(lang, '/blog', L(lang).blog!.title, L(lang).blog!.description);
  return sectionImage({ ...base, alternates: { ...base.alternates, types: feedLink(lang) } }, lang, 'blog');
};

export function postMetadata(lang: Lang, slug: string): Metadata {
  const post = getPost(lang, slug, { drafts: draftPreview() });
  if (!post) return {};
  const base = pageMetadata(lang, `/blog/${slug}`, post.title, post.summary || '');
  // A post shares the blog's image.
  return sectionImage({
    ...base,
    ...(post.summary ? {} : { description: undefined }),
    alternates: { ...base.alternates, types: feedLink(lang) },
    openGraph: { ...base.openGraph, type: 'article', title: post.title, description: post.summary || undefined, publishedTime: post.date },
    ...(post.draft ? { robots: { index: false, follow: false } } : {}),
  }, lang, 'blog');
}

export function projectPageMetadata(lang: Lang, slug: string): Metadata {
  const project = getProject(slug);
  if (!project || !hasPage(project, lang)) return {};
  const doc = project.docs[lang]!;
  const alt = `${doc.title}: ${doc.summary}`;
  return withShareImage(projectMetadata(project, lang), lang, `/projects/${slug}`, { alt, seed: JSON.stringify([doc, project.install, project.version]) });
}

/** A share image's title and line for a section page, and its alt text. */
export function shareWords(lang: Lang, section: Section | 'home'): { title: string; text: string; alt: string } {
  const l = L(lang);
  const name = l.site.name;
  const pick = {
    home: () => ({ title: name, text: l.site.description }),
    projects: () => ({ title: l.projects!.title, text: l.projects!.description }),
    work: () => ({ title: l.work!.title, text: fill(l.work!.description, { price: l.work!.price }) }),
    about: () => ({ title: l.about!.title, text: l.about!.description }),
    blog: () => ({ title: l.blog!.title, text: l.blog!.description }),
  }[section]();
  return { ...pick, alt: section === 'home' ? `${name}: ${pick.text}` : `${pick.title} – ${name}. ${pick.text}` };
}

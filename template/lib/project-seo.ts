// Metadata and JSON-LD for the project pages, in each page's own language.
import type { Metadata } from 'next';
import { getContent, href, type Lang } from './content';
import { jsonLdIds, openGraphBase } from './site';
import { projectPath, type Project } from './projects';
import { alternates } from './routes';

export function projectMetadata(project: Project, lang: Lang): Metadata {
  const doc = project.docs[lang]!;
  const path = projectPath(project.slug, lang);
  const pair = alternates(`/projects/${project.slug}`);
  return {
    title: doc.title,
    description: doc.summary,
    alternates: { canonical: path, ...(pair ?? {}), types: { 'text/markdown': `${path}.md` } },
    // A page-level openGraph object replaces the layout's, so siteName and locale are repeated here.
    openGraph: { ...openGraphBase(lang, { twin: Boolean(pair) }), title: doc.title, description: doc.summary, url: path },
  };
}

/** The project as schema.org SoftwareSourceCode (a skill) or CreativeWork (plain), described in the page's language. */
export function projectJsonLd(project: Project, lang: Lang) {
  const doc = project.docs[lang]!;
  const url = `${getContent().url}${projectPath(project.slug, lang)}`;
  const author = { '@id': jsonLdIds.person() }; // the layout's Person
  if (project.kind === 'plain')
    return {
      '@context': 'https://schema.org',
      '@type': 'CreativeWork',
      '@id': `${url}#work`,
      name: doc.title,
      description: doc.summary,
      url,
      inLanguage: lang,
      ...(project.link ? { sameAs: project.link } : {}),
      ...(project.updated ? { dateModified: project.updated } : {}),
      ...(doc.category ? { genre: doc.category } : {}),
      author,
    };
  const spdx = /^[\w.+-]+$/.test(project.license) ? `https://spdx.org/licenses/${project.license}.html` : undefined;
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareSourceCode',
    '@id': `${url}#software`,
    name: project.slug,
    headline: doc.title,
    description: doc.summary,
    url,
    inLanguage: lang,
    codeRepository: project.repoUrl,
    ...(spdx ? { license: spdx } : {}),
    ...(project.version ? { version: project.version } : {}),
    ...(project.updated ? { dateModified: project.updated } : {}),
    genre: doc.category,
    author,
  };
}

/** A page's metadata: title (none for a home: the layout's name), description, canonical address, hreflang. */
export function pageMetadata(lang: Lang, key: string, title: string | undefined, description: string): Metadata {
  const pair = alternates(key);
  const path = href(lang, key);
  return {
    ...(title ? { title } : {}),
    description,
    alternates: { canonical: path, ...(pair ?? {}) },
    openGraph: { ...openGraphBase(lang, { twin: Boolean(pair) }), url: path },
  };
}

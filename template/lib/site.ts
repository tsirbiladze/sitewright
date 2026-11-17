// What every page of a language shares: the mailto links, the one call to action that leads to the
// Work page, the structured data (Person and WebSite), and the Open Graph basics.
import { fill, getContent, has, href, L, other, type Lang } from './content';
import { isPlaceholder } from './schema';

export type { Lang } from './content';

export const siteUrl = () => getContent().url;

/** Whether the email address is given. While it is a `[[placeholder]]` nothing links to it: the pages draw it as one. */
export const hasEmail = () => !isPlaceholder(getContent().site.email);

/** A mailto: link to the site's address, with a subject and the first lines of a message; null while the address is a placeholder. */
export function mailto(subject?: string, body?: string): string | null {
  if (!hasEmail()) return null;
  const params = [subject && `subject=${encodeURIComponent(subject)}`, body && `body=${encodeURIComponent(body)}`].filter(Boolean);
  return `mailto:${getContent().site.email}${params.length ? `?${params.join('&')}` : ''}`;
}

/**
 * The call to action most pages end with. With a Work page in this language: the way there, its price
 * in the button. Without one: an email to the person (null while the address is a placeholder).
 */
export function mainCta(lang: Lang): { href: string | null; label: string } {
  const l = L(lang);
  if (l.work) return { href: href(lang, '/work'), label: fill(l.work.teaser.button, { price: l.work.price }) };
  return { href: mailto(l.site.contact.subject), label: l.site.contact.button };
}

/** A link's address shown as text: no scheme, no www. */
export const bareUrl = (url: string) => url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

/** Stable JSON-LD ids, so page-level data (a project as SoftwareSourceCode) can point at the same person. */
export const jsonLdIds = {
  person: () => `${siteUrl()}/#person`,
  website: (lang: Lang) => `${siteUrl()}${href(lang, '/') === '/' ? '' : href(lang, '/')}#website`,
};

/** The person's profiles that are real links (a placeholder is not). */
export const realLinks = () => getContent().site.links.filter((l) => /^https:\/\//.test(l.url));

/** Person and WebSite for every page of a language (rendered by the root layouts). Facts only. */
export function siteJsonLd(lang: Lang) {
  const url = siteUrl();
  const l = L(lang);
  const alt = other(lang);
  const home = href(lang, '/');
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Person',
        '@id': jsonLdIds.person(),
        name: l.site.name,
        ...(alt ? { alternateName: L(alt).site.name } : {}),
        jobTitle: l.site.jobTitle,
        url,
        ...(hasEmail() ? { email: `mailto:${getContent().site.email}` } : {}),
        sameAs: realLinks().map((x) => x.url),
      },
      {
        '@type': 'WebSite',
        '@id': jsonLdIds.website(lang),
        url: home === '/' ? url : `${url}${home}`,
        name: l.site.name,
        inLanguage: lang,
        author: { '@id': jsonLdIds.person() },
        publisher: { '@id': jsonLdIds.person() },
      },
    ],
  };
}

/** JSON for a <script type="application/ld+json">, with `<` escaped so the text can't close the tag. */
export const jsonLdScript = (data: unknown) => JSON.stringify(data).replace(/</g, '\\u003c');

/**
 * Open Graph fields every page of a language shares. A page that sets its own `openGraph` replaces
 * the layout's whole object, so spread this in: `openGraph: { ...openGraphBase('en'), title, url }`.
 * `alternateLocale` names the other language's locale when the page exists in it too.
 */
export function openGraphBase(lang: Lang, { twin = false } = {}) {
  const alt = other(lang);
  return {
    siteName: L(lang).site.name,
    locale: L(lang).ui.locale,
    type: 'website' as const,
    ...(twin && alt ? { alternateLocale: [L(alt).ui.locale] } : {}),
  };
}

/** Whether the language has a section's page (re-exported for components). */
export { has, href };

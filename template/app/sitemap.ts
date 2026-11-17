import type { MetadataRoute } from 'next';
import { getContent } from '@/lib/content';
import { routes } from '@/lib/routes';

export const dynamic = 'force-static';

// Every public page (lib/routes.ts). Pages that exist in both languages list each other (hreflang);
// the dates are real ones only: a project's release or date, a post's own date.
export default function sitemap(): MetadataRoute.Sitemap {
  const { url } = getContent();
  const all = routes();
  return all.map((r) => {
    const twins = all.filter((x) => x.key === r.key);
    return {
      url: `${url}${r.path}`,
      ...(r.lastModified ? { lastModified: r.lastModified } : {}),
      ...(twins.length > 1 ? { alternates: { languages: Object.fromEntries(twins.map((x) => [x.lang, `${url}${x.path}`])) } } : {}),
    };
  });
}

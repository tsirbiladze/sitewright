import type { MetadataRoute } from 'next';
import { getContent } from '@/lib/content';

export const dynamic = 'force-static';

export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: '*', allow: '/', disallow: '/md/' }], sitemap: `${getContent().url}/sitemap.xml` };
}

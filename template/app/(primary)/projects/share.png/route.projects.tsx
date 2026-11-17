import { shareImage } from '@/lib/og';
import { getContent } from '@/lib/content';
import { shareWords } from '@/lib/pages';

// This page's share image (Open Graph, Twitter), drawn at build time; the page's metadata points here
// (lib/pages.ts). A route file named for its section, so it exists only while the section is on.
export const dynamic = 'force-static';

export function GET() {
  const lang = getContent().primary;
  const { title, text } = shareWords(lang, 'projects');
  return shareImage({ lang, title, text });
}

import { shareImage } from '@/lib/og';
import { secondParams, shareWords } from '@/lib/pages';

// This page's share image in the second language, drawn at build time (see app/(primary)/about/share.png).
export const dynamic = 'force-static';
export const dynamicParams = false;
export const generateStaticParams = () => secondParams('about');

export async function GET(_req: Request, { params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const { title, text } = shareWords(lang, 'about');
  return shareImage({ lang, title, text });
}

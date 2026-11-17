import { blogFeed } from '@/lib/blog';
import { secondParams } from '@/lib/pages';

// RSS 2.0 for the second language's blog, written at build time (published posts only).
export const dynamic = 'force-static';
export const dynamicParams = false;
export const generateStaticParams = () => secondParams('blog');

export async function GET(_req: Request, { params }: { params: Promise<{ lang: string }> }) {
  return new Response(blogFeed((await params).lang), { headers: { 'content-type': 'application/rss+xml; charset=utf-8' } });
}

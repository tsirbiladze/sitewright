import { getContent } from '@/lib/content';
import { blogFeed } from '@/lib/blog';

// RSS 2.0 for the main language's blog, written at build time (published posts only).
export const dynamic = 'force-static';

export function GET() {
  return new Response(blogFeed(getContent().primary), { headers: { 'content-type': 'application/rss+xml; charset=utf-8' } });
}

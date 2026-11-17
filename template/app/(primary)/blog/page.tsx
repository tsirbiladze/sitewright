import type { Metadata } from 'next';
import { BlogIndex } from '@/components/Blog';
import { blogMetadata } from '@/lib/pages';
import { notFound } from 'next/navigation';
import { getContent, has } from '@/lib/content';

// With the blog section off this page is not served: next.config.ts rewrites /blog to the 404 before
// any page (rewritesFor), and the build stores this page as a 404 it never sends.
export function generateMetadata(): Metadata {
  if (!has(getContent().primary, 'blog')) return {};
  return blogMetadata(getContent().primary);
}

export default function Page() {
  if (!has(getContent().primary, 'blog')) notFound();
  return <BlogIndex lang={getContent().primary} />;
}

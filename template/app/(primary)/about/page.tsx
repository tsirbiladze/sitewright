import type { Metadata } from 'next';
import { AboutPage } from '@/components/AboutPage';
import { aboutMetadata } from '@/lib/pages';
import { notFound } from 'next/navigation';
import { getContent, has } from '@/lib/content';

// With the about section off this page is not served: next.config.ts rewrites /about to the 404 before
// any page (rewritesFor), and the build stores this page as a 404 it never sends.
export function generateMetadata(): Metadata {
  if (!has(getContent().primary, 'about')) return {};
  return aboutMetadata(getContent().primary);
}

export default function Page() {
  if (!has(getContent().primary, 'about')) notFound();
  return <AboutPage lang={getContent().primary} />;
}

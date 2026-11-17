import type { Metadata } from 'next';
import { WorkPage } from '@/components/WorkPage';
import { workMetadata } from '@/lib/pages';
import { notFound } from 'next/navigation';
import { getContent, has } from '@/lib/content';

// With the work section off this page is not served: next.config.ts rewrites /work to the 404 before
// any page (rewritesFor), and the build stores this page as a 404 it never sends.
export function generateMetadata(): Metadata {
  if (!has(getContent().primary, 'work')) return {};
  return workMetadata(getContent().primary);
}

export default function Page() {
  if (!has(getContent().primary, 'work')) notFound();
  return <WorkPage lang={getContent().primary} />;
}

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { secondParams } from '@/lib/pages';

// The second language's 404 as a prebuilt page. Every address under /<code>/ that no route takes is
// rewritten here (next.config.ts, a `fallback` rewrite, which Next applies only after every page and
// dynamic route has missed), so real routes always win and an unknown address is served from the
// build, status 404, inside the second language's layout. notFound() at build time stores the page
// with status 404 and the ../not-found.tsx body.
//
// Next takes ../not-found.tsx's title and og:url only when resolving metadata throws notFound(); a
// notFound() in the page alone would keep the layout's title.
export const dynamicParams = false;
export const generateStaticParams = () => secondParams();

export function generateMetadata(): Metadata {
  notFound();
}

export default function Missing() {
  notFound();
}

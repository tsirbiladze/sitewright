import type { Metadata } from 'next';
import { ProjectsIndex } from '@/components/ProjectsIndex';
import { projectsMetadata } from '@/lib/pages';
import { notFound } from 'next/navigation';
import { getContent, has } from '@/lib/content';

// With the projects section off this page is not served: next.config.ts rewrites /projects to the 404 before
// any page (rewritesFor), and the build stores this page as a 404 it never sends.
export function generateMetadata(): Metadata {
  if (!has(getContent().primary, 'projects')) return {};
  return projectsMetadata(getContent().primary);
}

export default function Page() {
  if (!has(getContent().primary, 'projects')) notFound();
  return <ProjectsIndex lang={getContent().primary} />;
}

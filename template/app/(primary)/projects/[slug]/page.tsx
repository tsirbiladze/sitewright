import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
// The reading face for long Latin-script text, or none for Georgian (next.config.ts, fontAliases).
import { readingClass } from 'site-fonts/reading-primary';
import { ProjectPage } from '@/components/ProjectPage';
import { getContent } from '@/lib/content';
import { getProject, hasPage } from '@/lib/projects';
import { projectPageMetadata, projectParams } from '@/lib/pages';

type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;
export const generateStaticParams = () => projectParams(getContent().primary);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return projectPageMetadata(getContent().primary, (await params).slug);
}

export default async function Page({ params }: Props) {
  const lang = getContent().primary;
  const project = getProject((await params).slug);
  if (!project || !hasPage(project, lang)) notFound();
  return <ProjectPage project={project} lang={lang} readingClass={readingClass} />;
}

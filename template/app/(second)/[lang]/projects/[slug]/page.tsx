import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
// The reading face for long Latin-script text, or none for Georgian (next.config.ts, fontAliases).
import { readingClass } from 'site-fonts/reading-second';
import { ProjectPage } from '@/components/ProjectPage';
import { getProject, hasPage } from '@/lib/projects';
import { projectPageMetadata, projectParams, secondLang, secondParams } from '@/lib/pages';

type Props = { params: Promise<{ lang: string; slug: string }> };

export const dynamicParams = false;
export const generateStaticParams = () => secondParams('projects').flatMap(({ lang }) => projectParams(lang).map((p) => ({ lang, ...p })));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return projectPageMetadata(await secondLang(params), (await params).slug);
}

export default async function Page({ params }: Props) {
  const lang = await secondLang(params);
  const project = getProject((await params).slug);
  if (!project || !hasPage(project, lang)) notFound();
  return <ProjectPage project={project} lang={lang} readingClass={readingClass} />;
}

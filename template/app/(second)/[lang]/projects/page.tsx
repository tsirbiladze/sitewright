import type { Metadata } from 'next';
import { ProjectsIndex } from '@/components/ProjectsIndex';
import { projectsMetadata } from '@/lib/pages';
import { secondLang, secondParams } from '@/lib/pages';

type Props = { params: Promise<{ lang: string }> };

export const dynamicParams = false;
export const generateStaticParams = () => secondParams('projects');

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return projectsMetadata(await secondLang(params));
}

export default async function Page({ params }: Props) {
  const lang = await secondLang(params);
  return <ProjectsIndex lang={lang} />;
}

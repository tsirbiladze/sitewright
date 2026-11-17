import { getProject } from '@/lib/projects';
import { projectOgImage } from '@/lib/og-project';
import { projectParams, secondParams } from '@/lib/pages';

// A project page's share image in the second language, drawn at build time.
export const dynamic = 'force-static';
export const dynamicParams = false;
export const generateStaticParams = () => secondParams('projects').flatMap(({ lang }) => projectParams(lang).map((p) => ({ lang, ...p })));

export async function GET(_req: Request, { params }: { params: Promise<{ lang: string; slug: string }> }) {
  const { lang, slug } = await params;
  return projectOgImage(getProject(slug)!, lang);
}

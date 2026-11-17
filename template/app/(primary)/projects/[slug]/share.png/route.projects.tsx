import { getContent } from '@/lib/content';
import { getProject } from '@/lib/projects';
import { projectOgImage } from '@/lib/og-project';
import { projectParams } from '@/lib/pages';

// A project page's share image, drawn at build time, one per project page, in the page's language.
export const dynamic = 'force-static';
export const dynamicParams = false;
export const generateStaticParams = () => projectParams(getContent().primary);

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  return projectOgImage(getProject((await params).slug)!, getContent().primary);
}

import { projectMarkdown, markdownResponse } from '@/lib/agent-md';
import { getContent } from '@/lib/content';
import { getProject, hasPage } from '@/lib/projects';
import { projectParams } from '@/lib/pages';

// The Markdown twin of every project page; /projects/<slug>.md and /<code>/projects/<slug>.md are
// rewritten here (next.config.ts).
export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return getContent().languages.flatMap((lang) => projectParams(lang).map((p) => ({ lang, ...p })));
}

export async function GET(_req: Request, { params }: { params: Promise<{ lang: string; slug: string }> }) {
  const { lang, slug } = await params;
  const project = getProject(slug);
  if (!project || !getContent().languages.includes(lang) || !hasPage(project, lang)) return markdownResponse('Not found', 'text/plain', 404);
  return markdownResponse(projectMarkdown(project, lang));
}

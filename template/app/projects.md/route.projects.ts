import { projectsIndexMarkdown, markdownResponse } from '@/lib/agent-md';

// The main language's projects as Markdown: a route only while the projects section is on.
export const dynamic = 'force-static';

export function GET() {
  return markdownResponse(projectsIndexMarkdown());
}

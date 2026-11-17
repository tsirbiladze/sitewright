import { llmsTxt, markdownResponse } from '@/lib/agent-md';

export const dynamic = 'force-static';

export function GET() {
  return markdownResponse(llmsTxt(), 'text/plain');
}

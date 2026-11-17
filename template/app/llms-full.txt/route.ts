import { llmsFullTxt, markdownResponse } from '@/lib/agent-md';

export const dynamic = 'force-static';

export function GET() {
  return markdownResponse(llmsFullTxt(), 'text/plain');
}

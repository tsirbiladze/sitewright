// A Claude Code hook (PreToolUse, Bash; set in .claude/settings.json): refuses a command that would
// change what the public sees unless it carries the owner's mark. That is `pnpm go-live`, `pnpm domain`
// (not `pnpm domain --check`), and a Vercel CLI command that would deploy to production, move an alias,
// or change a domain, DNS or the project's Git connection. `pnpm preview` is how a preview is deployed.
//
// After the owner's yes in the conversation, such a step is run with SITE_GO_LIVE=<the site's domain>
// written in front of the command: the mark lifts the guard for that command, and shows in the
// transcript. The domain is `domain` in content/site.json, read each time; while it is a placeholder,
// no mark lifts the guard. pnpm go-live and pnpm domain check the same mark themselves
// (scripts/lib/vercel.mjs), so the rule holds in agents without this hook too.
//
// stdin: the hook's JSON, { tool_input: { command } }. stdout: a "deny" decision, or nothing.
// A guard against a slip, not a wall: a command hidden in `sh -c '…'`, in a script or in a heredoc
// is not read.
import { text } from 'node:stream/consumers';
import { fileURLToPath } from 'node:url';
import { readDomain } from './lib/vercel.mjs';

const siteRoot = fileURLToPath(new URL('..', import.meta.url));

/** One command of a line, when it runs the Vercel CLI: group 1 is its leading assignments, group 2 what follows `vercel` (or `vc`). */
const VERCEL = /^(?:env\s+)?((?:\w+=\S*\s+)*)(?:(?:npx|pnpx|bunx)\s+(?:-\S+\s+)*|pnpm\s+(?:dlx|exec)\s+|yarn\s+dlx\s+)?(?:vercel|vc)(?:@\S+)?(?:\s+(.*))?$/s;

/** One command of a line, when it runs go-live or domain: group 1 its leading assignments, group 2 which, group 3 its arguments. */
const SCRIPT = /^(?:env\s+)?((?:\w+=\S*\s+)*)(?:pnpm\s+(?:run\s+)?|npm\s+run\s+|yarn\s+(?:run\s+)?|node\s+(?:--\S+\s+)*(?:\.\/)?scripts\/)(go-live|domain)(?:\.mjs)?(?:\s+(.*))?$/s;

/** Arguments of the Vercel CLI that reach production, a domain or the Git connection. */
const OFF_LIMITS = [
  [/(?:^|\s)--prod(?:\s|=|$)/, '--prod', 'target'],
  [/(?:^|\s)--(?:target|environment)(?:=|\s+)production(?:\s|$)/, 'production as the target', 'target'],
  // `api` can do all of the above, so it is treated as they are.
  [/(?:^|\s)(promote|rollback|redeploy|alias|domains|dns|git|api)(?:\s|$)/, null],
];

/** `vercel list` only reads: its production filter (`pnpm preview` asks with it) changes nothing. */
const LISTING = /(?:^|\s)(?:list|ls)(?:\s|$)/;

/** A heredoc's body is text for another program, not commands of this line. */
const withoutHeredocs = (command) => command.replace(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n[ \t]*\2(?=\n|$)/g, '');

/** The site's domain, or null while it is missing or a placeholder. */
export function siteDomain(root = siteRoot) {
  return readDomain(root).domain ?? null;
}

/** Why `command` is refused, or null when it may run. `domain` is the site's (content/site.json). */
export function refusal(command, domain = siteDomain()) {
  const mark = domain ? `SITE_GO_LIVE=${domain}` : null;
  const marked = (assignments) => mark !== null && assignments.split(/\s+/).includes(mark);
  const how = domain
    ? `after the owner's yes in this conversation, run it with \`SITE_GO_LIVE=${domain}\` in front`
    : 'no mark can lift this while content/site.json "domain" is missing or still a placeholder';
  for (const part of withoutHeredocs(command).split(/&&|\|\||\$\(|[;|\n()`]/)) {
    const line = part.trim();
    const script = SCRIPT.exec(line);
    if (script) {
      const [, assignments, name, args = ''] = script;
      if (name === 'domain' && /(?:^|\s)--check(?:\s|$)/.test(args)) continue;
      if (marked(assignments)) continue;
      return `\`pnpm ${name}\` changes what the public sees, so it is the owner's to allow (AGENTS.md): ${how}.`;
    }
    const [, assignments, args] = VERCEL.exec(line) ?? [];
    if (args === undefined || marked(assignments)) continue;
    for (const [pattern, name, kind] of OFF_LIMITS) {
      if (kind === 'target' && LISTING.test(args)) continue;
      const hit = pattern.exec(args);
      if (hit)
        return `\`vercel\` with ${name ?? `\`${hit[1]}\``} is off limits here: production, domains, DNS and the project's Git connection are the owner's (AGENTS.md). Deploy a preview with \`pnpm preview\`; take the site live with \`pnpm go-live\` and put the domain on with \`pnpm domain\`: ${how}.`;
    }
  }
  return null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let command = '';
  try {
    command = JSON.parse(await text(process.stdin)).tool_input?.command ?? '';
  } catch {
    // Not the hook's JSON: nothing to judge.
  }
  const reason = typeof command === 'string' ? refusal(command) : null;
  if (reason) console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }));
}

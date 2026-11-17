// scripts/no-production.mjs, the hook that keeps go-live, domain and the Vercel CLI's production
// commands behind the owner's mark, and its wiring in .claude/settings.json. The site's domain is given
// to `refusal` here; the hook itself reads it from content/site.json beside it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const script = join(root, 'scripts/no-production.mjs');
const { refusal, siteDomain } = (await import(script)) as { refusal: (command: string, domain?: string | null) => string | null; siteDomain: (root?: string) => string | null };
const CONFIG = '--global-config /home/someone/.config/vercel-site';
const D = 'example.com';
const refused = (command: string, domain: string | null = D) => refusal(command, domain);

test('refuses the Vercel CLI when it would reach production, a domain or the Git connection', () => {
  const commands = [
    'vercel --prod',
    'vercel deploy --prod --yes',
    'vercel deploy --prebuilt --prod',
    `npx -y vercel@65.8.0 deploy --prod ${CONFIG}`,
    'npx vercel --prod',
    'pnpm dlx vercel deploy --prod',
    'bunx vercel@latest --prod',
    'vc --prod',
    'vercel deploy --target production',
    'vercel deploy --target=production',
    'npx -y vercel@65.8.0 deploy --environment production --yes',
    'vercel deploy --environment=production',
    'vercel promote site-abc123.vercel.app',
    `npx -y vercel@65.8.0 promote site-abc123.vercel.app ${CONFIG}`,
    'vercel rollback',
    'vercel redeploy site-abc123.vercel.app',
    'vercel alias set site-abc123.vercel.app example.com',
    `vercel ${CONFIG} alias ls`,
    'vercel domains add example.com',
    'vercel dns add example.com @ A 76.76.21.21',
    'vercel git connect',
    'vercel api /v9/projects/site/domains/www.example.com -X PATCH -f redirect=example.com',
    `npx -y vercel@65.8.0 api /v13/deployments -X POST ${CONFIG}`,
    'env vercel --prod',
    // Inside a longer line.
    'pnpm build && vercel --prod',
    'cd /tmp/site; npx vercel deploy --prod',
    '(cd site && vercel deploy --prod)',
    'VERCEL_ORG_ID=team_x VERCEL_PROJECT_ID=prj_y vercel deploy --prod',
    'echo "$(vercel --prod)"',
    'pnpm test\nvercel --prod',
  ];
  for (const command of commands) {
    const reason = refused(command);
    assert.ok(reason, command);
    assert.match(reason ?? '', /are the owner's \(AGENTS\.md\)\. Deploy a preview with `pnpm preview`; take the site live with `pnpm go-live`/, command);
    assert.match(reason ?? '', /run it with `SITE_GO_LIVE=example\.com` in front/, command);
  }
  assert.match(refused('vercel deploy --prod') ?? '', /with --prod is off limits here/);
  assert.match(refused('vercel dns ls') ?? '', /with `dns` is off limits here/);
});

test('refuses `pnpm go-live` and `pnpm domain`, in every way they are run, but not `pnpm domain --check`', () => {
  for (const command of ['pnpm go-live', 'pnpm run go-live', 'npm run go-live', 'yarn go-live', 'node scripts/go-live.mjs', 'node --use-env-proxy ./scripts/go-live.mjs', 'pnpm domain', 'pnpm run domain', 'node scripts/domain.mjs', 'pnpm build && pnpm go-live', 'env pnpm go-live']) {
    const reason = refused(command);
    assert.ok(reason, command);
    assert.match(reason ?? '', /^`pnpm (go-live|domain)` changes what the public sees, so it is the owner's to allow \(AGENTS\.md\): after the owner's yes in this conversation, run it with `SITE_GO_LIVE=example\.com` in front\.$/, command);
  }
  for (const command of ['pnpm domain --check', 'pnpm run domain --check', 'pnpm domain -- --check', 'node scripts/domain.mjs --check', 'pnpm preview', 'pnpm test', 'pnpm check'])
    assert.equal(refused(command), null, command);
});

test('lets previews, read-only commands and everything that is not the Vercel CLI through', () => {
  const allowed = [
    'pnpm preview',
    `npx -y vercel@65.8.0 deploy --environment preview --yes ${CONFIG}`,
    'vercel deploy --environment=preview',
    `npx -y vercel@65.8.0 inspect site-abc123.vercel.app --json --wait ${CONFIG}`,
    'vercel inspect site-abc123.vercel.app --logs',
    'vercel ls',
    'vercel list --environment production --format json',
    'vercel whoami',
    'vercel remove site-abc123.vercel.app --yes',
    'vercel link',
    // Words that only look like the forbidden ones.
    'vercel deploy --environment preview --meta note=production-like',
    'vercel inspect site-git-main.vercel.app',
    // Not the Vercel CLI at all.
    'git commit -m "vercel --prod is off limits"',
    'grep -rn "vercel --prod" README.md',
    'NODE_ENV=production pnpm build',
    'git push origin main',
    'pnpm exec next build',
    'echo vercel --prod',
    'echo pnpm go-live',
    'cat scripts/go-live.mjs',
    // A heredoc's body is text for another program.
    "cat > notes.md <<'EOF'\nvercel deploy --prod\npnpm go-live\nEOF",
    'python3 - <<PY\nprint("x")\nvercel domains add example.com\nPY\ngit status',
    '',
  ];
  for (const command of allowed) assert.equal(refused(command), null, command);
  // What follows a heredoc on the same line of commands is still read.
  assert.ok(refused("cat > notes.md <<'EOF'\nsome text\nEOF\nvercel deploy --prod"));
});

test('after the owner’s yes: SITE_GO_LIVE=<the site’s domain> in front of a command lifts the guard for that command only', () => {
  const lifted = [
    'SITE_GO_LIVE=example.com pnpm go-live',
    'SITE_GO_LIVE=example.com pnpm domain',
    'env SITE_GO_LIVE=example.com pnpm go-live',
    'SITE_GO_LIVE=example.com vercel deploy --prod --yes',
    `SITE_GO_LIVE=example.com npx -y vercel@65.8.0 domains add example.com ${CONFIG}`,
    'VERCEL_ORG_ID=team_x SITE_GO_LIVE=example.com vercel promote site-abc123.vercel.app',
    'pnpm test && SITE_GO_LIVE=example.com pnpm go-live',
  ];
  for (const command of lifted) assert.equal(refused(command), null, command);
  const still = [
    'SITE_GO_LIVE=other.example.org pnpm go-live',
    'SITE_GO_LIVE= pnpm go-live',
    'SITE_GO_LIVE=1 vercel deploy --prod',
    'SITE_GO_LIVE=www.example.com pnpm domain',
    // The mark is on another command of the line.
    'SITE_GO_LIVE=example.com pnpm build && pnpm go-live',
    'SITE_GO_LIVE=example.com vercel inspect x.vercel.app; vercel deploy --prod',
    // An argument is not a mark.
    'pnpm go-live SITE_GO_LIVE=example.com',
    'vercel deploy --prod --meta SITE_GO_LIVE=example.com',
  ];
  for (const command of still) assert.ok(refused(command), command);
});

test('while the domain is missing or a placeholder, no mark lifts the guard, and the refusal says why', () => {
  for (const command of ['SITE_GO_LIVE=example.com pnpm go-live', 'SITE_GO_LIVE=[[domain]] pnpm go-live', 'SITE_GO_LIVE= vercel --prod']) {
    const reason = refused(command, null);
    assert.match(reason ?? '', /no mark can lift this while content\/site\.json "domain" is missing or still a placeholder/, command);
  }
  assert.equal(refused('pnpm preview', null), null);
});

test('the hook reads the domain from the content beside it: a domain, or nothing while it is a placeholder', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hook-test-'));
  try {
    mkdirSync(join(dir, 'content'));
    writeFileSync(join(dir, 'content/site.json'), JSON.stringify({ domain: 'elisabed.example.org' }));
    assert.equal(siteDomain(dir), 'elisabed.example.org');
    writeFileSync(join(dir, 'content/site.json'), JSON.stringify({ domain: '[[the domain]]' }));
    assert.equal(siteDomain(dir), null);
    rmSync(join(dir, 'content/site.json'));
    assert.equal(siteDomain(dir), null);

    // As a hook in a site of its own: a copy of the script and its library beside that content.
    mkdirSync(join(dir, 'scripts/lib'), { recursive: true });
    cpSync(script, join(dir, 'scripts/no-production.mjs'));
    cpSync(join(root, 'scripts/lib/vercel.mjs'), join(dir, 'scripts/lib/vercel.mjs'));
    writeFileSync(join(dir, 'content/site.json'), JSON.stringify({ domain: 'elisabed.example.org' }));
    const hook = (command: string) => spawnSync(process.execPath, [join(dir, 'scripts/no-production.mjs')], { input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }), encoding: 'utf8' });
    assert.equal(hook('SITE_GO_LIVE=elisabed.example.org pnpm go-live').stdout, '');
    assert.match(hook('SITE_GO_LIVE=example.com pnpm go-live').stdout, /SITE_GO_LIVE=elisabed\.example\.org/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('as a hook: prints a deny decision for a refused command and nothing for any other', () => {
  const hook = (input: string) => spawnSync(process.execPath, [script], { input, encoding: 'utf8' });
  const denied = hook(JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'npx -y vercel@65.8.0 deploy --prod' } }));
  assert.equal(denied.status, 0, denied.stderr);
  const out = JSON.parse(denied.stdout).hookSpecificOutput;
  assert.equal(out.hookEventName, 'PreToolUse');
  assert.equal(out.permissionDecision, 'deny');
  assert.match(out.permissionDecisionReason, /pnpm preview/);
  assert.match(JSON.parse(hook(JSON.stringify({ tool_input: { command: 'pnpm go-live' } })).stdout).hookSpecificOutput.permissionDecisionReason, /changes what the public sees/);

  for (const input of [JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'pnpm preview' } }), JSON.stringify({ tool_name: 'Bash', tool_input: {} }), 'not json', '']) {
    const res = hook(input);
    assert.equal(res.status, 0, input);
    assert.equal(res.stdout, '', input);
  }
});

test('.claude/settings.json runs the hook before every Bash command', () => {
  const settings = JSON.parse(readFileSync(join(root, '.claude/settings.json'), 'utf8'));
  const bash = settings.hooks.PreToolUse.filter((entry: { matcher: string }) => entry.matcher === 'Bash');
  assert.equal(bash.length, 1);
  assert.deepEqual(bash[0].hooks, [{ type: 'command', command: 'node "$CLAUDE_PROJECT_DIR/scripts/no-production.mjs"', timeout: 10 }]);
});

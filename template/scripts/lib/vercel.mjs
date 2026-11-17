// What `pnpm preview`, `pnpm go-live` and `pnpm domain` share: the site's domain read from the
// content, the owner's mark, the checks that stop a run early (each with one line that names the fix),
// the pinned Vercel CLI, and the checks and build that come before a deployment.
//
// Exit codes, the same in the three commands:
//   2  refused before anything was changed: a wrong option, the domain still a placeholder, no mark,
//      the folder not linked, the CLI not signed in, no production deployment yet (preview);
//   1  a step failed (a check, the build, a Vercel call);
//   3  a deployment went out with the wrong target: tell the owner at once;
//   4  the deployment is out, but its pages were not proven to answer.
//
// The Vercel login: VERCEL_GLOBAL_CONFIG names the CLI's config folder (`--global-config`); without
// it the CLI uses its own. SITE_PNPM and SITE_VERCEL replace the two commands; the tests use them.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Pinned, like every dependency. */
export const VERCEL = 'vercel@65.8.0';

/** The command that runs the pinned CLI, as a person would type it. */
export const vercelCli = `npx -y ${VERCEL}`;

/** A whole value that is only a placeholder, as the content writes one: `[[the domain]]`. */
const isPlaceholder = (value) => /^\[\[[^\]]+\]\]$/.test(value.trim());

/**
 * The site's domain, `domain` in content/site.json, or the one-line problem that stops a command:
 * missing, still a placeholder, or not a bare domain.
 */
export function readDomain(root = process.cwd()) {
  let site;
  try {
    site = JSON.parse(readFileSync(join(root, 'content/site.json'), 'utf8'));
  } catch (err) {
    return { problem: `content/site.json cannot be read (${err.code ?? err.message}): run this from the site's folder, and \`pnpm check\`.` };
  }
  const domain = site?.domain;
  if (typeof domain !== 'string' || !domain.trim()) return { problem: 'content/site.json has no "domain": write the site’s domain there.' };
  if (isPlaceholder(domain))
    return { problem: `content/site.json "domain" is still the placeholder ${domain.trim()}: write the site’s own domain there first (the owner's, or the Vercel project's <name>.vercel.app address until they have one).`, placeholder: true };
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) return { problem: `content/site.json "domain" is "${domain}", not a bare domain like example.com: \`pnpm check\` says what is wrong.` };
  return { domain };
}

/** A domain Vercel gives the project itself: nothing to add, no DNS to set. */
export const isVercelAddress = (domain) => /\.vercel\.app$/.test(domain);

/** Everything a command needs, its messages prefixed with its name. */
export function command(name) {
  const say = (message) => console.log(`${name}: ${message}`);
  /** Stops the run with one line on stderr. */
  const fail = (message, code = 1) => {
    console.error(`${name}: ${message}`);
    process.exit(code);
  };

  const pnpm = process.env.SITE_PNPM ?? 'pnpm';
  const base = process.env.SITE_VERCEL ? [process.env.SITE_VERCEL] : ['npx', '-y', VERCEL];
  const configDir = process.env.VERCEL_GLOBAL_CONFIG;
  const login = configDir ? ['--global-config', configDir] : [];

  /** Runs a command. `capture` keeps its output (to read, or to show on failure) instead of printing it as it comes. */
  function run([cmd, ...args], { capture = false, env = {} } = {}) {
    const res = spawnSync(cmd, args, { encoding: 'utf8', stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit', env: { ...process.env, ...env }, maxBuffer: 64 * 1024 * 1024 });
    if (res.error) fail(`could not run ${cmd}: ${res.error.message}`);
    return { ok: res.status === 0, status: res.status, stdout: res.stdout ?? '', all: `${res.stdout ?? ''}${res.stderr ?? ''}` };
  }

  /**
   * Runs the pinned Vercel CLI, its output captured. `--non-interactive` makes it answer the same way
   * (no prompts, JSON results) whether a person or an agent runs the command; `scope` is the team or
   * account of the linked project, for the commands that do not read the link themselves.
   */
  const vercel = (args, { scope, env } = {}) => run([...base, ...args, ...(scope ? ['--scope', scope] : []), '--non-interactive', ...login], { capture: true, env });

  return {
    say,
    fail,
    run,
    vercel,

    /** Refuses any argument but the ones listed. */
    options(allowed = []) {
      const given = process.argv.slice(2);
      const wrong = given.filter((a) => !allowed.includes(a));
      if (wrong.length)
        fail(`${allowed.length ? `takes only ${allowed.join(', ')}` : 'takes no options'} (got "${given.join(' ')}"). Nothing was run.`, 2);
      return given;
    },

    /** The site's domain; stops when it is missing or still a placeholder. */
    domain() {
      const { domain, problem } = readDomain();
      if (problem) fail(`${problem} Nothing was run.`, 2);
      return domain;
    },

    /**
     * The owner's yes, as a mark the environment carries: SITE_GO_LIVE=<the site's domain>. The script
     * checks it itself, so the rule holds in every agent, with or without a hook.
     */
    mark(domain, what) {
      const given = process.env.SITE_GO_LIVE;
      if (given === domain) return;
      fail(
        `${given ? `SITE_GO_LIVE is "${given}", not this site's domain ${domain}` : 'refuses to run without the owner\'s mark'}. ${what}, so it runs only after the owner has said yes to it in this conversation; ` +
          `the mark records that yes: run \`SITE_GO_LIVE=${domain} pnpm ${name}\` then, and not before. Nothing was run.`,
        2,
      );
    },

    /** The linked Vercel project (.vercel/project.json): its id, its team or account, its name. */
    link() {
      const file = '.vercel/project.json';
      let link = null;
      if (existsSync(file)) {
        try { link = JSON.parse(readFileSync(file, 'utf8')); } catch { link = null; }
      }
      if (!link?.projectId || !link?.orgId)
        fail(`this folder is not linked to a Vercel project (${file} is ${existsSync(file) ? 'not readable' : 'missing'}). Nothing was run. Link it once: \`${vercelCli} project create <name>\` when the project is new, then \`${vercelCli} link --yes --project <name>\`.`, 2);
      return { projectId: link.projectId, orgId: link.orgId, name: link.projectName ?? link.projectId };
    },

    /**
     * Stops when the CLI is not signed in. CI=1 for this one call: without it, a CLI that finds no
     * login starts a browser login and waits for it.
     */
    signedIn() {
      const who = vercel(['whoami'], { env: { CI: '1' } });
      if (!who.ok) {
        const why = /No existing credentials/i.test(who.all) ? 'is not signed in' : `could not tell who is signed in (${lastLine(who.all)})`;
        fail(`the Vercel CLI ${why}. Nothing was run. Sign in with \`${vercelCli} login${configDir ? ` --global-config ${configDir}` : ''}\`, then run this again.`, 2);
      }
    },

    /**
     * pnpm typecheck, pnpm test, pnpm build. Next.js stops an agent's build once when an advisory
     * applies to the installed version (SecurityFatalError, an upgrade reminder): that build is run
     * once more. Of a build that passes, the lines about the skills' docs and the warnings are shown.
     */
    checksAndBuild() {
      for (const check of ['typecheck', 'test']) {
        say(`pnpm ${check}`);
        if (!run([pnpm, check]).ok) fail(`pnpm ${check} failed. Nothing was deployed.`);
      }
      say('pnpm build');
      let build = run([pnpm, 'build'], { capture: true });
      if (!build.ok && build.all.includes('SecurityFatalError')) {
        say('Next.js stopped the build once with its upgrade reminder (an advisory applies to the installed version). Building again.');
        build = run([pnpm, 'build'], { capture: true });
      }
      if (!build.ok) {
        process.stderr.write(build.all);
        fail('pnpm build failed. Nothing was deployed.');
      }
      for (const line of build.all.split('\n')) if (/^skills: |^\s*⚠|\bwarn(ing)?\b/i.test(line)) say(`build: ${line.trim()}`);
    },
  };
}

/** The last line of a command's output that says something. */
export const lastLine = (text) => text.trim().split('\n').map((l) => l.trim()).filter(Boolean).at(-1) ?? 'no output';

/**
 * The last top-level JSON object in a command's output. The CLI may print other lines first (a
 * spinner, "Inspect …", "Production https://…"), and may end with one JSON object.
 */
export function jsonIn(text) {
  let found = null;
  for (let start = text.indexOf('{'); start !== -1; start = text.indexOf('{', start + 1)) {
    let depth = 0, inString = false, escaped = false, end = -1;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
      } else if (ch === '"') inString = true;
      else if (ch === '{') depth++;
      else if (ch === '}' && --depth === 0) { end = i; break; }
    }
    if (end === -1) continue;
    try {
      found = JSON.parse(text.slice(start, end + 1));
      start = end;
    } catch {
      // Not JSON from here: a brace inside a line of text. Try the next one.
    }
  }
  return found;
}

/** The hosts a deployment can have: <name>-<hash>-<team>.vercel.app. */
export const deploymentHost = (text) => /https:\/\/([a-z0-9-]+\.vercel\.app)/.exec(text)?.[1];

// A site folder for the tests of pnpm preview, pnpm go-live and pnpm domain: content/site.json with a
// domain, optionally linked to a Vercel project (.vercel/project.json), with stand-ins for pnpm (a shell
// script) and the Vercel CLI (tests/stand-ins/vercel.mjs) that write down how they were called.
// Nothing reaches the network or Vercel.
import { spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
export const PREVIEW_HOST = 'site-abc123-elisabed.vercel.app';
export const PRODUCTION_HOST = 'site-def456-elisabed.vercel.app';

/** What the stand-in Vercel CLI answers (tests/stand-ins/vercel.mjs reads it). */
export interface VercelState {
  signedIn?: boolean;
  /** READY production deployments the project has (0: none yet). */
  productionDeployments?: number;
  listFails?: boolean;
  deploy?: { target?: string; readyState?: string; productionUrl?: string; fails?: boolean; json?: boolean };
  inspect?: { target?: string; readyState?: string; fails?: boolean };
  domains?: { name: string; apexName?: string; redirect: string | null; redirectStatusCode: number | null; verified?: boolean }[];
  /** Per name: 'pointed' makes `domains verify` answer configured_correctly. */
  dns?: Record<string, 'pointed' | 'not-pointed'>;
  /** The apex of every name, for a subdomain site (otherwise a name less its www). */
  apex?: string;
  noApexName?: boolean;
  noRecords?: boolean;
  addFails?: string;
  patchFails?: string;
  patchIgnored?: boolean;
}

export interface SiteFolder {
  linked?: boolean;
  /** content/site.json "domain". */
  domain?: string;
  vercel?: VercelState;
  /** pnpm: a check that fails, builds that fail before one passes and with what, the pages the build's sitemap lists. */
  failingCheck?: string;
  failingBuilds?: number;
  buildError?: string;
  pages?: string[];
  /** The build writes no sitemap. */
  noSitemap?: boolean;
}

const made: string[] = [];
process.on('exit', () => { for (const dir of made) rmSync(dir, { recursive: true, force: true }); });

/** The sitemap Next writes for these pages of a site at `domain`. */
export const sitemapXml = (domain: string, pages: string[]) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map((p) => `<url>\n<loc>https://${domain}${p === '/' ? '/' : p}</loc>\n</url>\n`).join('')}</urlset>\n`;

export function siteFolder({ linked = true, domain = 'example.com', vercel = {}, failingCheck = '', failingBuilds = 0, buildError = 'SecurityFatalError', pages = ['/', '/work', '/ka'], noSitemap = false }: SiteFolder = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'site-commands-test-'));
  made.push(dir);
  mkdirSync(join(dir, 'content'));
  writeFileSync(join(dir, 'content/site.json'), JSON.stringify({ domain, languages: ['en'] }, null, 2));
  if (linked) {
    mkdirSync(join(dir, '.vercel'));
    writeFileSync(join(dir, '.vercel/project.json'), JSON.stringify({ projectId: 'prj_site', orgId: 'team_elisabed', projectName: 'site' }));
  }
  const log = join(dir, 'calls.log');
  const state = join(dir, 'vercel-state.json');
  writeFileSync(state, JSON.stringify(vercel, null, 2));
  writeFileSync(join(dir, 'sitemap.xml'), sitemapXml(domain, pages));

  const stand = (name: string, body: string) => {
    const file = join(dir, `${name}-stand-in`);
    writeFileSync(file, `#!/bin/sh\n${body}\n`);
    chmodSync(file, 0o755);
    return file;
  };
  const pnpm = stand('pnpm', `echo "pnpm $*" >> "${log}"
if [ "$1" = "${failingCheck}" ]; then echo "$1: 1 failure"; exit 1; fi
if [ "$1" = build ]; then
  n=$(cat "${dir}/builds" 2>/dev/null || echo 0); n=$((n + 1)); echo $n > "${dir}/builds"
  if [ $n -le ${failingBuilds} ]; then echo "Error [${buildError}]: the build stopped" >&2; exit 1; fi
  ${noSitemap ? '' : `mkdir -p "${dir}/.next/server/app" && cp "${dir}/sitemap.xml" "${dir}/.next/server/app/sitemap.xml.body"`}
  echo "skills: demo@v1 fetched (en+ka, 1 image(s))"
  echo "  Generating static pages using 15 workers (31/31)"
  echo "⚠ Your version of Next.js is affected by a known security vulnerability."
fi
exit 0`);
  const vercelCli = stand('vercel', `exec "${process.execPath}" "${join(root, 'tests/stand-ins/vercel.mjs')}" "$@"`);
  const config = join(dir, 'vercel-config');

  /** Runs scripts/<name>.mjs in the folder, asynchronously (a stand-in server in the test process keeps answering). */
  const run = (name: string, args: string[] = [], env: Record<string, string> = {}) =>
    new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
      const base: NodeJS.ProcessEnv = { ...process.env };
      for (const key of ['SITE_GO_LIVE', 'CI', 'VERCEL_GLOBAL_CONFIG', 'SITE_DNS', 'SITE_CONNECT', 'NODE_EXTRA_CA_CERTS']) delete base[key];
      const child = spawn(process.execPath, [join(root, `scripts/${name}.mjs`), ...args], {
        cwd: dir,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...base, SITE_PNPM: pnpm, SITE_VERCEL: vercelCli, STAND_IN_STATE: state, STAND_IN_LOG: log, VERCEL_GLOBAL_CONFIG: config, SITE_RETRY_MS: '10', NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost', ...env },
      });
      let stdout = '', stderr = '';
      child.stdout.on('data', (d: Buffer) => (stdout += d));
      child.stderr.on('data', (d: Buffer) => (stderr += d));
      child.on('close', (status: number | null) => resolve({ status, stdout, stderr }));
    });

  /** Every call of the two stand-ins, in order. */
  const calls = () => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').filter(Boolean) : []);
  /** The Vercel calls only. */
  const vercelCalls = () => calls().filter((c) => c.startsWith('vercel '));
  /** The global flags each Vercel call carried: "<command>: --scope … --non-interactive --global-config …". */
  const globals = () => (existsSync(`${log}.globals`) ? readFileSync(`${log}.globals`, 'utf8').trim().split('\n') : []);
  const vercelState = (): VercelState => JSON.parse(readFileSync(state, 'utf8'));
  return { dir, run, calls, vercelCalls, globals, vercelState, config };
}

// `pnpm go-live` (scripts/go-live.mjs) with stand-ins for pnpm and the Vercel CLI, and a local server
// standing in for the production address: no network, nothing deployed.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import pkg from '../package.json';
import { siteFolder, sitemapXml, PRODUCTION_HOST } from './stand-in';

const script = new URL('../scripts/go-live.mjs', import.meta.url).pathname;
const MARK = { SITE_GO_LIVE: 'example.com' };
const PAGES = ['/', '/work', '/ka', '/ka/work'];

/** A stand-in production address: every page in `pages` answers 200, the sitemap lists `listed`. */
const servers: Server[] = [];
after(() => { for (const s of servers) s.close(); });
async function production({ pages = PAGES, listed = PAGES, missing = [] as string[] } = {}) {
  const asked: string[] = [];
  const server = createServer((req, res) => {
    const path = req.url ?? '/';
    asked.push(path);
    if (path === '/sitemap.xml') return res.writeHead(200, { 'content-type': 'application/xml' }).end(sitemapXml('example.com', listed));
    if (pages.includes(path) && !missing.includes(path)) return res.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><title>page</title>');
    res.writeHead(404).end('not found');
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as { port: number };
  return { url: `http://127.0.0.1:${port}`, asked };
}

test('`pnpm go-live` runs the script, with the proxy the environment names', () => {
  assert.equal(pkg.scripts['go-live'], 'node --use-env-proxy scripts/go-live.mjs');
});

test('with the mark: checks, builds, deploys to production, proves its target and state, and that every page answers 200 there', async () => {
  const prod = await production();
  const p = siteFolder({ pages: PAGES, vercel: { deploy: { productionUrl: prod.url } } });
  const res = await p.run('go-live', [], MARK);
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, new RegExp(`Live: ${prod.url} \\(production deployment https://${PRODUCTION_HOST}; 4 pages and the sitemap answer 200\\)\\n$`));
  assert.deepEqual(p.calls(), [
    'vercel whoami',
    'pnpm typecheck',
    'pnpm test',
    'pnpm build',
    'vercel deploy --prod --yes',
    `vercel inspect ${PRODUCTION_HOST} --json --wait`,
  ]);
  for (const line of p.globals()) assert.match(line, /: --non-interactive --global-config /, line);
  assert.deepEqual([...prod.asked].sort(), [...PAGES, '/sitemap.xml'].sort(), 'every page of the build’s sitemap, and the sitemap');
});

test('without the mark, or with another domain in it, nothing runs, and the refusal says what the mark means', async () => {
  for (const env of [{}, { SITE_GO_LIVE: 'other.example.org' }, { SITE_GO_LIVE: '1' }] as Record<string, string>[]) {
    const p = siteFolder();
    const res = await p.run('go-live', [], env);
    assert.equal(res.status, 2, JSON.stringify(env));
    assert.equal(res.stderr.trim().split('\n').length, 1);
    assert.match(res.stderr, /changes what the public sees, so it runs only after the owner has said yes to it in this conversation; the mark records that yes: run `SITE_GO_LIVE=example\.com pnpm go-live` then, and not before\. Nothing was run\./);
    assert.deepEqual(p.calls(), [], 'not even a check');
  }
});

test('stops early, in one line that names the fix: domain a placeholder, not linked, not signed in', async () => {
  const cases = [
    { folder: siteFolder({ domain: '[[the domain]]' }), env: { SITE_GO_LIVE: '[[the domain]]' }, line: /^go-live: content\/site\.json "domain" is still the placeholder \[\[the domain\]\]/ },
    { folder: siteFolder({ linked: false }), env: MARK, line: /^go-live: this folder is not linked to a Vercel project .*`npx -y vercel@65\.8\.0 link --yes --project <name>`\.$/ },
    { folder: siteFolder({ vercel: { signedIn: false } }), env: MARK, line: /^go-live: the Vercel CLI is not signed in\. Nothing was run\. Sign in with `npx -y vercel@65\.8\.0 login/ },
  ];
  for (const { folder, env, line } of cases) {
    const res = await folder.run('go-live', [], env);
    assert.equal(res.status, 2, res.stderr);
    assert.match(res.stderr.trim(), line);
    assert.equal(res.stderr.trim().split('\n').length, 1);
    assert.ok(!folder.calls().some((c) => c.startsWith('pnpm ') || c.startsWith('vercel deploy')), 'nothing built or deployed');
  }
});

test('takes no options', async () => {
  const p = siteFolder();
  const res = await p.run('go-live', ['--force'], MARK);
  assert.equal(res.status, 2);
  assert.match(res.stderr, /takes no options/);
  assert.deepEqual(p.calls(), []);
  assert.equal(readFileSync(script, 'utf8').match(/'deploy', '(--\w+)'/)?.[1], '--prod', 'the one deployment it makes is production');
});

test('a failing check or build stops the run before anything is deployed; the upgrade reminder gets one more build', async () => {
  for (const failingCheck of ['typecheck', 'test']) {
    const p = siteFolder({ failingCheck });
    const res = await p.run('go-live', [], MARK);
    assert.equal(res.status, 1);
    assert.match(res.stderr, new RegExp(`pnpm ${failingCheck} failed\\. Nothing was deployed\\.`));
    assert.ok(!p.calls().some((c) => c.startsWith('vercel deploy')));
  }
  const prod = await production();
  const once = siteFolder({ pages: PAGES, failingBuilds: 1, vercel: { deploy: { productionUrl: prod.url } } });
  const res = await once.run('go-live', [], MARK);
  assert.equal(res.status, 0, res.stderr);
  assert.equal(once.calls().filter((c) => c === 'pnpm build').length, 2);
  const broken = siteFolder({ failingBuilds: 1, buildError: 'TypeError' });
  assert.equal((await broken.run('go-live', [], MARK)).status, 1);
  assert.ok(!broken.calls().some((c) => c.startsWith('vercel deploy')));
});

test('a build without a sitemap is not deployed: there would be nothing to prove it with', async () => {
  const p = siteFolder({ noSitemap: true });
  const res = await p.run('go-live', [], MARK);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /the build wrote no sitemap at \.next\/server\/app\/sitemap\.xml\.body/);
  assert.ok(!p.calls().some((c) => c.startsWith('vercel deploy')));
});

test('a deployment whose target is not production fails loudly; one not READY, or not inspectable, is not announced', async () => {
  const preview = siteFolder({ vercel: { deploy: { target: 'preview' } } });
  const res = await preview.run('go-live', [], MARK);
  assert.equal(res.status, 3);
  assert.match(res.stderr, /is NOT production: its target is "preview"\. Tell the owner at once/);
  assert.doesNotMatch(res.stdout, /Live:/);

  const error = siteFolder({ vercel: { deploy: { readyState: 'ERROR' } } });
  const out = await error.run('go-live', [], MARK);
  assert.equal(out.status, 1);
  assert.match(out.stderr, /is a production deployment, but its state is ERROR/);

  const lost = siteFolder({ vercel: { inspect: { fails: true } } });
  const gone = await lost.run('go-live', [], MARK);
  assert.equal(gone.status, 1);
  assert.match(gone.stderr, /could not be inspected, so it is not proven to be production/);

  const failed = siteFolder({ vercel: { deploy: { fails: true } } });
  const none = await failed.run('go-live', [], MARK);
  assert.equal(none.status, 1);
  assert.match(none.stderr, /the production deploy failed or printed no address/);
});

test('a page that does not answer 200 on the production address fails the proof, naming it', async () => {
  const prod = await production({ missing: ['/ka/work'] });
  const p = siteFolder({ pages: PAGES, vercel: { deploy: { productionUrl: prod.url } } });
  const res = await p.run('go-live', [], MARK);
  assert.equal(res.status, 4);
  assert.match(res.stderr, new RegExp(`is production and READY, but 1 of 5 addresses did not answer 200 on ${prod.url}: /ka/work \\(404\\)\\.`));
  assert.equal(prod.asked.filter((a) => a === '/ka/work').length, 3, 'asked three times before it is called missing');
  assert.doesNotMatch(res.stdout, /Live:/);
});

test('production serving another sitemap than this build’s fails the proof', async () => {
  const prod = await production({ listed: ['/', '/work'] });
  const p = siteFolder({ pages: PAGES, vercel: { deploy: { productionUrl: prod.url } } });
  const res = await p.run('go-live', [], MARK);
  assert.equal(res.status, 4);
  assert.match(res.stderr, /\/sitemap\.xml lists other pages than this build’s/);
});

test('without a production address in the JSON, the "Aliased" line names it; with neither, nothing is announced', async () => {
  const prod = await production();
  const lines = siteFolder({ pages: PAGES, vercel: { deploy: { productionUrl: prod.url, json: false } } });
  const res = await lines.run('go-live', [], MARK);
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, new RegExp(`Live: ${prod.url} `));

  const none = siteFolder({ vercel: { deploy: {} } });
  const out = await none.run('go-live', [], MARK);
  assert.equal(out.status, 4);
  assert.match(out.stderr, /Vercel named no production address/);
});

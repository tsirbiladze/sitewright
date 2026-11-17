// `pnpm domain` and `pnpm domain --check` (scripts/domain.mjs) with stand-ins for the Vercel CLI, DNS
// (SITE_DNS) and the network (SITE_CONNECT: a local HTTPS server with a certificate made for the test
// by openssl, trusted through NODE_EXTRA_CA_CERTS, or not). Nothing reaches Vercel or DNS.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pkg from '../package.json';
import { siteFolder, type VercelState } from './stand-in';

const MARK = { SITE_GO_LIVE: 'example.com' };
const ADD = [
  'vercel whoami',
  'vercel api /v9/projects/prj_site/domains',
  'vercel domains add example.com site',
  'vercel api /v9/projects/prj_site/domains',
  'vercel domains add www.example.com site',
  'vercel api /v9/projects/prj_site/domains',
  'vercel api /v9/projects/prj_site/domains/www.example.com -X PATCH -f redirect=example.com -F redirectStatusCode=308',
  'vercel api /v9/projects/prj_site/domains',
  'vercel domains verify example.com --project site',
  'vercel domains verify www.example.com --project site',
];
/** Both names on the project, www redirecting with 308: what a first run leaves. */
const ON: VercelState['domains'] = [
  { name: 'example.com', apexName: 'example.com', redirect: null, redirectStatusCode: null, verified: true },
  { name: 'www.example.com', apexName: 'example.com', redirect: 'example.com', redirectStatusCode: 308, verified: true },
];

test('`pnpm domain` runs the script, with the proxy the environment names', () => {
  assert.equal(pkg.scripts.domain, 'node --use-env-proxy scripts/domain.mjs');
});

test('with the mark: adds the domain and www, makes www redirect with 308, proves it, and prints the records as a table', async () => {
  const p = siteFolder();
  const res = await p.run('domain', [], MARK);
  assert.equal(res.status, 0, res.stderr);
  assert.deepEqual(p.calls(), ADD);
  for (const line of p.globals().slice(1)) assert.match(line, /: --scope team_elisabed --non-interactive --global-config /, line);
  const state = p.vercelState();
  assert.deepEqual(state.domains?.map((d) => [d.name, d.redirect, d.redirectStatusCode]), [['example.com', null, null], ['www.example.com', 'example.com', 308]]);
  assert.match(res.stdout, /domain: example\.com and www\.example\.com are on the Vercel project site; www\.example\.com redirects to example\.com \(308\)\.\n/);
  assert.ok(res.stdout.includes([
    'DNS records for example.com, to enter at its registrar (its DNS settings):',
    '',
    'Type   Name  Value',
    'A      @     216.198.79.1',
    'A      @     64.29.17.1',
    'CNAME  www   d1e2f3a4b5c6.vercel-dns-017.com.',
  ].join('\n')), res.stdout);
  assert.match(res.stdout, /Remove any other A, AAAA or CNAME record for @ and www\. Then run `pnpm domain --check`/);
});

test('a second run changes nothing: both names are there and www already redirects', async () => {
  const p = siteFolder({ vercel: { domains: structuredClone(ON) } });
  const res = await p.run('domain', [], MARK);
  assert.equal(res.status, 0, res.stderr);
  assert.ok(!p.calls().some((c) => c.includes('domains add') || c.includes('PATCH')), p.calls().join('\n'));
});

test('a name whose DNS already points at Vercel gets no records', async () => {
  const p = siteFolder({ vercel: { domains: structuredClone(ON), dns: { 'example.com': 'pointed', 'www.example.com': 'pointed' } } });
  const res = await p.run('domain', [], MARK);
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /example\.com and www\.example\.com already point at Vercel\./);
  assert.doesNotMatch(res.stdout, /Type\s+Name\s+Value/);
});

test('a subdomain is added alone: no www twin, no redirect, its record named relative to its apex', async () => {
  const p = siteFolder({ domain: 'me.example.org', vercel: { apex: 'example.org' } });
  const res = await p.run('domain', [], { SITE_GO_LIVE: 'me.example.org' });
  assert.equal(res.status, 0, res.stderr);
  assert.ok(!p.calls().some((c) => c.includes('www.') || c.includes('PATCH')), p.calls().join('\n'));
  assert.match(res.stdout, /me\.example\.org is on the Vercel project site \(a subdomain: no www twin\)\./);
  assert.ok(res.stdout.includes('DNS records for example.org, to enter at its registrar (its DNS settings):\n\nType   Name  Value\nCNAME  me    d1e2f3a4b5c6.vercel-dns-017.com.'), res.stdout);
});

test('without Vercel’s apexName, two labels make an apex and more make a subdomain', async () => {
  const apex = siteFolder({ vercel: { noApexName: true } });
  assert.equal((await apex.run('domain', [], MARK)).status, 0);
  assert.ok(apex.calls().includes('vercel domains add www.example.com site'));
  const sub = siteFolder({ domain: 'me.example.org', vercel: { noApexName: true, apex: 'example.org' } });
  assert.equal((await sub.run('domain', [], { SITE_GO_LIVE: 'me.example.org' })).status, 0);
  assert.ok(!sub.calls().some((c) => c.includes('www.')));
});

test('without a record list, the first-ranked values Vercel recommends make the table', async () => {
  const p = siteFolder({ vercel: { noRecords: true } });
  const res = await p.run('domain', [], MARK);
  assert.equal(res.status, 0, res.stderr);
  assert.ok(res.stdout.includes('A      @     216.198.79.1\nA      @     64.29.17.1\nCNAME  www   d1e2f3a4b5c6.vercel-dns-017.com.'), res.stdout);
});

test('Vercel refusing the domain, or the redirect, stops the run with its message; a redirect not proven is not announced', async () => {
  const refused = siteFolder({ vercel: { addFails: 'You don’t have access to the domain example.com.' } });
  const res = await refused.run('domain', [], MARK);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /Vercel did not add example\.com to the project site: You don’t have access to the domain example\.com\./);

  const patch = siteFolder({ vercel: { patchFails: 'Not allowed' } });
  const out = await patch.run('domain', [], MARK);
  assert.equal(out.status, 1);
  assert.match(out.stderr, /could not make www\.example\.com redirect to example\.com: Not allowed/);

  const ignored = siteFolder({ vercel: { patchIgnored: true } });
  const gone = await ignored.run('domain', [], MARK);
  assert.equal(gone.status, 1);
  assert.match(gone.stderr, /could not make www\.example\.com redirect to example\.com/);
  assert.doesNotMatch(gone.stdout, /redirects to example\.com \(308\)/);
});

test('without the mark nothing runs, and the refusal says what the mark means; --check needs no mark', async () => {
  const p = siteFolder();
  const res = await p.run('domain');
  assert.equal(res.status, 2);
  assert.equal(res.stderr.trim().split('\n').length, 1);
  assert.match(res.stderr, /^domain: refuses to run without the owner's mark\. Putting the domain on the Vercel project changes where the public finds the site, so it runs only after the owner has said yes to it in this conversation; the mark records that yes: run `SITE_GO_LIVE=example\.com pnpm domain` then, and not before\. Nothing was run\./);
  assert.deepEqual(p.calls(), []);
  const wrong = siteFolder();
  assert.equal((await wrong.run('domain', [], { SITE_GO_LIVE: 'www.example.com' })).status, 2);
  assert.deepEqual(wrong.calls(), []);
});

test('stops early, in one line that names the fix: domain a placeholder, not linked, not signed in, a wrong option', async () => {
  const cases = [
    { folder: siteFolder({ domain: '[[the domain]]' }), args: [], line: /^domain: content\/site\.json "domain" is still the placeholder \[\[the domain\]\]/ },
    { folder: siteFolder({ linked: false }), args: [], line: /^domain: this folder is not linked to a Vercel project .*`npx -y vercel@65\.8\.0 link --yes --project <name>`/ },
    { folder: siteFolder({ vercel: { signedIn: false } }), args: [], line: /^domain: the Vercel CLI is not signed in\. Nothing was run\. Sign in with `npx -y vercel@65\.8\.0 login/ },
    { folder: siteFolder({ linked: false }), args: ['--check'], line: /^domain: this folder is not linked to a Vercel project/ },
    { folder: siteFolder(), args: ['--force'], line: /^domain: takes only --check \(got "--force"\)\. Nothing was run\.$/ },
  ];
  for (const { folder, args, line } of cases) {
    const res = await folder.run('domain', args, MARK);
    assert.equal(res.status, 2, res.stderr);
    assert.match(res.stderr.trim(), line);
    assert.equal(res.stderr.trim().split('\n').length, 1);
    assert.ok(!folder.calls().some((c) => c.includes('domains') || c.includes('api')), 'nothing asked or changed');
  }
});

test('a domain that is the project’s own vercel.app address needs nothing: both modes say so', async () => {
  for (const args of [[], ['--check']]) {
    const p = siteFolder({ domain: 'site-elisabed.vercel.app' });
    const res = await p.run('domain', args, { SITE_GO_LIVE: 'site-elisabed.vercel.app' });
    assert.equal(res.status, 2);
    assert.match(res.stderr, /an address Vercel gives the project itself: there is no domain to add and no DNS to set/);
    assert.deepEqual(p.calls(), []);
  }
});

// ───────────── --check ─────────────

let certDir = '';
let server: Server | undefined;
let connect = '';
/** How the stand-in site answers: the apex 200, www a 308 to the apex (or what a test sets). */
let wwwAnswer = { status: 308, location: 'https://example.com/' };
const openssl = spawnSync('openssl', ['version']).status === 0;

before(async () => {
  if (!openssl) return;
  certDir = mkdtempSync(join(tmpdir(), 'domain-test-cert-'));
  const made = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(certDir, 'key.pem'), '-out', join(certDir, 'cert.pem'), '-days', '2', '-subj', '/CN=example.com', '-addext', 'subjectAltName=DNS:example.com,DNS:www.example.com'], { encoding: 'utf8' });
  assert.equal(made.status, 0, made.stderr);
  server = createServer({ key: readFileSync(join(certDir, 'key.pem')), cert: readFileSync(join(certDir, 'cert.pem')) }, (req, res) => {
    if (req.headers.host === 'www.example.com') return res.writeHead(wwwAnswer.status, { location: wwwAnswer.location }).end();
    res.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><title>site</title>');
  });
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
  connect = `127.0.0.1:${(server.address() as { port: number }).port}`;
});
after(() => { server?.close(); if (certDir) rmSync(certDir, { recursive: true, force: true }); });

/** DNS answers for the stand-in: both names pointed at Vercel the way the records say, or as given. */
function dnsFile(dir: string, answers: Record<string, { A?: string[]; CNAME?: string[] }> = { 'example.com': { A: ['216.198.79.1', '64.29.17.1'] }, 'www.example.com': { CNAME: ['d1e2f3a4b5c6.vercel-dns-017.com'], A: ['216.198.79.65'] } }) {
  const file = join(dir, 'dns.json');
  writeFileSync(file, JSON.stringify(answers));
  return file;
}
const skip = openssl ? false : 'openssl is not installed: it makes the test certificate';

test('--check: DNS pointed and HTTPS answering with a valid certificate is ready; it changes nothing', { skip }, async () => {
  wwwAnswer = { status: 308, location: 'https://example.com/' };
  const p = siteFolder({ vercel: { domains: structuredClone(ON), dns: { 'example.com': 'pointed', 'www.example.com': 'pointed' } } });
  const res = await p.run('domain', ['--check'], { SITE_DNS: dnsFile(p.dir), SITE_CONNECT: connect, NODE_EXTRA_CA_CERTS: join(certDir, 'cert.pem') });
  assert.equal(res.status, 0, res.stderr + res.stdout);
  assert.match(res.stdout, /^example\.com\n {2}DNS: points at Vercel \(A 216\.198\.79\.1, A 64\.29\.17\.1\)\n {2}HTTPS: answers 200 with a valid certificate \(until \d{4}-\d{2}-\d{2}\)\n/m);
  assert.match(res.stdout, /^www\.example\.com\n {2}DNS: points at Vercel \(CNAME d1e2f3a4b5c6\.vercel-dns-017\.com, A 216\.198\.79\.65\)\n {2}HTTPS: answers 308 → https:\/\/example\.com\/ with a valid certificate/m);
  assert.match(res.stdout, /Ready: https:\/\/example\.com answers with a valid certificate, and https:\/\/www\.example\.com redirects to it\.\n$/);
  assert.ok(!p.calls().some((c) => c.includes('domains add') || c.includes('PATCH')), 'nothing changed');
  assert.deepEqual(p.vercelState().domains, ON);
});

test('--check: DNS that does not point at Vercel yet is named, and the run says "not yet"', { skip }, async () => {
  const p = siteFolder({ vercel: { domains: structuredClone(ON) } });
  const dns = dnsFile(p.dir, { 'example.com': { A: ['203.0.113.7'] }, 'www.example.com': {} });
  const res = await p.run('domain', ['--check'], { SITE_DNS: dns, SITE_CONNECT: connect, NODE_EXTRA_CA_CERTS: join(certDir, 'cert.pem') });
  assert.equal(res.status, 1);
  assert.match(res.stdout, /^example\.com\n {2}DNS: does not point at Vercel yet \(A 203\.0\.113\.7\)\n/m);
  assert.match(res.stdout, /^www\.example\.com\n {2}DNS: does not point at Vercel yet \(no A or CNAME record\)\n/m);
  assert.match(res.stderr, /^domain: not yet: example\.com's DNS, www\.example\.com's DNS\. .*run `pnpm domain --check` again later\.\n$/);
});

test('--check: DNS already right while Vercel’s own check lags counts as pointed, and says so', { skip }, async () => {
  wwwAnswer = { status: 308, location: 'https://example.com/' };
  const p = siteFolder({ vercel: { domains: structuredClone(ON) } });
  const res = await p.run('domain', ['--check'], { SITE_DNS: dnsFile(p.dir), SITE_CONNECT: connect, NODE_EXTRA_CA_CERTS: join(certDir, 'cert.pem') });
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /DNS: points at Vercel \(Vercel’s own check has not caught up yet\) \(A 216\.198\.79\.1/);
});

test('--check: a certificate that is not valid for the name is "no valid certificate yet"', { skip }, async () => {
  const p = siteFolder({ vercel: { domains: structuredClone(ON), dns: { 'example.com': 'pointed', 'www.example.com': 'pointed' } } });
  // The same server, its certificate not trusted: as a browser would see a self-signed one.
  const res = await p.run('domain', ['--check'], { SITE_DNS: dnsFile(p.dir), SITE_CONNECT: connect });
  assert.equal(res.status, 1);
  assert.match(res.stdout, /HTTPS: no valid certificate yet \((DEPTH_ZERO_SELF_SIGNED_CERT|SELF_SIGNED_CERT_IN_CHAIN)\)/);
  assert.match(res.stderr, /not yet: example\.com over HTTPS, www\.example\.com over HTTPS/);
});

test('--check: www that does not redirect to the domain with 308 is not ready', { skip }, async () => {
  wwwAnswer = { status: 200, location: '' };
  try {
    const p = siteFolder({ vercel: { domains: structuredClone(ON), dns: { 'example.com': 'pointed', 'www.example.com': 'pointed' } } });
    const res = await p.run('domain', ['--check'], { SITE_DNS: dnsFile(p.dir), SITE_CONNECT: connect, NODE_EXTRA_CA_CERTS: join(certDir, 'cert.pem') });
    assert.equal(res.status, 1);
    assert.match(res.stdout, /HTTPS: answers 200 with a valid certificate .*; it should redirect to https:\/\/example\.com\/ with 308/);
    assert.match(res.stderr, /not yet: www\.example\.com over HTTPS/);
  } finally {
    wwwAnswer = { status: 308, location: 'https://example.com/' };
  }
});

test('--check: a domain not on the project yet says `pnpm domain` adds it; nothing else is asked', async () => {
  const p = siteFolder();
  const res = await p.run('domain', ['--check']);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /^domain: example\.com is not on the Vercel project site yet: `pnpm domain` adds it \(on the owner's yes\)\.\n$/);
  assert.deepEqual(p.calls(), ['vercel whoami', 'vercel api /v9/projects/prj_site/domains']);
});

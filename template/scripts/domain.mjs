// `pnpm domain`: puts the site's domain (`domain` in content/site.json) on the linked Vercel project,
// and prints the DNS records to enter at the registrar. `pnpm domain --check` changes nothing: it says,
// for each name, whether DNS points at Vercel and whether it answers over HTTPS with a valid certificate.
//
// `pnpm domain` changes where the public finds the site, so it runs only with the owner's mark,
// SITE_GO_LIVE=<the domain>, set after their yes in this conversation. It stops before anything runs
// when the domain is still a placeholder, the folder is not linked, or the Vercel CLI is not signed in.
//
// What it does, each step skipped when it is already so, so a second run changes nothing:
// 1. vercel domains add <domain> <project>.
// 2. An apex domain (example.com) gets its www twin too: vercel domains add www.<domain>, then
//    www redirects to the bare domain with 308 (vercel api PATCH on the project's domain).
//    A subdomain (me.example.org) is added alone: it has no www twin, and nothing redirects to it.
//    Which one it is comes from Vercel (the project domain's `apexName`); without that, two labels
//    make an apex.
// 3. Proof: the project's domains, read again, hold each name, and www's redirect is the domain, 308.
// 4. vercel domains verify for each name: the records Vercel recommends, printed as a table (type,
//    name, value) to copy into the registrar, or that the name already points at Vercel.
//
// A domain that is the project's own <name>.vercel.app address needs none of this; both modes say so.
// --check reads DNS itself as well as asking Vercel: right after a DNS change Vercel can keep answering
// "invalid configuration" for minutes while the name already serves the site.
// SITE_DNS (a JSON file of answers per name) and SITE_CONNECT (host:port every HTTPS check connects
// to, the name kept for SNI and the certificate) stand in for DNS and the network in the tests.
import { readFileSync } from 'node:fs';
import { Resolver } from 'node:dns/promises';
import https from 'node:https';
import { command, isVercelAddress, jsonIn, lastLine } from './lib/vercel.mjs';

const cli = command('domain');
const { say, fail, vercel } = cli;

const check = cli.options(['--check']).includes('--check');
const domain = cli.domain();
if (isVercelAddress(domain))
  fail(`the site's domain is ${domain}, an address Vercel gives the project itself: there is no domain to add and no DNS to set. A domain of the owner's goes in content/site.json "domain" first.`, 2);
if (!check) cli.mark(domain, 'Putting the domain on the Vercel project changes where the public finds the site');
const link = cli.link();
cli.signedIn();

const scope = link.orgId;
const www = `www.${domain}`;

/** The project's domains, as Vercel lists them. */
function projectDomains() {
  const res = vercel(['api', `/v9/projects/${link.projectId}/domains`], { scope });
  const json = jsonIn(res.stdout);
  if (!res.ok || !Array.isArray(json?.domains)) fail(`could not read the project's domains from Vercel (${lastLine(res.all)}).`);
  return json.domains;
}
const find = (list, name) => list.find((d) => d.name === name);
/** An apex domain has a www twin; a subdomain has none. Vercel's apexName decides; without it, two labels make an apex. */
const isApex = (entry) => (typeof entry?.apexName === 'string' ? entry.apexName === domain : domain.split('.').length === 2);
/** A name as a registrar's DNS settings write it, relative to the apex: "@", "www", "me", "_vercel". */
const relative = (name, apex) => (name === apex ? '@' : name.endsWith(`.${apex}`) ? name.slice(0, -apex.length - 1) : name);

/** vercel domains verify: Vercel's view of a name's DNS, as JSON (it may exit non-zero while DNS is not set). */
function verify(name) {
  const res = vercel(['domains', 'verify', name, '--project', link.name], { scope });
  const json = jsonIn(res.all);
  if (!json?.status) fail(`could not ask Vercel about ${name}'s DNS (${lastLine(res.all)}).`);
  return json;
}

if (check) await checkNames();
else addNames();

function addNames() {
  let list = projectDomains();
  const add = (name) => {
    say(`vercel domains add ${name}`);
    const res = vercel(['domains', 'add', name, link.name], { scope });
    const json = jsonIn(res.all);
    if (json?.status !== 'success') fail(`Vercel did not add ${name} to the project ${link.name}: ${json?.message ?? lastLine(res.all)}`);
    list = projectDomains();
  };
  if (!find(list, domain)) add(domain);
  const entry = find(list, domain);
  if (!entry) fail(`Vercel said it added ${domain}, but the project's domains do not hold it.`);
  const apex = typeof entry.apexName === 'string' ? entry.apexName : domain;
  const twin = isApex(entry) ? www : null;

  if (twin) {
    if (!find(list, twin)) add(twin);
    const w = find(list, twin);
    if (!w) fail(`Vercel said it added ${twin}, but the project's domains do not hold it.`);
    if (w.redirect !== domain || w.redirectStatusCode !== 308) {
      say(`${twin} → ${domain} (308)`);
      const res = vercel(['api', `/v9/projects/${link.projectId}/domains/${twin}`, '-X', 'PATCH', '-f', `redirect=${domain}`, '-F', 'redirectStatusCode=308'], { scope });
      const json = jsonIn(res.stdout);
      if (json?.redirect !== domain || json?.redirectStatusCode !== 308) fail(`could not make ${twin} redirect to ${domain}: ${json?.error?.message ?? lastLine(res.all)}`);
    }
    list = projectDomains();
  }

  // Proof, from the project's domains as Vercel now lists them.
  const w = twin ? find(list, twin) : null;
  if (!find(list, domain) || (twin && (w?.redirect !== domain || w?.redirectStatusCode !== 308)))
    fail(`the project's domains do not show ${twin ? `${domain} and ${twin} redirecting to it with 308` : domain}, so the change is not proven. Run \`pnpm domain\` again, or look at the project's Domains in Vercel.`);
  say(twin ? `${domain} and ${twin} are on the Vercel project ${link.name}; ${twin} redirects to ${domain} (308).` : `${domain} is on the Vercel project ${link.name} (a subdomain: no www twin).`);

  // The records to enter, as Vercel recommends them.
  const rows = [];
  const conflicts = [];
  const pointed = [];
  for (const name of twin ? [domain, twin] : [domain]) {
    const v = verify(name);
    if (v.status === 'ok') { pointed.push(name); continue; }
    const records = Array.isArray(v.recommended?.records) ? v.recommended.records : [];
    for (const r of records) rows.push([r.type, r.name, r.value]);
    if (!records.length) {
      // No record list: the first-ranked values Vercel recommends.
      const ip = [].concat(v.recommended?.ipv4?.[0]?.value ?? []);
      const cname = v.recommended?.cname?.[0]?.value;
      if (name === apex && ip.length) for (const value of ip) rows.push(['A', '@', value]);
      else if (cname) rows.push(['CNAME', relative(name, apex), cname]);
    }
    for (const t of v.project?.verification ?? []) rows.push([t.type, relative(String(t.domain), apex), t.value]);
    for (const c of v.conflicts ?? []) conflicts.push(c.type && c.name ? `${c.type} ${c.name} ${c.value ?? ''}`.trim() : JSON.stringify(c));
    if (!records.length && !rows.length) fail(`Vercel says ${name} is not configured (${v.message ?? v.reason}) but recommends no records.`);
  }
  if (pointed.length) say(`${pointed.join(' and ')} already ${pointed.length > 1 ? 'point' : 'points'} at Vercel.`);
  if (!rows.length) {
    console.log(`Domain ready on the project: run \`pnpm domain --check\` to see it answer over HTTPS.`);
    return;
  }
  console.log(`\nDNS records for ${apex}, to enter at its registrar (its DNS settings):\n`);
  console.log(table([['Type', 'Name', 'Value'], ...rows]));
  if (conflicts.length) console.log(`\nVercel also sees records that conflict; remove them: ${conflicts.join('; ')}`);
  console.log(`\nRemove any other A, AAAA or CNAME record for ${[...new Set(rows.map((r) => r[1]))].join(' and ')}. Then run \`pnpm domain --check\` until every name answers over HTTPS: Vercel issues the certificate once the records resolve.`);
}

/** Rows as columns padded with spaces, the first row a heading. */
function table(rows) {
  const widths = rows[0].map((_, i) => Math.max(...rows.map((r) => String(r[i]).length)));
  return rows.map((r) => r.map((cell, i) => String(cell).padEnd(widths[i])).join('  ').trimEnd()).join('\n');
}

/** A name's A and CNAME records: from SITE_DNS in the tests, else from DNS. */
async function lookup(name) {
  if (process.env.SITE_DNS) {
    const answers = JSON.parse(readFileSync(process.env.SITE_DNS, 'utf8'))[name] ?? {};
    return { A: answers.A ?? [], CNAME: answers.CNAME ?? [] };
  }
  const resolver = new Resolver({ timeout: 5000, tries: 2 });
  const quiet = (p) => p.catch(() => []);
  const [A, CNAME] = await Promise.all([quiet(resolver.resolve4(name)), quiet(resolver.resolveCname(name))]);
  return { A, CNAME };
}

/** Whether DNS sends a name to Vercel: a CNAME to a Vercel DNS name, or only A records Vercel recommends. */
function pointsAtVercel(dns, recommended) {
  const strip = (n) => String(n).toLowerCase().replace(/\.$/, '');
  const ips = new Set([...(recommended?.ipv4 ?? []).flatMap((r) => [].concat(r.value)), '76.76.21.21']);
  const cnames = new Set((recommended?.cname ?? []).flatMap((r) => [].concat(r.value)).map(strip));
  if (dns.CNAME.some((n) => cnames.has(strip(n)) || /(^|\.)vercel-dns(-\d+)?\.com$/.test(strip(n)))) return true;
  return dns.A.length > 0 && dns.A.every((ip) => ips.has(ip));
}

/** Asks https://<name>/ once, the certificate checked as a browser would: status, Location, the certificate's end, or why it failed. */
function httpsCheck(name) {
  const [host, port] = process.env.SITE_CONNECT ? process.env.SITE_CONNECT.split(':') : [name, '443'];
  return new Promise((resolve) => {
    const req = https.request({ host, port: Number(port), servername: name, path: '/', method: 'GET', headers: { host: name, 'user-agent': 'site-domain-check' }, agent: false, timeout: 15_000 }, (res) => {
      const cert = res.socket.getPeerCertificate?.();
      resolve({ status: res.statusCode, location: res.headers.location, validTo: cert?.valid_to });
      res.resume();
    });
    req.on('timeout', () => req.destroy(Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' })));
    req.on('error', (err) => resolve({ error: err.code ?? err.message }));
    req.end();
  });
}

async function checkNames() {
  const list = projectDomains();
  const entry = find(list, domain);
  if (!entry) fail(`${domain} is not on the Vercel project ${link.name} yet: \`pnpm domain\` adds it (on the owner's yes).`);
  const names = isApex(entry) && find(list, www) ? [domain, www] : [domain];
  const notYet = [];
  for (const name of names) {
    const v = verify(name);
    const dns = await lookup(name);
    const records = [...dns.CNAME.map((n) => `CNAME ${n}`), ...dns.A.map((ip) => `A ${ip}`)].join(', ') || 'no A or CNAME record';
    const points = v.status === 'ok' || pointsAtVercel(dns, v.recommended);
    const lag = points && v.status !== 'ok' ? ' (Vercel’s own check has not caught up yet)' : '';
    const answer = await httpsCheck(name);
    const twin = name === www;
    let https = '';
    let good = false;
    if (answer.error) https = /CERT|SELF_SIGNED|UNABLE_TO|ERR_TLS|HOSTNAME|ALTNAME/i.test(answer.error) ? `no valid certificate yet (${answer.error})` : `no answer (${answer.error})`;
    else {
      const until = answer.validTo ? ` (until ${new Date(answer.validTo).toISOString().slice(0, 10)})` : '';
      const target = String(answer.location ?? '').replace(/\/$/, '');
      if (twin) {
        good = answer.status === 308 && target === `https://${domain}`;
        https = `answers ${answer.status}${answer.location ? ` → ${answer.location}` : ''} with a valid certificate${until}${good ? '' : `; it should redirect to https://${domain}/ with 308`}`;
      } else {
        good = answer.status === 200;
        https = `answers ${answer.status} with a valid certificate${until}`;
      }
    }
    console.log(`${name}\n  DNS: ${points ? `points at Vercel${lag}` : 'does not point at Vercel yet'} (${records})\n  HTTPS: ${https}`);
    if (!points) notYet.push(`${name}'s DNS`);
    else if (!good) notYet.push(`${name} over HTTPS`);
  }
  if (notYet.length) fail(`not yet: ${notYet.join(', ')}. DNS can take from minutes to hours to reach everyone; run \`pnpm domain --check\` again later.`, 1);
  console.log(names.length > 1 ? `Ready: https://${domain} answers with a valid certificate, and https://${www} redirects to it.` : `Ready: https://${domain} answers with a valid certificate.`);
}

// A stand-in for the Vercel CLI 65.8.0, for the tests of scripts/preview.mjs, go-live.mjs and
// domain.mjs: no network, nothing deployed. It answers the commands those scripts run the way the real
// CLI answered them on 2026-11-17 (lines first, then JSON), from a state file the test writes
// (STAND_IN_STATE), keeps that state up to date as domains are added and changed, and writes each call
// to STAND_IN_LOG, without the global flags (--non-interactive, --scope, --global-config), which it
// logs apart.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';

const stateFile = process.env.STAND_IN_STATE;
const state = JSON.parse(readFileSync(stateFile, 'utf8'));
const save = () => writeFileSync(stateFile, JSON.stringify(state, null, 2));

// The global flags, taken off the arguments.
const args = [];
const globals = [];
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === '--non-interactive') globals.push(a);
  else if (a === '--scope' || a === '--global-config') globals.push(`${a} ${process.argv[++i]}`);
  else args.push(a);
}
appendFileSync(process.env.STAND_IN_LOG, `vercel ${args.join(' ')}\n`);
appendFileSync(`${process.env.STAND_IN_LOG}.globals`, `${args[0]}: ${globals.join(' ')}\n`);

const out = (value) => process.stdout.write(`${typeof value === 'string' ? value : JSON.stringify(value, null, 2)}\n`);
const err = (text) => process.stderr.write(`${text}\n`);
const done = (code = 0) => process.exit(code);

const PREVIEW_HOST = 'site-abc123-elisabed.vercel.app';
const PRODUCTION_HOST = 'site-def456-elisabed.vercel.app';

const [cmd, sub] = args;

if (cmd === 'whoami') {
  if (state.signedIn !== false) { out('elisabed'); done(); }
  // The real CLI, finding no login, starts a browser login when it thinks an agent or a person is
  // watching, and errors only in CI: the scripts must ask with CI=1.
  if (!process.env.CI) { out('No existing credentials found. Starting login flow...'); done(99); }
  err('Error: No existing credentials found. Please run `vercel login` or pass "--token"');
  err('Learn More: https://err.sh/vercel/no-credentials-found');
  done(1);
}

if (cmd === 'list') {
  if (state.listFails) { err('Error: Request failed with status 500'); done(1); }
  err('Fetching deployments in elisabed');
  const n = state.productionDeployments ?? 1;
  const deployments = Array.from({ length: Math.min(n, 1) }, (_, i) => ({ id: `dpl_prod${i}`, url: PRODUCTION_HOST, name: 'site', state: 'READY', target: 'production', createdAt: 1794900000000 }));
  out(n ? { contextName: 'elisabed', deployments, pagination: { count: 1, next: null, prev: null } } : { deployments: [], pagination: { count: 0, next: null, prev: null }, contextName: 'elisabed' });
  done();
}

if (cmd === 'deploy') {
  const prod = args.includes('--prod');
  const d = state.deploy ?? {};
  if (d.fails) { err('Error: The deployment could not be created.'); done(1); }
  const host = prod ? PRODUCTION_HOST : PREVIEW_HOST;
  const target = d.target ?? (prod ? 'production' : 'preview');
  // The CLI's progress lines go to stderr, its JSON to stdout.
  err(`Inspect     https://vercel.com/elisabed/site/${prod ? 'def456' : 'abc123'}`);
  err(`${target === 'production' ? 'Production' : 'Preview'}  https://${host}`);
  if (prod && d.productionUrl) err(`Aliased     ${d.productionUrl}`);
  if (d.json !== false)
    out({
      status: 'ok',
      // productionUrl first: a script must take the deployment's own `url`, not the first address it sees.
      deployment: { id: 'dpl_new', productionUrl: prod ? d.productionUrl ?? null : 'https://site-elisabed.vercel.app', url: `https://${host}`, inspectorUrl: 'https://vercel.com/elisabed/site/x', readyState: d.readyState ?? 'READY', target },
      message: `Deployment https://${host} is ready.`,
      next: [{ command: `vercel inspect ${host}`, when: 'Inspect deployment' }],
    });
  state.lastDeploy = { host, target, readyState: d.readyState ?? 'READY' };
  save();
  done();
}

if (cmd === 'inspect') {
  const last = state.lastDeploy ?? {};
  const over = state.inspect ?? {};
  if (over.fails) { err('Error: Can\'t find the deployment.'); done(1); }
  out({ id: 'dpl_new', url: sub, name: 'site', target: over.target ?? last.target, readyState: over.readyState ?? last.readyState, createdAt: 1794900000000 });
  done();
}

/** The apex of a name: what the test says, else the name less a leading www. */
const apexOf = (name) => state.apex ?? (name.startsWith('www.') ? name.slice(4) : name);

if (cmd === 'domains' && sub === 'add') {
  const [, , name, project] = args;
  if (state.addFails) { out({ status: 'error', reason: 'domain_not_allowed', message: state.addFails }); done(1); }
  out(`Adding domain ${name} to project ${project}`);
  (state.domains ??= []).push({ name, apexName: state.noApexName ? undefined : apexOf(name), projectId: 'prj_site', redirect: null, redirectStatusCode: null, verified: true });
  save();
  out({ status: 'success', reason: 'domain_added', message: `Domain ${name} added to project ${project}.` });
  done();
}

if (cmd === 'domains' && sub === 'verify') {
  const name = args[2];
  if ((state.dns ?? {})[name] === 'pointed') { out({ status: 'ok', reason: 'configured_correctly', message: `${name} has a valid configuration and is verified for project site.` }); done(); }
  const apex = apexOf(name);
  const label = name === apex ? '@' : name.slice(0, -apex.length - 1);
  const records = label === '@'
    ? [{ type: 'A', name: '@', value: '216.198.79.1' }, { type: 'A', name: '@', value: '64.29.17.1' }]
    : [{ type: 'CNAME', name: label, value: 'd1e2f3a4b5c6.vercel-dns-017.com.' }];
  out({
    status: 'action_required',
    reason: 'invalid_configuration',
    message: `${name} has an invalid DNS configuration. Apply the recommended DNS changes, then retry verification.`,
    recommended: {
      ipv4: [{ rank: 1, value: ['216.198.79.1', '64.29.17.1'] }, { rank: 2, value: ['76.76.21.21'] }],
      cname: [{ rank: 1, value: 'd1e2f3a4b5c6.vercel-dns-017.com.' }, { rank: 2, value: 'cname.vercel-dns.com.' }],
      records: state.noRecords ? undefined : records,
      nameservers: ['ns1.vercel-dns.com', 'ns2.vercel-dns.com'],
    },
    conflicts: [],
    domainOwnership: 'current-scope',
    project: { idOrName: 'site', attached: true, verified: true, verification: [], verificationError: null },
  });
  done(1);
}

if (cmd === 'api') {
  const path = args[1];
  const domains = (state.domains ??= []);
  if (/^\/v9\/projects\/[^/]+\/domains$/.test(path)) { out({ domains, pagination: { count: domains.length, next: null, prev: null } }); done(); }
  const m = /^\/v9\/projects\/[^/]+\/domains\/([^/]+)$/.exec(path);
  if (m && args.includes('PATCH')) {
    const entry = domains.find((d) => d.name === m[1]);
    if (!entry || state.patchFails) { out({ error: { code: 'forbidden', message: state.patchFails ?? 'not found' } }); done(1); }
    const field = (flag, key) => { const i = args.findIndex((a, j) => a === flag && args[j + 1]?.startsWith(`${key}=`)); return i === -1 ? undefined : args[i + 1].slice(key.length + 1); };
    if (!state.patchIgnored) {
      entry.redirect = field('-f', 'redirect') ?? entry.redirect;
      const code = field('-F', 'redirectStatusCode');
      if (code !== undefined) entry.redirectStatusCode = Number(code);
    }
    save();
    out({ ...entry, error: null });
    done();
  }
}

err(`stand-in: no answer for "vercel ${args.join(' ')}"`);
done(1);

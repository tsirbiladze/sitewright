// `pnpm preview` (scripts/preview.mjs) with stand-ins for pnpm and the Vercel CLI: no network, nothing deployed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import pkg from '../package.json';
import { siteFolder, PREVIEW_HOST } from './stand-in';

const script = new URL('../scripts/preview.mjs', import.meta.url).pathname;

test('`pnpm preview` runs the script', () => {
  assert.equal(pkg.scripts.preview, 'node scripts/preview.mjs');
});

test('checks, builds, deploys a preview, proves it is one, and says where it is', async () => {
  const p = siteFolder();
  const res = await p.run('preview');
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, new RegExp(`Preview ready: https://${PREVIEW_HOST}\\n$`));
  assert.deepEqual(p.calls(), [
    'vercel whoami',
    'vercel list --environment production --status READY --format json --limit 1',
    'pnpm typecheck',
    'pnpm test',
    'pnpm build',
    'vercel deploy --environment preview --yes',
    `vercel inspect ${PREVIEW_HOST} --json --wait`,
  ]);
  // Every Vercel call answers without prompts, with the login folder it was given.
  for (const line of p.globals()) assert.match(line, new RegExp(`: --non-interactive --global-config ${p.config}$`), line);
  // Of the build's output, what the agent has to know is passed on: the skills' versions and the warnings.
  assert.match(res.stdout, /preview: build: skills: demo@v1 fetched \(en\+ka, 1 image\(s\)\)\n/);
  assert.match(res.stdout, /preview: build: ⚠ Your version of Next\.js is affected by a known security vulnerability\.\n/);
  assert.doesNotMatch(res.stdout, /Generating static pages/);
});

test('refuses while the project has no production deployment: a first deployment can become production', async () => {
  const p = siteFolder({ vercel: { productionDeployments: 0 } });
  const res = await p.run('preview');
  assert.equal(res.status, 2);
  assert.equal(res.stderr.trim().split('\n').length, 1, 'one line');
  assert.match(res.stderr, /^preview: this Vercel project has no production deployment yet, and a new project's first deployment can become production .*Take the site live first with `pnpm go-live`/);
  assert.deepEqual(p.calls(), ['vercel whoami', 'vercel list --environment production --status READY --format json --limit 1'], 'nothing built, nothing deployed');
});

test('a project Vercel cannot be asked about is not deployed to', async () => {
  const p = siteFolder({ vercel: { listFails: true } });
  const res = await p.run('preview');
  assert.equal(res.status, 1);
  assert.match(res.stderr, /could not ask Vercel whether the project has a production deployment \(Error: Request failed with status 500\)/);
  assert.ok(!p.calls().some((c) => c.startsWith('pnpm ') || c.startsWith('vercel deploy')));
});

test('takes no options, so nothing can make it deploy to production', async () => {
  for (const option of ['--prod', '--environment=production', 'production']) {
    const p = siteFolder();
    const res = await p.run('preview', [option]);
    assert.equal(res.status, 2, option);
    assert.match(res.stderr, /takes no options/);
    assert.deepEqual(p.calls(), [], option);
  }
  const source = readFileSync(script, 'utf8');
  assert.doesNotMatch(source, /--prod|promote|'alias'|"alias"/);
  assert.equal(source.match(/'deploy', '--environment', '(\w+)'/)?.[1], 'preview');
});

test('stops early, in one line that names the fix: not linked, domain a placeholder, not signed in', async () => {
  const cases = [
    { folder: siteFolder({ linked: false }), line: /^preview: this folder is not linked to a Vercel project \(\.vercel\/project\.json is missing\)\. Nothing was run\. Link it once: `npx -y vercel@65\.8\.0 project create <name>` when the project is new, then `npx -y vercel@65\.8\.0 link --yes --project <name>`\./ },
    { folder: siteFolder({ domain: '[[your domain]]' }), line: /^preview: content\/site\.json "domain" is still the placeholder \[\[your domain\]\]: write the site’s own domain there first/ },
    { folder: siteFolder({ vercel: { signedIn: false } }), line: /^preview: the Vercel CLI is not signed in\. Nothing was run\. Sign in with `npx -y vercel@65\.8\.0 login --global-config [^`]+`/ },
  ];
  for (const { folder, line } of cases) {
    const res = await folder.run('preview');
    assert.equal(res.status, 2, res.stderr);
    assert.match(res.stderr, line);
    assert.equal(res.stderr.trim().split('\n').length, 1, res.stderr);
    assert.ok(!folder.calls().some((c) => c.startsWith('pnpm ') || c.startsWith('vercel deploy')), 'nothing built or deployed');
  }
});

test('asks whether it is signed in with CI=1, so a missing login never opens a browser and waits', async () => {
  // The stand-in, like the CLI, starts a login flow (exit 99) when CI is not set.
  const p = siteFolder({ vercel: { signedIn: false } });
  const res = await p.run('preview');
  assert.doesNotMatch(res.stdout + res.stderr, /Starting login flow/);
});

test('a failing check stops the run before anything is deployed', async () => {
  for (const failingCheck of ['typecheck', 'test']) {
    const p = siteFolder({ failingCheck });
    const res = await p.run('preview');
    assert.equal(res.status, 1, failingCheck);
    assert.match(res.stderr, new RegExp(`pnpm ${failingCheck} failed\\. Nothing was deployed\\.`));
    assert.equal(p.calls().at(-1), `pnpm ${failingCheck}`);
    assert.ok(!p.calls().some((c) => c.startsWith('vercel deploy')));
  }
});

test('the build that Next.js stops with its upgrade reminder is run once more, and only that one', async () => {
  const once = siteFolder({ failingBuilds: 1 });
  const res = await once.run('preview');
  assert.equal(res.status, 0, res.stderr);
  assert.equal(once.calls().filter((call) => call === 'pnpm build').length, 2);
  assert.match(res.stdout, /upgrade reminder/);

  const twice = siteFolder({ failingBuilds: 2 });
  assert.equal((await twice.run('preview')).status, 1);
  assert.equal(twice.calls().filter((call) => call === 'pnpm build').length, 2);
  assert.ok(!twice.calls().some((c) => c.startsWith('vercel deploy')));

  const broken = siteFolder({ failingBuilds: 1, buildError: 'TypeError' });
  const failed = await broken.run('preview');
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /Error \[TypeError\]: the build stopped/);
  assert.match(failed.stderr, /pnpm build failed\. Nothing was deployed\./);
  assert.equal(broken.calls().filter((call) => call === 'pnpm build').length, 1);
});

test('a deployment that is not a preview fails the run, loudly, with the way to take it down', async () => {
  const p = siteFolder({ vercel: { deploy: { target: 'production' } } });
  const res = await p.run('preview');
  assert.equal(res.status, 3);
  assert.match(res.stderr, /is NOT a preview: its target is "production"\. Tell the owner at once\. To take it down: vercel remove /);
  assert.doesNotMatch(res.stdout, /Preview ready/);
});

test('a preview that did not build, or cannot be inspected, is not announced as ready', async () => {
  const error = siteFolder({ vercel: { deploy: { readyState: 'ERROR' } } });
  const res = await error.run('preview');
  assert.equal(res.status, 1);
  assert.match(res.stderr, /is a preview, but its state is ERROR/);
  assert.doesNotMatch(res.stdout, /Preview ready/);

  const lost = siteFolder({ vercel: { inspect: { fails: true } } });
  const out = await lost.run('preview');
  assert.equal(out.status, 1);
  assert.match(out.stderr, /could not be inspected, so it is not proven to be a preview/);
  assert.doesNotMatch(out.stdout, /Preview ready/);
});

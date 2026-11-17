// `pnpm go-live`: checks the site, makes a production deployment, and proves it: its target is
// production, it is READY, and every page of the build's sitemap answers 200 on the production
// address. No options. It changes what the public sees, so it runs only with the owner's mark:
// SITE_GO_LIVE=<the domain in content/site.json>, set after the owner's yes in this conversation.
//
// 1. It stops before anything runs when the content's domain is still a placeholder, the mark is
//    missing, the folder is not linked to a Vercel project, or the Vercel CLI is not signed in. It
//    does not link or create the project: that is `npx -y vercel@65.8.0 project create <name>` for a
//    new one, then `npx -y vercel@65.8.0 link --yes --project <name>`, once, in the owner's account.
// 2. pnpm typecheck, pnpm test, pnpm build (scripts/lib/vercel.mjs). The pages to prove are the ones
//    this build's sitemap lists (.next/server/app/sitemap.xml.body).
// 3. vercel deploy --prod: its JSON names the deployment and the production address (productionUrl).
// 4. vercel inspect --json --wait: target "production" and READY.
// 5. Each page of the sitemap, and /sitemap.xml itself, asked of the production address: 200 each,
//    and the sitemap production serves lists the same pages as the build's.
import { existsSync, readFileSync } from 'node:fs';
import { command, deploymentHost, jsonIn } from './lib/vercel.mjs';

const cli = command('go-live');
const { say, fail, vercel } = cli;

cli.options([]);
const domain = cli.domain();
cli.mark(domain, 'Taking the site live changes what the public sees');
cli.link();
cli.signedIn();

cli.checksAndBuild();

const sitemapFile = '.next/server/app/sitemap.xml.body';
if (!existsSync(sitemapFile)) fail(`the build wrote no sitemap at ${sitemapFile}, so there is nothing to prove the deployment with. Nothing was deployed.`);
/** The paths a sitemap lists, sorted. */
const pathsOf = (xml) => [...xml.matchAll(/<loc>\s*https?:\/\/[^/<\s]+([^<\s]*)\s*<\/loc>/g)].map((m) => m[1] || '/').sort();
const pages = pathsOf(readFileSync(sitemapFile, 'utf8'));
if (!pages.length) fail(`the build's sitemap (${sitemapFile}) lists no page. Nothing was deployed.`);

say('vercel deploy --prod');
const deploy = vercel(['deploy', '--prod', '--yes']);
const result = jsonIn(deploy.stdout)?.deployment;
const host = deploymentHost(String(result?.url ?? '')) ?? deploymentHost(/^\s*Production\s+(\S+)/m.exec(deploy.all)?.[1] ?? '');
if (!deploy.ok || !host) {
  process.stderr.write(deploy.all);
  fail('the production deploy failed or printed no address.');
}

const inspect = vercel(['inspect', host, '--json', '--wait']);
const deployment = jsonIn(inspect.stdout);
if (!deployment?.target) {
  process.stderr.write(inspect.all);
  fail(`https://${host} was deployed, but it could not be inspected, so it is not proven to be production. Check it: vercel inspect ${host}`);
}
if (deployment.target !== 'production')
  fail(`https://${host} is NOT production: its target is "${deployment.target}". Tell the owner at once; nothing is live from this run.`, 3);
if (deployment.readyState !== 'READY') fail(`https://${host} is a production deployment, but its state is ${deployment.readyState}. Its build log: vercel inspect ${host} --logs`);

// The production address: what Vercel names as such, else the "Aliased" line it prints.
const production = String(result?.productionUrl ?? /^\s*Aliased\s+(https?:\/\/\S+)/m.exec(deploy.all)?.[1] ?? '').replace(/\/$/, '');
if (!/^https?:\/\/[^/\s]+$/.test(production)) fail(`https://${host} is production and READY, but Vercel named no production address to prove its pages on.`, 4);

say(`asking ${production} for the ${pages.length} pages of the sitemap`);
const pause = Number(process.env.SITE_RETRY_MS ?? 3000);
const tries = 3;
/** The status a page answers with, asked a few times: the edge may take a moment to serve a new deployment. */
async function status(path) {
  let last = '';
  for (let i = 0; i < tries; i++) {
    if (i) await new Promise((r) => setTimeout(r, pause));
    try {
      const res = await fetch(production + path, { redirect: 'manual', signal: AbortSignal.timeout(20_000), headers: { 'user-agent': 'site-go-live-check' } });
      const body = await res.text();
      if (res.status === 200) return { ok: true, body };
      last = String(res.status);
    } catch (err) {
      last = `no answer: ${err.cause?.code ?? err.cause?.message ?? err.message}`;
    }
  }
  return { ok: false, why: last };
}

const problems = [];
for (let i = 0; i < pages.length; i += 6) {
  const batch = pages.slice(i, i + 6);
  const answers = await Promise.all(batch.map(status));
  answers.forEach((a, j) => { if (!a.ok) problems.push(`${batch[j]} (${a.why})`); });
}
const served = await status('/sitemap.xml');
if (!served.ok) problems.push(`/sitemap.xml (${served.why})`);
else if (JSON.stringify(pathsOf(served.body)) !== JSON.stringify(pages)) problems.push('/sitemap.xml lists other pages than this build’s: production may be serving another deployment');

if (problems.length) {
  const own = new URL(production).host === domain;
  fail(
    `https://${host} is production and READY, but ${problems.length} of ${pages.length + 1} addresses did not answer 200 on ${production}: ${problems.slice(0, 8).join(', ')}${problems.length > 8 ? ', …' : ''}.` +
      (own && problems.some((p) => p.includes('no answer')) ? ' If DNS does not point at Vercel yet, `pnpm domain --check` says so.' : ''),
    4,
  );
}

console.log(`Live: ${production} (production deployment https://${host}; ${pages.length} pages and the sitemap answer 200)`);

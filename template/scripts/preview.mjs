// `pnpm preview`: checks the site, deploys a Vercel preview, and proves that it is a preview.
// No options: it has no way to deploy anything but a preview.
//
// 1. It stops before anything runs when the content's domain is still a placeholder, the folder is not
//    linked to a Vercel project, or the Vercel CLI is not signed in.
// 2. It stops when the project has no production deployment yet. A new project's first deployment can
//    become its production deployment although a preview was asked for, so the first public thing is
//    `pnpm go-live`, on the owner's yes. Asked with `vercel list --environment production --status
//    READY --format json --limit 1` (the linked project's READY production deployments, at most one).
// 3. pnpm typecheck, pnpm test, pnpm build (scripts/lib/vercel.mjs).
// 4. vercel deploy --environment preview, then vercel inspect --json --wait: the deployment must have
//    target "preview" and be READY, or the run fails and says how to take it down.
import { command, deploymentHost, jsonIn, lastLine } from './lib/vercel.mjs';

const cli = command('preview');
const { say, fail, vercel } = cli;

cli.options([]);
cli.domain();
cli.link();
cli.signedIn();

const list = vercel(['list', '--environment', 'production', '--status', 'READY', '--format', 'json', '--limit', '1']);
const listed = jsonIn(list.stdout);
if (!list.ok || !Array.isArray(listed?.deployments)) fail(`could not ask Vercel whether the project has a production deployment (${lastLine(list.all)}). Nothing was deployed.`);
if (listed.deployments.length === 0)
  fail('this Vercel project has no production deployment yet, and a new project\'s first deployment can become production although a preview was asked for. Nothing was deployed. Take the site live first with `pnpm go-live` (on the owner\'s yes); previews work from then on.', 2);

cli.checksAndBuild();

say('vercel deploy --environment preview');
const deploy = vercel(['deploy', '--environment', 'preview', '--yes']);
// The deployment's own address: its JSON's `url`, else the "Preview https://…" line, else the first one printed.
const host = deploymentHost(String(jsonIn(deploy.stdout)?.deployment?.url ?? '')) ?? deploymentHost(/^\s*Preview\s+(\S+)/m.exec(deploy.all)?.[1] ?? '') ?? deploymentHost(deploy.all);
if (!deploy.ok || !host) {
  process.stderr.write(deploy.all);
  fail('the deploy failed or printed no address.');
}

const inspect = vercel(['inspect', host, '--json', '--wait']);
const deployment = jsonIn(inspect.stdout);
if (!deployment?.target) {
  process.stderr.write(inspect.all);
  fail(`https://${host} was deployed, but it could not be inspected, so it is not proven to be a preview. Check it: vercel inspect ${host}`);
}
if (deployment.target !== 'preview')
  fail(`https://${host} is NOT a preview: its target is "${deployment.target}". Tell the owner at once. To take it down: vercel remove ${host}`, 3);
if (deployment.readyState !== 'READY') fail(`https://${host} is a preview, but its state is ${deployment.readyState}. Its build log: vercel inspect ${host} --logs`);

console.log(`Preview ready: https://${host}`);

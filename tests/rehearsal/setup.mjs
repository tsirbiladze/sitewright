// Sets up a rehearsal of the skill in a new folder: the skill as an installer would leave it, the
// template as the release would carry it (both from the last commit), stand-ins for GitHub and Vercel,
// and an env.sh to source at the start of every shell command.
//   node tests/rehearsal/setup.mjs <new folder> [--signed-out]
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const repo = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const [target, ...flags] = process.argv.slice(2);
if (!target) { console.error('usage: node tests/rehearsal/setup.mjs <new folder> [--signed-out]'); process.exit(2); }
const home = resolve(target);
if (existsSync(home) && readdirSync(home).length) { console.error(`${home}: exists and is not empty`); process.exit(2); }
mkdirSync(join(home, 'work'), { recursive: true });

// The committed skill and template, not the working tree: what a release would hold.
const archive = (path, to, strip) => {
  mkdirSync(to, { recursive: true });
  execFileSync('sh', ['-c', `git -C "${repo}" archive HEAD ${path} | tar -x -C "${to}" --strip-components=${strip}`]);
};
archive('skills/sitewright', join(home, 'skill'), 2);
archive('template', join(home, 'template'), 1);

const signedOut = flags.includes('--signed-out');
writeFileSync(join(home, 'vercel-state.json'), JSON.stringify({ signedIn: !signedOut, productionDeployments: 0, port: 4350 }, null, 2));
writeFileSync(join(home, 'github-state.json'), JSON.stringify({ user: 'rehearsal-owner', signedIn: !signedOut, repos: {} }, null, 2));
writeFileSync(join(home, 'calls.log'), '');
writeFileSync(join(home, 'env.sh'), [
  '# A rehearsal: GitHub and Vercel are stand-ins. Source this at the start of every shell command.',
  `export REHEARSAL_HOME="${home}"`,
  `export PATH="${repo}/tests/rehearsal/bin:$PATH"`,
  `export SITEWRIGHT_TEMPLATE="${home}/template"`,
  '',
].join('\n'));
console.log(`Rehearsal ready in ${home}\n  the skill: ${home}/skill\n  work in:   ${home}/work\n  each shell command starts with: source ${home}/env.sh &&\n  what was asked of GitHub and Vercel: ${home}/calls.log`);

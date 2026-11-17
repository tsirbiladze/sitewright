// The default way the scaffold gets its template: the folder template/ of the public repository at the
// skill's release tag, cloned with git. The repository does not exist yet, so a local git repository
// stands in for it (SITEWRIGHT_REPO). And the git repository the scaffold makes of the new folder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { committedTemplate, env, has, json, made, person, root, scaffold, skillVersion, temp } from './helpers.mjs';

const answers = { languages: ['en'], sections: ['about'], name: person.en };
const identity = { GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@testadze.example', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@testadze.example' };
/** Git with no configuration of this machine's: no global or system file, no identity in the environment. */
const bareGit = { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
const withoutIdentity = { ...bareGit, ...Object.fromEntries(['EMAIL', ...Object.keys(identity)].map((key) => [key, undefined])) };

function git(cwd, args, extra = {}) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: env({ ...bareGit, ...identity, ...extra }) });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout;
}

/** A repository like tsirbiladze/sitewright will be: template/ and the skill, tagged `tag`. */
function standIn(tag) {
  const repo = join(temp, `github-${tag}`);
  mkdirSync(repo);
  cpSync(committedTemplate(), join(repo, 'template'), { recursive: true });
  cpSync(join(root, 'skills'), join(repo, 'skills'), { recursive: true });
  git(repo, ['init', '--quiet', '--initial-branch=main']);
  git(repo, ['add', '--all']);
  git(repo, ['commit', '--quiet', '-m', 'release']);
  git(repo, ['tag', tag]);
  return `file://${repo}`;
}

test('by default the template is the repository’s template/ at the tag v<version>', () => {
  const version = skillVersion();
  const url = standIn(`v${version}`);
  const { out, stdout } = made(answers, { template: null, extraEnv: { SITEWRIGHT_REPO: url } });
  assert.match(stdout, new RegExp(`^Made ${out} from the sitewright template ${version.replace(/\./g, '\\.')} \\(${url} at v${version.replace(/\./g, '\\.')}\\)\\.$`, 'm'));
  assert.equal(json(out, 'content/en/site.json').name, person.en);
  assert.ok(has(out, 'package.json') && has(out, 'next.config.ts'));
  assert.ok(!has(out, 'skills') && !has(out, 'template'), 'only the template’s own files');
});

test('without the release tag it stops, says which, and makes nothing', () => {
  const version = skillVersion();
  const url = standIn('v0.0.1');
  const r = scaffold(answers, { template: null, extraEnv: { SITEWRIGHT_REPO: url } });
  assert.equal(r.status, 2);
  assert.match(r.stderr, new RegExp(`^could not get the template v${version.replace(/\./g, '\\.')} from ${url}: .+ \\(offline, or no release v${version.replace(/\./g, '\\.')} there: pass --template <folder>\\)\\n$`));
  assert.ok(!has(r.out, ''), 'nothing is made');
});

test('a local template wins over the repository', () => {
  const { stdout } = made(answers, { template: null, extraEnv: { SITEWRIGHT_REPO: 'file:///nowhere', SITEWRIGHT_TEMPLATE: committedTemplate() } });
  assert.match(stdout, new RegExp(`\\(${committedTemplate()}\\)\\.$`, 'm'));
});

test('with a name and email in git, the folder is a repository on main with its first commit', () => {
  const r = scaffold(answers, { git: true, extraEnv: { ...bareGit, ...identity } });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^Git: a repository on main with its first commit\.$/m);
  assert.equal(git(r.out, ['rev-parse', '--abbrev-ref', 'HEAD']).trim(), 'main');
  assert.equal(git(r.out, ['rev-list', '--count', 'HEAD']).trim(), '1');
  assert.match(git(r.out, ['log', '-1', '--format=%s']), new RegExp(`^The site, made by sitewright ${skillVersion().replace(/\./g, '\\.')}`));
  assert.equal(git(r.out, ['status', '--porcelain']), '', 'everything is committed');
  assert.match(git(r.out, ['ls-files']), /^content\/en\/site\.json$/m);
});

test('without a name and email in git, every file is staged and the output says how to commit', () => {
  const r = scaffold(answers, { git: true, extraEnv: withoutIdentity });
  assert.equal(r.status, 0, 'the site is made all the same');
  assert.match(r.stdout, /^Git: a repository with every file staged but no commit, because git has no name and email set\. Set them \(git config --global user\.name "…"; git config --global user\.email "…"\), then: git -C \S+ commit -m 'The site, made by sitewright [^']+'$/m);
  assert.match(git(r.out, ['diff', '--cached', '--name-only']), /^content\/en\/site\.json$/m);
  assert.equal(spawnSync('git', ['rev-parse', '--verify', 'HEAD'], { cwd: r.out }).status, 128, 'no commit yet');
});

test('--no-git leaves the folder without a repository', () => {
  const { out, stdout } = made(answers);
  assert.match(stdout, /^Git: not made a repository \(--no-git\)\.$/m);
  assert.ok(!has(out, '.git'));
});

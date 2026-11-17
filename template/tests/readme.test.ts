// README.md is the site's own: written for its owner and their agents, it names no person and says
// nothing of the template it came from (TEMPLATE.md holds that, and sitewright's scaffold deletes it).
// Outside content/, public/, tests/ and TEMPLATE.md nothing names the demo person, so deleting
// TEMPLATE.md is all a site needs to carry no trace of them. Every check here passes in a person's
// site too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import pkg from '../package.json';
import { demo, root } from './helpers';

const readme = readFileSync(join(root, 'README.md'), 'utf8');
const json = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
/** The demo person's names, whole and each part, in every language of the demo. */
const demoNames = (json(join(demo, 'content/site.json')).languages as string[])
  .map((lang) => json(join(demo, `content/${lang}/site.json`)).name as string)
  .flatMap((name) => [name, ...name.split(' ')]);

test('README.md names no person and says nothing of the template or its demo', () => {
  for (const name of demoNames) assert.ok(!readme.includes(name), `README.md names the demo person (${name})`);
  assert.ok(!readme.includes('TEMPLATE.md'), 'README.md names TEMPLATE.md, which a site does not have');
  assert.doesNotMatch(readme, /\btemplate\b(?!\.md)|\bdemo person\b|\bfictional person\b/i);
  assert.doesNotMatch(readme, /Not yet in this template/);
});

test('every file README.md names exists, and every pnpm command it gives is a script', () => {
  const isRepoPath = (token: string) =>
    (token.includes('/') || /^(README|AGENTS|CLAUDE)\.md$|^(package|tsconfig)\.json$|^next\.config\.ts$|^pnpm-workspace\.yaml$/.test(token)) &&
    !/[<>*…\s{}]|^\/|^https?:|^(node_modules|\.content|\.vercel|\.next|public\/skills|public\/blog|public\/projects)\/|^\.vercel\/|^(blog|projects)\/$|^site-fonts\/|^next\/|^@\/$|=/.test(token); // a section's folder; a module alias; a variable
  let checked = 0;
  for (const [, token] of readme.matchAll(/`([^`\n]+)`/g)) {
    if (!isRepoPath(token)) continue;
    assert.ok(existsSync(join(root, token)), `README.md names ${token}`);
    checked += 1;
  }
  assert.ok(checked >= 20, `${checked} paths checked`);
  for (const [, name] of readme.matchAll(/^pnpm ([a-z][a-z:-]*)/gm)) assert.ok(name === 'install' || name in pkg.scripts, `pnpm ${name}`);
  for (const [, name] of readme.matchAll(/`pnpm ([a-z][a-z:-]*)[^`]*`/g)) assert.ok(name in pkg.scripts, `pnpm ${name}`);
});

test('only content/, public/, tests/ and TEMPLATE.md name the demo person', () => {
  const skip = new Set(['node_modules', '.next', '.content', '.git', '.vercel', 'content', 'public', 'tests', 'TEMPLATE.md', 'tsconfig.tsbuildinfo']);
  const text = /\.(md|ts|tsx|mts|mjs|js|css|json|ya?ml|txt|svg)$/;
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (skip.has(relative(root, path))) return [];
    return statSync(path).isDirectory() ? walk(path) : text.test(name) ? [path] : [];
  });
  for (const file of walk(root)) {
    const src = readFileSync(file, 'utf8');
    for (const name of demoNames) assert.ok(!src.includes(name), `${relative(root, file)} names the demo person (${name})`);
  }
});

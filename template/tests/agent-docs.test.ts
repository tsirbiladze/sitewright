// What agents are told (AGENTS.md, CLAUDE.md, the `site` skill) is in a shape every agent loads, names
// only files and commands that exist, holds no fact of a person (the owner's name, language and domain
// are in content/, and the instructions say where), and ends with the block `next dev` writes.
// Every path it checks is part of the template's code, so this passes in a person's site too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import pkg from '../package.json';
import { frontmatter } from '../lib/frontmatter';

const root = new URL('..', import.meta.url).pathname;
const skillDir = join(root, '.agents/skills/site');
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const pages = readdirSync(skillDir).filter((file) => file.endsWith('.md'));
/** Everything an agent may be given to read: path → text. */
const docs = new Map<string, string>([['AGENTS.md', read('AGENTS.md')], ...pages.map((file): [string, string] => [`.agents/skills/site/${file}`, readFileSync(join(skillDir, file), 'utf8')])]);

test('the skill follows the open Agent Skills format: its name is its folder, and a description every agent accepts', () => {
  const { data } = frontmatter(readFileSync(join(skillDir, 'SKILL.md'), 'utf8'));
  // Only the two fields of the open format: a field one agent adds is an error to another.
  assert.deepEqual(Object.keys(data), ['name', 'description']);
  assert.equal(data.name, 'site');
  assert.match(data.name, /^[a-z0-9]+(-[a-z0-9]+)*$/);
  assert.ok(data.description.length > 0 && data.description.length <= 1024, `${data.description.length} characters`);
});

test('Claude Code reads the same skill: .claude/skills/site is a relative link to .agents/skills/site', () => {
  assert.equal(realpathSync(join(root, '.claude/skills/site')), realpathSync(skillDir));
  assert.equal(readdirSync(join(root, '.claude/skills'), { withFileTypes: true }).find((e) => e.name === 'site')?.isSymbolicLink(), true);
});

test('CLAUDE.md is AGENTS.md, imported, so the two cannot drift apart', () => {
  assert.equal(read('CLAUDE.md').trim(), '@AGENTS.md');
});

test('AGENTS.md ends with the block `next dev` writes, exactly as this version of Next writes it', () => {
  const agentFiles = createRequire(import.meta.url)('next/dist/server/lib/generate-agent-files.js') as { hasCurrentAgentRules: (dir: string) => boolean; AGENT_RULES_END_MARKER: string };
  assert.equal(agentFiles.hasCurrentAgentRules(root), true, 'next dev would rewrite AGENTS.md');
  assert.ok(read('AGENTS.md').trimEnd().endsWith(agentFiles.AGENT_RULES_END_MARKER));
});

test('the skill’s pages link to each other and to nothing that is missing', () => {
  const linked = new Set<string>();
  for (const file of pages) {
    for (const [, target] of readFileSync(join(skillDir, file), 'utf8').matchAll(/\]\(([^)\s]+)\)/g)) {
      if (/^([a-z]+:|\/)/.test(target)) continue; // an address, or a path on the site
      assert.ok(existsSync(join(skillDir, target)), `${file} links to ${target}`);
      linked.add(target);
    }
  }
  // No page is left out of reach: SKILL.md is the entry, every other page is linked from one.
  for (const file of pages.filter((page) => page !== 'SKILL.md')) assert.ok(linked.has(file), `${file} is linked from no page`);
});

test('every file of the repo the instructions name exists', () => {
  // A path as the docs write one: has a slash (or is a file at the root), and is not a pattern, an
  // address of the site, a command, or something a build, a fetch or an edit makes.
  const isRepoPath = (token: string) =>
    (token.includes('/') || /^(README|AGENTS|CLAUDE)\.md$|^[\w.-]+\.(json|yaml|ts|mjs)$/.test(token)) &&
    !/[<>*…\s]|^\/|^https?:|^(node_modules|\.content|public\/skills|public\/blog|public\/projects)\//.test(token);
  let checked = 0;
  for (const [path, text] of docs) {
    for (const [, token] of text.matchAll(/`([^`\n]+)`/g)) {
      if (!isRepoPath(token)) continue;
      assert.ok(existsSync(join(root, token)), `${path} names ${token}`);
      checked += 1;
    }
  }
  assert.ok(checked >= 15, `${checked} paths checked`);
});

test('every pnpm command the instructions give is a script of package.json', () => {
  const scripts = new Set<string>();
  for (const text of docs.values()) for (const [, name] of text.matchAll(/`(?:SITE_GO_LIVE=\S+ )?pnpm ([a-z][a-z:-]*)[^`]*`/g)) scripts.add(name);
  for (const name of ['preview', 'test', 'check', 'go-live', 'domain']) assert.ok(scripts.has(name), `the instructions name pnpm ${name}`);
  for (const name of scripts) assert.ok(name in pkg.scripts, `pnpm ${name}`);
});

test('the instructions end at a preview: the public steps are pnpm commands behind the mark, no raw production command', () => {
  assert.match(docs.get('AGENTS.md')!, /Work ends at a Vercel preview, made with `pnpm preview`\./);
  for (const [path, text] of docs) {
    assert.doesNotMatch(text, /--prod\b|vercel (promote|alias|domains|dns|api)\b/, path);
    // pnpm go-live and pnpm domain, written as commands, carry the mark; --check needs none.
    for (const [command] of text.matchAll(/`[^`]*pnpm (?:go-live|domain)[^`]*`/g))
      if (!/^`pnpm (go-live|domain)`$|--check/.test(command)) assert.match(command, /^`SITE_GO_LIVE=<domain> pnpm (go-live|domain)`$/, `${path}: ${command}`);
  }
});

test('the instructions hold no fact of a person: the owner’s name, language and domain are read from content/', () => {
  const demo = JSON.parse(readFileSync(join(root, 'tests/fixtures/site/content/en/site.json'), 'utf8')).name as string;
  const kaDemo = JSON.parse(readFileSync(join(root, 'tests/fixtures/site/content/ka/site.json'), 'utf8')).name as string;
  for (const [path, text] of docs) {
    for (const name of [demo, kaDemo, ...demo.split(' '), ...kaDemo.split(' ')]) assert.ok(!text.includes(name), `${path} names the demo person (${name})`);
    // A domain in the instructions is only an example (example.com, example.org) or Vercel's own.
    for (const [domain] of text.matchAll(/\b(?:[a-z0-9-]+\.)+(?:com|org|net|dev|io|ge|app)\b/g))
      assert.match(domain, /(^|\.)example\.(com|org)$|(^|\.)vercel\.app$|^vercel-dns\.com$/, `${path} names ${domain}`);
  }
  assert.match(docs.get('AGENTS.md')!, /`name` in `content\/<lang>\/site\.json`/);
  assert.match(docs.get('AGENTS.md')!, /`domain` in `content\/site\.json`/);
});

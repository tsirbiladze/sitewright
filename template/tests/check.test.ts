// `pnpm check` (scripts/check-content.ts), run as a person runs it, in a copy of the demo: what it says
// about the content, and that each problem ends it with one line that says what to do.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { editJson, fixtures, root, slug, useSite } from './helpers';

/** Runs `pnpm check`'s command in the working directory (a copy made by useSite). */
function check() {
  const r = spawnSync(process.execPath, ['--import', join(root, 'tests/register.mjs'), join(root, 'scripts/check-content.ts')], { cwd: process.cwd(), encoding: 'utf8' });
  return { status: r.status, out: `${r.stdout}${r.stderr}`.trim() };
}

test('the demo passes: its pages and its placeholders are listed', () => {
  useSite();
  const r = check();
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /^content: example\.com, en \+ ka/m);
  assert.match(r.out, /placeholder\(s\) to fill:/);
});

test('an agent skill not fetched yet: one line that names pnpm fetch-skills, not a stack trace', () => {
  const dir = useSite();
  cpSync(join(fixtures, 'skill-project.json'), join(dir, 'content/projects', `${slug}.json`));
  rmSync(join(dir, '.content'), { recursive: true, force: true });
  const r = check();
  assert.equal(r.status, 1);
  assert.equal(r.out, `.content/skills/${slug} is missing: run pnpm fetch-skills (the agent skill’s page text comes from example/fixture; pnpm dev and pnpm build fetch it first)`);
});

test('a name outside 6 to 30 characters: a note on what the masthead promises it, and the check passes', () => {
  useSite();
  editJson('en/site.json', (s) => { s.name = 'Al Bo'; });
  const r = check();
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /^note: content\/en\/site\.json: "name" has 5 characters: below 6 the masthead draws it as large as a 6-character name, so it stops short of the right margin \(it never runs past it\)$/m);
  assert.doesNotMatch(r.out, /content\/ka\/site\.json: "name" has/);
});

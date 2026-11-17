// Nothing of the source site's owner ships in the template: not his name in either script, his domain,
// his address, his skill, his prices or his phrases. The strings are written backwards here, so this
// file does not match itself. The skill's name may appear in tests only (it does not, today).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { root } from './helpers';

const back = (s: string) => [...s].reverse().join('');
const forbidden = ['ekinroT', 'ezdalibriS', 'ezdalibrist', 'ეკინროთ', 'ეძალიბრის', 'moc.liamg@ezdalibris.ekinrot', '₾ 000,2', '₾ 000 2', 'ბეგრავომ ეზნეშ'].map(back);
const testsOnly = [back('buhscitsigol')];
const skip = new Set(['node_modules', '.next', '.content', '.git']);

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    // A link (.claude/skills/site) points at files the walk reads where they are.
    if (skip.has(e.name) || e.isSymbolicLink()) return [];
    const path = join(dir, e.name);
    return e.isDirectory() ? files(path) : [path];
  });
}

test('no file of the template holds the source site owner’s name, address, prices or phrases', () => {
  let checked = 0;
  for (const file of files(root)) {
    if (/\.(png|webp|ttf|pdf|ico)$/.test(file)) continue;
    const text = readFileSync(file, 'utf8').replace(/ /g, ' ');
    const rel = relative(root, file);
    for (const s of forbidden) assert.ok(!text.toLowerCase().includes(s.toLowerCase()), `${rel} contains "${s}"`);
    if (!rel.startsWith('tests/')) for (const s of testsOnly) assert.ok(!text.includes(s), `${rel} contains "${s}" (allowed in tests only)`);
    checked += 1;
  }
  assert.ok(checked > 100, `${checked} files`);
});

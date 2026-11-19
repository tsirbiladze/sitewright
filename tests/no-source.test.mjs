// Nothing of the source site's owner ships in the template, or reaches a site made from it: not his
// name in either script, his domain, his skill or a phrase of his site, written forwards or backwards.
// The check is this repository's, not the template's: a test under template/ is copied into every site
// the scaffold makes, together with the strings it looks for. His email address and his prices are
// written nowhere here: the address holds his surname, which is looked for, and to look for a price a
// file would have to hold it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { files, fullAnswers, made, root } from './helpers.mjs';

const back = (s) => [...s].reverse().join('');
/** His name in both scripts (the surname is in his domain and his email address too), his skill, a phrase of his site. */
const owner = ['Tornike', 'Sirbiladze', 'თორნიკე', 'სირბილაძე', 'logisticshub', 'შენზე მოვარგებ'];
const marks = owner.flatMap((s) => [s, back(s)]).map((s) => s.toLowerCase());

/** `path: mark` for every file under `dir` whose path or text holds a mark, in any case, and how many files were read. */
function hits(dir, skip) {
  const all = files(dir, skip);
  const found = [];
  for (const rel of all) {
    const text = /\.(png|webp|jpe?g|ttf|woff2?|pdf|ico)$/.test(rel) ? '' : readFileSync(join(dir, rel), 'utf8').replace(/ /g, ' ');
    const held = `${rel}\n${text}`.toLowerCase();
    for (const mark of marks) if (held.includes(mark)) found.push(`${rel}: ${mark}`);
  }
  return { found, read: all.length };
}

test('no file of the template holds the source site owner’s name, domain, skill or phrases, forwards or backwards', () => {
  const { found, read } = hits(join(root, 'template'), ['node_modules', '.next', '.content', '.git']);
  assert.deepEqual(found, []);
  assert.ok(read > 100, `${read} files`);
});

test('a site made from the template holds none of it, and no test that looks for it', () => {
  const { out } = made(fullAnswers());
  const { found, read } = hits(out);
  assert.deepEqual(found, []);
  assert.ok(read > 100, `${read} files`);
  assert.ok(existsSync(join(out, 'tests/helpers.ts')), 'the site keeps the template’s tests');
  assert.ok(!existsSync(join(out, 'tests/no-source.test.ts')), 'the template’s tests no longer carry this check');
});

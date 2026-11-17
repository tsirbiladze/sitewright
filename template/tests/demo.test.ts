// The template ships a fictional demo person in content/ and public/, and the tests run on a copy of
// it in tests/fixtures/site. This test keeps the two the same, file for file, so the demo people see
// is the demo that is tested.
//
// In a person's own site, content/ holds their content and this test is skipped. It runs only while
// the main language's `name` in content/<lang>/site.json is the demo person's own name, as the
// fixture writes it: no real person's site carries that fictional name, and a site whose content is
// still the demo does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { demo, root } from './helpers';

const json = (path: string) => { try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; } };

/** The main language's name in a folder's content/, or null. */
function mainName(dir: string): string | null {
  const lang = json(join(dir, 'content/site.json'))?.languages?.[0];
  return typeof lang === 'string' ? json(join(dir, `content/${lang}/site.json`))?.name ?? null : null;
}

const shipsTheDemo = mainName(root) !== null && mainName(root) === mainName(demo);

/** Every file under `dir`, relative to it; public/skills/ is written by the fetch, not shipped. */
function files(dir: string, under: string): string[] {
  const base = join(dir, under);
  if (!existsSync(base)) return [];
  const walk = (d: string): string[] => readdirSync(d).flatMap((name) => {
    const path = join(d, name);
    return statSync(path).isDirectory() ? walk(path) : [relative(dir, path)];
  });
  return walk(base).filter((f) => !f.startsWith('public/skills/')).sort();
}

test('content/ and public/ are the demo of tests/fixtures/site, file for file', { skip: shipsTheDemo ? false : 'content/ is this site’s own, not the template’s demo' }, () => {
  for (const under of ['content', 'public']) {
    const shipped = files(root, under);
    assert.deepEqual(shipped, files(demo, under), `${under}/: the same files (copy the change to tests/fixtures/site/${under}/ too)`);
    for (const file of shipped) assert.ok(readFileSync(join(root, file)).equals(readFileSync(join(demo, file))), `${file} differs from tests/fixtures/site/${file}`);
  }
});

// The site's own content/ and public/: the one test file that reads them (every other test runs on
// the demo in tests/fixtures/site). It checks only what must hold for any person, so it stays green
// while every sentence of the content changes: the content is valid, every page renders in each
// language it has, a page has exactly one call to action, every internal link leads to a page or a
// file (tests/site-checks.ts).
//
// An agent skill's page text is fetched from its repository by `pnpm build` and `pnpm dev`, never by
// the tests (no network): here each skill project gets the fixture skill's text in its place, without
// the fixture's own links (tests/helpers.ts standInSkill), so its pages render the way a fetched one does.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { standInSkill, useSite } from './helpers';
import { checkSite } from './site-checks';
import { ContentError, loadContent, placeholders } from '../lib/content';

let dir = '';
before(() => {
  dir = useSite({ live: true });
  let languages: string[] = [];
  try { languages = JSON.parse(readFileSync(join(dir, 'content/site.json'), 'utf8')).languages ?? []; } catch { /* the first test names the problem */ }
  const projects = join(dir, 'content/projects');
  for (const file of existsSync(projects) ? readdirSync(projects).filter((f) => f.endsWith('.json')) : []) {
    let kind: unknown;
    try { kind = JSON.parse(readFileSync(join(projects, file), 'utf8')).kind; } catch { continue; }
    if (kind === 'skill') standInSkill(dir, file.replace(/\.json$/, ''), languages);
  }
});

test('the content is valid: content/ loads with no problem', () => {
  try {
    loadContent();
  } catch (err) {
    if (err instanceof ContentError) assert.fail(`content/ has problems (pnpm check lists them):\n${err.message}`);
    throw err;
  }
});

test('every page renders in each language it has, with one call to action, and every internal link leads to a page or a file', async (t) => {
  const pages = await checkSite();
  assert.ok(pages >= 1, 'at least the home page');
  t.diagnostic(`${pages} pages checked; ${placeholders().length} [[placeholder]] still waiting for a fact (pnpm check lists them)`);
});

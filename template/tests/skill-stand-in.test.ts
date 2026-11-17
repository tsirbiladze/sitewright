// tests/live-content.test.ts stands the fixture skill's text in for the fetched text of any agent skill a
// site has. A site whose skill is not called "fixture" must pass its live checks with it: the fixture's
// links to its own pages (/skills/fixture/…) are not the site's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixtures, standInSkill, useSite } from './helpers';
import { checkSite } from './site-checks';

test('a site with an agent skill of its own passes the live checks on the stand-in text', async () => {
  const dir = useSite();
  cpSync(join(fixtures, 'skill-project.json'), join(dir, 'content/projects/glaze-notes.json'));
  standInSkill(dir, 'glaze-notes', ['en', 'ka']);
  const text = readFileSync(join(dir, '.content/skills/glaze-notes/en.md'), 'utf8');
  assert.match(text, /See the rules and \[GitHub\]\(https:\/\/github\.com\/example\/fixture\)/, 'an internal link keeps its words; an outside one stays');
  assert.match(text, /!\[A marked "demo" invoice\]\(https:\/\/raw\.githubusercontent\.com\//, 'the picture stays');
  assert.ok((await checkSite()) > 0);
});

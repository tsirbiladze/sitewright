// Everything that follows a skill's `ref` (content/projects/<slug>.json): links into the skill's own
// repo pinned to it (pinToRef), the claude.ai zip from that release or, for a branch, the latest
// release, and the CHANGELOG.md link. The project file is edited per ref; lib/projects.ts reads it
// again on every call outside a production build.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { useSite, slug, editJson } from './helpers';
import { getProject, pinToRef, type Project } from '../lib/projects';

const repo = 'example/fixture';
const gh = `https://github.com/${repo}`;

/** The fixture skill as lib/projects.ts builds it when its project file says `{ repo, ref }`. */
function skillAt(ref: string): Project {
  editJson(`projects/${slug}.json`, (p) => { p.repo = repo; p.ref = ref; });
  return getProject(slug)!;
}

let tag: Project;
let branch: Project;
before(() => {
  useSite({ skill: ['skill-repo-links'] });
  tag = skillAt('v0.2.0');
  branch = skillAt('main');
});

test('pinToRef pins blob, tree and raw links at main in this repo', () => {
  assert.equal(pinToRef(`${gh}/blob/main/README.md`, repo, 'v1.2.3'), `${gh}/blob/v1.2.3/README.md`);
  assert.equal(pinToRef(`${gh}/tree/main/docs`, repo, 'v1.2.3'), `${gh}/tree/v1.2.3/docs`);
  assert.equal(pinToRef(`${gh}/raw/main/rules.json`, repo, 'v1.2.3'), `${gh}/raw/v1.2.3/rules.json`);
  assert.equal(pinToRef(`${gh}/blob/main`, repo, 'v1'), `${gh}/blob/v1`, 'main at the very end');
});

test('pinToRef pins main wherever the link ends: anchor, query, bracket, quote, space', () => {
  for (const end of ['#install', '?plain=1', ')', '"', ' and more', '/x'])
    assert.equal(pinToRef(`${gh}/blob/main${end}`, repo, 'v1'), `${gh}/blob/v1${end}`, JSON.stringify(end));
  const md = `[a](${gh}/blob/main/a.md) and <a href="${gh}/tree/main">b</a>`;
  assert.equal(pinToRef(md, repo, 'v1'), `[a](${gh}/blob/v1/a.md) and <a href="${gh}/tree/v1">b</a>`, 'every occurrence');
});

test('pinToRef leaves everything else alone', () => {
  for (const url of [
    `${gh}/blob/mainline/README.md`, // another branch that starts with "main"
    `${gh}/blob/v0.1.0/README.md`, // already pinned
    `${gh}/issues/main`, // not a file view
    `${gh}`,
    `https://github.com/${repo}-extra/blob/main/README.md`, // another repo with the same prefix
    'https://github.com/other/repo/blob/main/README.md',
    `https://raw.githubusercontent.com/${repo}/main/docs/demo.png`, // images are self-hosted at build time
  ]) assert.equal(pinToRef(url, repo, 'v1'), url, url);
});

test('pinToRef reads the repo name literally, not as a pattern', () => {
  assert.equal(pinToRef('https://github.com/aXb/c/blob/main/x', 'a.b/c', 'v1'), 'https://github.com/aXb/c/blob/main/x');
  assert.equal(pinToRef('https://github.com/a.b/c/blob/main/x', 'a.b/c', 'v1'), 'https://github.com/a.b/c/blob/v1/x');
});

test('the skill’s page pins its links, its Markdown and "Read full SKILL.md" to the ref', () => {
  const doc = tag.docs.en!;
  assert.equal(doc.source, `${gh}/blob/v0.2.0/skills/fixture/SKILL.md`);
  for (const text of [doc.html, doc.markdown]) {
    assert.ok(text.includes(`${gh}/blob/v0.2.0/skills/fixture/SKILL.md`));
    assert.ok(text.includes(`${gh}/tree/v0.2.0/docs`));
    assert.ok(text.includes(`${gh}/raw/v0.2.0/rules.json`));
    assert.ok(text.includes(`${gh}/blob/v0.2.0/README.md#install`));
    assert.ok(text.includes(`${gh}/blob/mainline/README.md`));
    assert.ok(text.includes(`https://github.com/${repo}-extra/blob/main/README.md`));
  }
  assert.doesNotMatch(doc.markdown, /fixture\/(blob|tree|raw)\/main\b/);
  assert.doesNotMatch(doc.html, /href="[^"]*fixture\/(blob|tree|raw)\/main\b/);
  assert.match(doc.markdown, new RegExp(`Licence: ${gh}/blob/v0\\.2\\.0/LICENSE`), 'a bare URL in the Markdown');
  assert.match(doc.html, new RegExp(`<a href="${gh}/blob/v0\\.2\\.0/LICENSE">`), 'a bare URL’s link');
  assert.match(doc.html, new RegExp(`<a href="${gh}">The repo</a>`));
  assert.equal(tag.changelogUrl, `${gh}/blob/v0.2.0/CHANGELOG.md`);
});

test('a bare URL into the repo shows the pinned address it links to', () => {
  assert.match(tag.docs.en!.html, new RegExp(`<a href="${gh}/blob/v0\\.2\\.0/LICENSE">${gh}/blob/v0\\.2\\.0/LICENSE</a>`));
});

/** The claude.ai tab's download link. */
const zip = (skill: Project) => {
  const tab = skill.install.find((t) => t.id === 'claude-ai');
  assert.ok(tab && 'download' in tab, 'the claude.ai tab offers a download');
  return tab.download.href;
};

test('a version ref downloads the zip attached to that release', () => {
  assert.equal(zip(tag), `${gh}/releases/download/v0.2.0/fixture-skill.zip`);
});

test('a branch ref falls back to the latest release, and pins nothing', () => {
  assert.equal(zip(branch), `${gh}/releases/latest`);
  assert.equal(branch.docs.en!.source, `${gh}/blob/main/skills/fixture/SKILL.md`);
  assert.equal(branch.changelogUrl, `${gh}/blob/main/CHANGELOG.md`);
});

test('a version without the v, or with more parts, is a release too; anything else is a branch', () => {
  assert.equal(zip(skillAt('1.4.0')), `${gh}/releases/download/1.4.0/fixture-skill.zip`);
  assert.equal(zip(skillAt('v2')), `${gh}/releases/download/v2/fixture-skill.zip`);
  assert.equal(zip(skillAt('release-1.4')), `${gh}/releases/latest`);
});

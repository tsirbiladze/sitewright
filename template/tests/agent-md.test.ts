// The agent formats: /llms.txt, /llms-full.txt, /projects.md and the .md twins, on the demo content
// with the fixture skill added.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { useSite, slug, siteUrl as site } from './helpers';

let md: typeof import('../lib/agent-md');
let getProject: typeof import('../lib/projects').getProject;
before(async () => {
  useSite({ skill: true });
  md = await import('../lib/agent-md');
  ({ getProject } = await import('../lib/projects'));
});

/** Every Markdown link and image target, minus in-page anchors. */
const targets = (text: string) => [...text.matchAll(/\]\(([^)\s]+)/g)].map((m) => m[1]).filter((u) => !u.startsWith('#'));

test('absolutize makes site-relative links absolute and leaves the rest', () => {
  const out = md.absolutize('[a](/x) ![b](/img.png) [c](https://e.com/y) [d](//cdn.example/z) [e](#top)\n[ref]: /docs\n<img src="/p.png"> <a href="//x.y/">');
  assert.equal(out, `[a](${site}/x) ![b](${site}/img.png) [c](https://e.com/y) [d](//cdn.example/z) [e](#top)\n[ref]: ${site}/docs\n<img src="${site}/p.png"> <a href="//x.y/">`);
});

test('a skill’s English twin: header, meta, install, body and the changelog', () => {
  const out = md.projectMarkdown(getProject(slug)!, 'en');
  assert.ok(out.startsWith('# The /fixture Skill\n\n> Checks fixture documents: one line, quoted.\n\n- Category: Test documents\n'));
  assert.match(out, /^- Version: 0\.2\.0$/m);
  assert.match(out, /^- Updated: 1 Dec 2026$/m);
  assert.match(out, new RegExp(`^- Page: ${site}/projects/${slug}$`, 'm'));
  assert.match(out, new RegExp(`^- Georgian version: ${site}/ka/projects/${slug}\\.md$`, 'm'));
  assert.match(out, /^## Install$/m);
  assert.match(out, /^## What it does$/m);
  for (const t of targets(out)) assert.match(t, /^https:\/\//, `absolute link: ${t}`);
  assert.match(out, new RegExp(`!\\[A marked "demo" invoice\\]\\(${site}/skills/fixture/demo\\.png\\)`));
});

test('the changelog keeps the repo’s own Markdown', () => {
  const out = md.projectMarkdown(getProject(slug)!, 'en');
  const changelog = out.slice(out.indexOf('## Changelog'));
  assert.match(changelog, /^### Unreleased\n\n- Nothing yet\.$/m);
  assert.match(changelog, /^### 0\.2\.0 \(1 Dec 2026\)\n\nFirst line with `inline code` and a \[link\]\(https:\/\/example\.com\)\.\n\n#### Fixed\n\n- A fix\.$/m);
  assert.match(changelog, /^### 0\.1\.0\n\nFirst release\.$/m);
});

test('the Georgian twin is all Georgian and lists the released versions, like its page', () => {
  const out = md.projectMarkdown(getProject(slug)!, 'ka');
  assert.ok(out.startsWith('# სკილი /fixture\n\n> ამოწმებს სატესტო დოკუმენტებს.\n\n- კატეგორია: სატესტო დოკუმენტები\n'));
  assert.match(out, /^- სტატუსი: სტაბილური$/m);
  assert.match(out, /^- ბოლო განახლება: 1 დეკემბერი 2026$/m);
  assert.match(out, new RegExp(`^- ინგლისური ვერსია: ${site}/projects/${slug}\\.md$`, 'm'));
  assert.match(out, /^## ინსტალაცია$/m);
  assert.doesNotMatch(out, /Changelog|Category|Install\n/);
  // No CHANGELOG.ka.md in the fixture: released versions with Georgian dates, and a link to the English file.
  assert.match(out, /^## ცვლილებები\n\n- 0\.2\.0 \(1 დეკემბერი 2026\)\n- 0\.1\.1 \(14 ნოემბერი 2026\)\n- 0\.1\.0$/m);
  assert.doesNotMatch(out, /Unreleased/);
  assert.match(out, /ინგლისურად არის აღწერილი ფაილში \[CHANGELOG\.md\]\(https:\/\/github\.com\/[^)]+\/CHANGELOG\.md\)/);
  for (const t of targets(out)) assert.match(t, /^https:\/\//);
});

test('install tabs become sections with one fenced block per command', () => {
  for (const name of [slug, 'menu-cards']) {
    const project = getProject(name)!;
    const out = md.projectMarkdown(project, 'en');
    assert.ok(project.install.length > 0, name);
    for (const tab of project.install) {
      assert.match(out, new RegExp(`^### ${tab.label.en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'));
      if ('commands' in tab) for (const c of tab.commands) assert.ok(out.includes('```' + (tab.language ?? 'bash') + '\n' + c + '\n```'), c);
      else assert.ok(out.includes(tab.download.href));
    }
  }
});

test('a plain project’s twin: its facts, its address, its install box and its text', () => {
  const out = md.projectMarkdown(getProject('menu-cards')!, 'en');
  assert.ok(out.startsWith('# Menu cards\n\n> Turns a café’s menu, kept in a spreadsheet, into a printed card and a menu page.\n\n- Category: Tools\n- Status: Stable\n- Updated: 20 Oct 2026\n'));
  assert.match(out, new RegExp(`^- Georgian version: ${site}/ka/projects/menu-cards\\.md$`, 'm'));
  assert.match(out, /^## What it does$/m);
  assert.doesNotMatch(out, /Changelog|Version:/, 'a plain project has no releases');
});

/**
 * llmstxt.org: an H1 with the name, a blockquote summary, optional paragraphs without headings, then
 * H2 sections that are lists of `- [name](url)` with optional `: notes`.
 */
export function assertLlmsTxt(text: string) {
  const blocks = text.trim().split(/\n{2,}/);
  assert.match(blocks[0], /^# \S/, 'starts with an H1');
  assert.match(blocks[1], /^> \S/, 'then a blockquote summary');
  let inSection = false;
  for (const block of blocks.slice(2)) {
    if (block.startsWith('## ')) { inSection = true; continue; }
    assert.doesNotMatch(block, /^#/m, `no other headings: ${block}`);
    if (!inSection) continue;
    for (const line of block.split('\n')) assert.match(line, /^- \[[^\]]+\]\((https:\/\/|mailto:)[^)\s]+\)(: .+)?$/, `list item: ${line}`);
  }
  assert.ok(inSection, 'has at least one H2 section');
}

test('/llms.txt follows llmstxt.org, every link absolute', () => {
  const out = md.llmsTxt();
  assertLlmsTxt(out);
  assert.ok(out.startsWith('# Elisabed Shabloni\n\n> A fictional front-end developer'));
  assert.ok(out.includes('English is the main language; Georgian pages live under /ka/.'));
  assert.ok(out.includes(`(${site}/projects/${slug}.md): Checks fixture documents: one line, quoted.`));
  assert.ok(out.includes(`(${site}/ka/projects/${slug}.md): ამოწმებს სატესტო დოკუმენტებს.`));
  assert.ok(out.includes(`- [A bakery’s website](https://bakery.example.org): `), 'a plain project without a page: its own address');
  assert.ok(out.includes(`${site}/llms-full.txt`));
  assert.ok(out.includes('(mailto:elisabed@example.com)'));
  assert.ok(out.includes(`- [Code](https://code.example.com/elisabed)`), 'a profile link, named in the main language');
  assert.doesNotMatch(out, /LinkedIn/, 'a placeholder link is not a link yet');
  assert.ok(out.includes(`- [RSS](${site}/ka/blog/feed.xml): `), 'the Georgian section lists its feed');
  assert.match(out, /^## Georgian$/m);
});

test('/llms-full.txt is llms.txt plus every project page of the main language', () => {
  const out = md.llmsFullTxt();
  assert.ok(out.startsWith(md.llmsTxt()));
  assert.ok(out.includes(md.projectMarkdown(getProject(slug)!, 'en')));
  assert.ok(out.includes(md.projectMarkdown(getProject('menu-cards')!, 'en')));
  assert.doesNotMatch(out, /# A bakery’s website/, 'no page, no twin');
});

test('/projects.md lists each project with its facts, install line and absolute links', () => {
  const out = md.projectsIndexMarkdown();
  assert.ok(out.startsWith('# Projects – Elisabed Shabloni\n\n> '));
  assert.match(out, /^## The \/fixture Skill$/m);
  assert.match(out, /^- Status: Stable$/m);
  assert.match(out, new RegExp(`^- Markdown: ${site}/projects/${slug}\\.md$`, 'm'));
  assert.match(out, /^- Address: https:\/\/bakery\.example\.org$/m);
  assert.ok(out.includes('```bash\nnpx skills@latest add example/fixture\n```'));
  assert.ok(out.trimEnd().endsWith(`See packages from 1,500 ₾: ${site}/work`));
  for (const url of out.match(/https?:\/\/\S+/g)!) assert.match(url, /^https:\/\//);
});

test('markdownResponse sets the type, UTF-8 and noindex', async () => {
  const res = md.markdownResponse('# ქართული');
  assert.equal(res.headers.get('content-type'), 'text/markdown; charset=utf-8');
  assert.equal(res.headers.get('x-robots-tag'), 'noindex');
  assert.equal(await res.text(), '# ქართული');
});

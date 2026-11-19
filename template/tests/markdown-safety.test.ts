// What rendered Markdown may carry (lib/projects.ts, lib/blog.ts). An agent skill's page text and
// changelog are fetched from its own repository and go into the page as HTML, so no Markdown brings
// markup of its own: raw HTML is shown as the text it is, and a link or an image goes only to
// http(s), an address of the site, or (a link) mailto. The fetched text is the fixture skill's,
// rewritten per test in the copy of the site (.content/skills/fixture), as a fetch would leave it.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { useSite, slug, editJson } from './helpers';

let projects: typeof import('../lib/projects');
let blog: typeof import('../lib/blog');
let dir = '';
before(async () => {
  dir = useSite({ skill: true });
  projects = await import('../lib/projects');
  blog = await import('../lib/blog');
});

const gh = 'https://github.com/example/fixture';
const front = '---\ntitle: T\nsummary: S\ncategory: C\nstatus: stable\n---\n\n';
/** The skill's page, built from this Markdown as its fetched text. */
const fetched = (markdown: string) => {
  writeFileSync(join(dir, '.content/skills', slug, 'en.md'), front + markdown);
  return projects.getProject(slug)!.docs.en!.html;
};
/** The skill's changelog, built from this Markdown as its fetched CHANGELOG.md. */
const fetchedChangelog = (markdown: string) => {
  writeFileSync(join(dir, '.content/skills', slug, 'CHANGELOG.md'), `## 0.2.0 — 2026-12-01\n\n${markdown}`);
  return projects.getProject(slug)!.changelog[0].html;
};
const render = (markdown: string) => projects.renderMarkdownForTest(markdown, 'en').html;
/** The elements a piece of HTML holds, each named once. */
const elements = (html: string) => [...new Set([...html.matchAll(/<([a-z][a-z0-9]*)/gi)].map((m) => m[1].toLowerCase()))].sort();
/** What stands in for script in these tests: none of it may be left where a browser would run it. */
const cases = [
  '<img src=x onerror="alert(1)">',
  '<script>alert(1)</script>',
  'Text with <script>alert(1)</script> and <b onmouseover="alert(1)">bold</b> inside.',
  '<div>\n\n[inside a block](javascript:alert(1))\n\n</div>',
  // marked passes the text after an opening <pre> through as written; the paragraph's own </p> would close this tag.
  'Text <pre><img src=x onerror=alert(1) </pre>',
  '<iframe src="https://a.example/"></iframe>',
  '<a href="javascript:alert(1)">a link</a>',
];

test('raw HTML in a skill’s fetched text is shown as text, a script included', () => {
  assert.equal(fetched('<img src=x onerror="alert(1)">\n'), '<p>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</p>\n');
  assert.equal(fetched('<script>alert(2)</script>\n'), '<p>&lt;script&gt;alert(2)&lt;/script&gt;</p>\n');
  assert.equal(fetched('Run <script>alert(2)</script> now.\n'), '<p>Run &lt;script&gt;alert(2)&lt;/script&gt; now.</p>\n');
  for (const markdown of cases) assert.deepEqual(elements(fetched(`${markdown}\n`)), ['p'], markdown);
  // Markdown itself still makes its elements around it.
  assert.equal(fetched('**Bold** and <b>bold</b>.\n'), '<p><strong>Bold</strong> and &lt;b&gt;bold&lt;/b&gt;.</p>\n');
});

test('a comment in the Markdown is left out of the page', () => {
  assert.equal(render('<!-- a note to the next editor -->\n\nText <!-- and one inside --> goes on.\n'), '<p>Text  goes on.</p>\n');
  assert.deepEqual(elements(render('<!-- a --><script>alert(1)</script><!-- b -->\n')), []);
});

test('a link’s address cannot leave its attribute', () => {
  assert.equal(fetched('[x](https://a.example/"onmouseover="alert(3))\n'), '<p><a href="https://a.example/&quot;onmouseover=&quot;alert(3)">x</a></p>\n');
  assert.equal(render('[x](<https://a.example/?a=1&b="2"> "a title")\n'), '<p><a href="https://a.example/?a=1&amp;b=&quot;2&quot;">x</a></p>\n');
});

test('a link goes to http(s), the site or mailto; any other keeps its words and loses the link', () => {
  for (const address of [
    'javascript:alert(4)',
    'JaVaScRiPt:alert(4)',
    'javascript&colon;alert(4)', // a browser decodes the character reference
    'javascript&#58;alert(4)',
    '&#106;avascript:alert(4)',
    '<java\tscript:alert(4)>', // and drops a tab inside the scheme
    '< javascript:alert(4)>',
    'data:text/html,<script>alert(4)</script>',
    'vbscript:msgbox(4)',
    'file:///etc/passwd',
  ]) assert.equal(fetched(`[the words](${address})\n`), '<p>the words</p>\n', address);
  assert.equal(fetched('<javascript:alert(4)>\n'), '<p>javascript:alert(4)</p>\n', 'an autolink');
  assert.equal(fetched('[the words][ref]\n\n[ref]: javascript:alert(4)\n'), '<p>the words</p>\n', 'a reference link');
  assert.equal(fetched('[*the* `words`](javascript:alert(4))\n'), '<p><em>the</em> <code>words</code></p>\n', 'the words keep their own Markdown');
});

test('an image comes from http(s) or the site; any other is left out, and its address cannot leave its attribute', () => {
  for (const address of ['javascript:alert(5)', 'data:image/svg+xml,<svg/onload=alert(5)>', 'vbscript:msgbox(5)', 'javascript&colon;alert(5)', 'mailto:lia@testadze.example'])
    assert.deepEqual(elements(fetched(`Before ![a picture](${address}) after.\n`)), ['p'], address);
  assert.equal(fetched('Before ![a picture](javascript:alert(5)) after.\n'), '<p>Before  after.</p>\n');
  // A paragraph that is one image becomes a figure linking to it: neither tag takes the attribute.
  const html = fetched('![a "picture" <b>](https://a.example/x.png"onerror="alert(5))\n');
  assert.match(html, /^<figure><a class="zoom" href="https:\/\/a\.example\/x\.png&quot;onerror=&quot;alert\(5\)"><img src="https:\/\/a\.example\/x\.png&quot;onerror=&quot;alert\(5\)" alt="a &quot;picture&quot; &lt;b&gt;" loading="lazy" decoding="async"><span /);
  assert.deepEqual(elements(html), ['a', 'figure', 'img', 'path', 'span', 'svg']);
});

test('a bare URL shown at its pinned address is shown as text', () => {
  const address = `${gh}/blob/main/<svg/onload=alert(6)>`;
  const html = fetched(`[${address}](${address})\n`);
  assert.equal(html, `<p><a href="${gh}/blob/v0.2.0/&lt;svg/onload=alert(6)&gt;">${gh}/blob/v0.2.0/&lt;svg/onload=alert(6)&gt;</a></p>\n`);
});

test('a skill’s fetched changelog follows the same rule', () => {
  const html = fetchedChangelog('- <img src=x onerror=alert(7)> and [the notes](javascript:alert(7)), [more](javascript&colon;alert(7)), ![a picture](javascript:alert(7)).\n- [The release](https://github.com/example/fixture/releases/tag/v0.2.0 "Its page") stays.\n');
  assert.equal(html, '<ul>\n<li>&lt;img src=x onerror=alert(7)&gt; and the notes, more, .</li>\n<li><a href="https://github.com/example/fixture/releases/tag/v0.2.0" title="Its page">The release</a> stays.</li>\n</ul>\n');
});

test('a blog post follows the same rule', () => {
  writeFileSync(join(dir, 'content/en/blog/markup.md'), '---\ntitle: Markup\ndate: 2026-11-18\n---\n\n<script>alert(8)</script>\n\nA [link](javascript:alert(8)), a [second](https://a.example/"onclick="alert(8)), a picture ![it](javascript:alert(8)) and <b>bold</b>.\n\n![A picture](/blog/a.png)\n');
  const { html } = blog.getPost('en', 'markup')!;
  assert.equal(html, '<p>&lt;script&gt;alert(8)&lt;/script&gt;</p>\n<p>A link, a <a href="https://a.example/&quot;onclick=&quot;alert(8)">second</a>, a picture  and &lt;b&gt;bold&lt;/b&gt;.</p>\n<p><img src="/blog/a.png" alt="A picture"></p>\n');
});

test('safeUrl: http(s), an address without a scheme, and mailto only for a link', () => {
  const { safeUrl } = projects;
  for (const url of ['https://a.example/x', 'HTTP://a.example', '/projects', '/projects/a?b=1&c=2#d', '#notes', '?page=2', 'next-page', '../up', '//a.example/x', 'a/b:c', '/a&colon;b', ''])
    assert.ok(safeUrl(url), url);
  for (const url of ['javascript:alert(1)', ' javascript:alert(1)', 'java\nscript:alert(1)', 'javascript&colon;alert(1)', '&#x6A;avascript:alert(1)', 'data:text/html,x', 'vbscript:x', 'blob:x', 'tel:+995', 'mailto:lia@testadze.example'])
    assert.ok(!safeUrl(url), url);
  assert.ok(safeUrl('mailto:lia@testadze.example', { mailto: true }));
  assert.ok(!safeUrl('javascript:alert(1)', { mailto: true }));
});

test('links and images the site means to show are drawn as before', () => {
  assert.equal(
    render('[Home](/), [a page](https://a.example/a?b=1#d), [mail](mailto:lia@testadze.example), <https://a.example/>, https://a.example/b, <lia@testadze.example>, [up](#notes), [next](next-page "Next") and [ref].\n\n[ref]: https://a.example/ref\n'),
    '<p><a href="/">Home</a>, <a href="https://a.example/a?b=1#d">a page</a>, <a href="mailto:lia@testadze.example">mail</a>, <a href="https://a.example/">https://a.example/</a>, <a href="https://a.example/b">https://a.example/b</a>, <a href="mailto:lia@testadze.example">lia@testadze.example</a>, <a href="#notes">up</a>, <a href="next-page">next</a> and <a href="https://a.example/ref">ref</a>.</p>\n',
  );
  assert.match(render('![A "demo" picture](/projects/menu-cards/menu-wide.webp)\n'), /^<figure><a class="zoom" href="\/projects\/menu-cards\/menu-wide\.webp"><img src="\/projects\/menu-cards\/menu-wide\.webp" alt="A &quot;demo&quot; picture" loading="lazy" decoding="async"><span class="zoom__label"><svg /);
  assert.equal(render('Text with ![a picture](https://a.example/a.png) inside.\n'), '<p>Text with <img src="https://a.example/a.png" alt="a picture" loading="lazy" decoding="async"> inside.</p>\n');
  // A skill's links into its own repository are still pinned to the ref its text was fetched at.
  assert.equal(
    fetched(`[The skill](${gh}/blob/main/skills/fixture/SKILL.md), [the rules](/skills/fixture/rules) and ${gh}/tree/main/docs.\n`),
    `<p><a href="${gh}/blob/v0.2.0/skills/fixture/SKILL.md">The skill</a>, <a href="/skills/fixture/rules">the rules</a> and <a href="${gh}/tree/v0.2.0/docs">${gh}/tree/v0.2.0/docs</a>.</p>\n`,
  );
  // And a link into a section that is off still keeps its words and loses the link.
  editJson('site.json', (s) => { s.sections.work = false; });
  assert.equal(render('See [the offer](/work) and [the projects](/projects).\n'), '<p>See the offer and <a href="/projects">the projects</a>.</p>\n');
});

// The blog loader (lib/blog.ts): content/<lang>/blog/<slug>.md in a copy of the site, the Georgian
// posts from tests/fixtures/blog plus whatever a test writes.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixtures, demo, useSite, editJson } from './helpers';

let blog: typeof import('../lib/blog');
let dir = '';
let root = '';

before(async () => {
  root = useSite();
  dir = join(root, 'content/ka/blog');
  blog = await import('../lib/blog');
});

beforeEach(() => {
  rmSync(dir, { recursive: true, force: true });
  cpSync(join(fixtures, 'blog'), dir, { recursive: true });
});

const post = (file: string, src: string) => writeFileSync(join(dir, file), src);

test('lists published posts newest first, slug from the file name', () => {
  const posts = blog.getPosts('ka');
  assert.deepEqual(posts.map((p) => [p.slug, p.date]), [['newer-post', '2026-11-20'], ['older-post', '2026-11-02']]);
});

test('sorts by date, not by file name', () => {
  post('aaa-middle.md', '---\ntitle: შუა\ndate: 2026-11-10\n---\n\nText.\n');
  post('zzz-newest.md', '---\ntitle: ბოლო\ndate: 2026-12-01\n---\n\nText.\n');
  assert.deepEqual(blog.getPosts('ka').map((p) => p.slug), ['zzz-newest', 'newer-post', 'aaa-middle', 'older-post']);
});

test('reads title and summary, quoted or not, and keeps Georgian quotes inside them', () => {
  const [newer, older] = blog.getPosts('ka');
  assert.equal(newer.title, '„ახალი“ სატესტო პოსტი');
  assert.equal(newer.summary, '', 'a post without a summary gets an empty one');
  assert.equal(older.title, 'ძველი სატესტო პოსტი');
  assert.equal(older.summary, 'სატესტო პოსტი: ბრჭყალებში ჩასმული აღწერა.');
});

test('skips drafts, README.md and anything that is not Markdown', () => {
  const slugs = blog.getPosts('ka').map((p) => p.slug);
  for (const left of ['unfinished', 'ready-draft', 'README', 'notes']) assert.ok(!slugs.includes(left), left);
  // A draft is skipped before it is checked, so it may lack a title and a date.
  assert.doesNotThrow(() => blog.getPosts('ka'));
});

test('a published post without a title fails the build, naming the file', () => {
  post('no-title.md', '---\ndate: 2026-11-21\n---\n\nText.\n');
  assert.throws(() => blog.getPosts('ka'), { message: 'content/ka/blog/no-title.md: a published post needs a title and a date as YYYY-MM-DD' });
});

test('a published post without a date, or with another date format, fails the build', () => {
  post('no-date.md', '---\ntitle: სათაური\n---\n\nText.\n');
  assert.throws(() => blog.getPosts('ka'), /content\/ka\/blog\/no-date\.md: .*YYYY-MM-DD/);
  rmSync(join(dir, 'no-date.md'));
  post('spelled-date.md', '---\ntitle: სათაური\ndate: 21 Nov 2026\n---\n\nText.\n');
  assert.throws(() => blog.getPosts('ka'), /content\/ka\/blog\/spelled-date\.md/);
});

test('`draft: false` publishes; a post with no frontmatter at all fails clearly', () => {
  assert.ok(blog.getPost('ka', 'older-post'), 'older-post says draft: false');
  post('bare.md', 'Just text, no frontmatter.\n');
  assert.throws(() => blog.getPosts('ka'), /content\/ka\/blog\/bare\.md: a published post needs a title and a date/);
});

test('renders the Markdown, with code blocks reachable by keyboard', () => {
  const older = blog.getPost('ka', 'older-post')!;
  assert.match(older.html, /<h2>პირველი ნაწილი<\/h2>/);
  assert.match(older.html, /<pre tabindex="0"><code class="language-bash">npx skills@latest add example\/fixture/);
  assert.doesNotMatch(older.html, /^---/m, 'no frontmatter in the page');
});

test('getPost finds a post by slug and nothing else', () => {
  assert.equal(blog.getPost('ka', 'newer-post')?.title, '„ახალი“ სატესტო პოსტი');
  assert.equal(blog.getPost('ka', 'unfinished'), undefined, 'drafts have no page');
  assert.equal(blog.getPost('ka', 'ready-draft'), undefined, 'not even a finished one');
  assert.equal(blog.getPost('ka', 'nope'), undefined);
});

test('no blog folder means no posts, not an error', () => {
  rmSync(dir, { recursive: true, force: true });
  assert.deepEqual(blog.getPosts('ka'), []);
});

test('reading time: the language’s words a minute (150 in Georgian), at least one, code blocks not counted', () => {
  const words = (n: number) => Array.from({ length: n }, (_, i) => `სიტყვა${i}`).join(' ');
  assert.equal(blog.readingMinutes(''), 1);
  assert.equal(blog.readingMinutes(words(150)), 1);
  assert.equal(blog.readingMinutes(words(450)), 3);
  assert.equal(blog.readingMinutes(`${words(150)}\n\n\`\`\`\n${words(600)}\n\`\`\`\n`), 1, 'code is not reading');
  assert.equal(blog.readingMinutes('— – … ** ##'), 1, 'punctuation alone is no words');
  assert.equal(blog.getPost('ka', 'older-post')!.minutes, 1);
});

/** Runs `fn` with these environment variables set (or, for undefined, unset), then puts them back. */
function withEnv<T>(vars: Record<string, string | undefined>, fn: () => T): T {
  const env = process.env as Record<string, string | undefined>;
  const saved = Object.fromEntries(Object.keys(vars).map((k) => [k, env[k]]));
  const apply = (v: Record<string, string | undefined>) => { for (const [k, x] of Object.entries(v)) if (x === undefined) delete env[k]; else env[k] = x; };
  apply(vars);
  try { return fn(); } finally { apply(saved); }
}

test('drafts are previewed only with BLOG_DRAFTS=1, and never on Vercel or in CI', () => {
  const local = { BLOG_DRAFTS: '1', VERCEL: undefined, CI: undefined };
  assert.equal(withEnv(local, blog.draftPreview), true);
  assert.equal(withEnv({ ...local, BLOG_DRAFTS: undefined }, blog.draftPreview), false, 'no flag, no drafts');
  assert.equal(withEnv({ ...local, BLOG_DRAFTS: 'true' }, blog.draftPreview), false, 'the flag is exactly 1');
  assert.equal(withEnv({ ...local, VERCEL: '1' }, blog.draftPreview), false, 'a Vercel build ignores the flag');
  assert.equal(withEnv({ ...local, CI: 'true' }, blog.draftPreview), false, 'CI ignores the flag');
});

test('asked for drafts, getPosts adds the ones with a title and a date, marked and in date order', () => {
  const all = blog.getPosts('ka', { drafts: true });
  assert.deepEqual(all.map((p) => [p.slug, p.draft]), [['ready-draft', true], ['newer-post', false], ['older-post', false]]);
  assert.ok(!all.some((p) => p.slug === 'unfinished'), 'a draft without title and date cannot be previewed');
  assert.equal(blog.getPost('ka', 'ready-draft', { drafts: true })?.title, 'მონახაზი, სათაურითა და თარიღით');
  assert.ok(blog.getPosts('ka').every((p) => !p.draft));
});

test('the template post (content/<lang>/blog/template.md) is a draft that previews every part a post can have', () => {
  cpSync(join(demo, 'content/ka/blog/template.md'), join(dir, 'template.md'));
  assert.equal(blog.getPost('ka', 'template'), undefined, 'never published');
  const t = blog.getPost('ka', 'template', { drafts: true });
  assert.ok(t, 'it has a title and a date, so the preview shows it');
  assert.ok(t.draft);
  assert.match(t.title, /^\[\[.+\]\]$/, 'the title is a visible placeholder');
  assert.match(t.summary, /^\[\[.+\]\]$/);
  assert.match(t.html, /<code>draft: true<\/code>/, 'it says how it stays unpublished');
  for (const part of [/<h2>\[\[/, /<h3>\[\[/, /<ol>\n<li>\[\[/, /<ul>\n<li>\[\[/, /<pre tabindex="0"><code class="language-bash">/, /<blockquote>\n<p>\[\[/, /<a href="\/ka\/projects">/])
    assert.match(t.html, part);
  assert.doesNotMatch(t.html, /<h1|<img/, 'no second h1, and no image that would 404');
  assert.doesNotMatch(t.html, /lorem|ipsum/i);
});

/** Well-formed XML, roughly: every tag closed in order, every & an entity (CDATA aside). */
function assertWellFormed(text: string) {
  assert.ok(text.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n'));
  const body = text.replace(/^<\?xml[^>]*\?>/, '').replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '');
  assert.doesNotMatch(body, /&(?!amp;|lt;|gt;|quot;|apos;|#\d+;)/, 'a bare &');
  const stack: string[] = [];
  for (const [, close, name, self] of body.matchAll(/<(\/?)([\w:]+)[^>]*?(\/?)>/g)) {
    if (self) continue;
    if (close) assert.equal(stack.pop(), name, `</${name}> closes the open tag`);
    else stack.push(name);
  }
  assert.deepEqual(stack, [], 'every tag is closed');
}

test('the feed is RSS 2.0: the channel, then each published post newest first, in full', () => {
  const feed = blog.blogFeed('ka');
  assertWellFormed(feed);
  assert.match(feed, /<rss version="2\.0" xmlns:atom="http:\/\/www\.w3\.org\/2005\/Atom" xmlns:content="http:\/\/purl\.org\/rss\/1\.0\/modules\/content\/">/);
  assert.match(feed, /<title>ბლოგი – ელისაბედ შაბლონი<\/title>\n    <link>https:\/\/example\.com\/ka\/blog<\/link>\n    <description>ჩანაწერები პატარა, სწრაფი ვებგვერდების აწყობაზე\.<\/description>/);
  assert.match(feed, /<language>ka<\/language>/);
  assert.match(feed, /<atom:link href="https:\/\/example\.com\/ka\/blog\/feed\.xml" rel="self" type="application\/rss\+xml"\/>/);
  assert.match(feed, /<pubDate>Fri, 20 Nov 2026 00:00:00 GMT<\/pubDate>\n    <item>/, 'the channel dates from the newest post');
  const items = [...feed.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
  assert.equal(items.length, 2, 'drafts never');
  assert.match(items[0], /<title>„ახალი“ სატესტო პოსტი<\/title>/);
  assert.match(items[0], /<link>https:\/\/example\.com\/ka\/blog\/newer-post<\/link>\n      <guid isPermaLink="true">https:\/\/example\.com\/ka\/blog\/newer-post<\/guid>/);
  assert.match(items[0], /<pubDate>Fri, 20 Nov 2026 00:00:00 GMT<\/pubDate>/);
  assert.doesNotMatch(items[0], /<description>/, 'no summary, no description');
  assert.match(items[1], /<pubDate>Mon, 02 Nov 2026 00:00:00 GMT<\/pubDate>\n      <description>სატესტო პოსტი: ბრჭყალებში ჩასმული აღწერა\.<\/description>/);
  assert.match(items[1], /<content:encoded><!\[CDATA\[<h2>პირველი ნაწილი<\/h2>[\s\S]*<pre tabindex="0">[\s\S]*\]\]><\/content:encoded>/);
});

test('the feed escapes what XML must, and gives links and images their full address', () => {
  post('tricky.md', '---\ntitle: "A & B <C>"\ndate: 2026-12-02\nsummary: "1 < 2 & „3“"\n---\n\n[შიდა](/ka/work) [გარე](https://example.com/x) ![სურათი](/blog/a.png)\n\n<p>end ]]> here</p>\n');
  const feed = blog.blogFeed('ka');
  assertWellFormed(feed);
  const item = feed.match(/<item>([\s\S]*?)<\/item>/)![1];
  assert.match(item, /<title>A &amp; B &lt;C&gt;<\/title>/);
  assert.match(item, /<description>1 &lt; 2 &amp; „3“<\/description>/);
  assert.match(item, /href="https:\/\/example\.com\/ka\/work"/);
  assert.match(item, /href="https:\/\/example\.com\/x"/);
  assert.match(item, /src="https:\/\/example\.com\/blog\/a\.png"/);
  assert.match(item, /&lt;p&gt;end \]\]&gt; here&lt;\/p&gt;/, 'raw HTML is shown as text, so its ]]> cannot end the CDATA early');
});

test('the feed is valid with no posts: the channel alone, no date', () => {
  rmSync(dir, { recursive: true, force: true });
  const feed = blog.blogFeed('ka');
  assertWellFormed(feed);
  assert.match(feed, /<channel>[\s\S]*<title>[\s\S]*<link>[\s\S]*<description>[\s\S]*<\/channel>/);
  assert.doesNotMatch(feed, /<item>|<pubDate>/);
});

test('each language’s posts are its own: the English blog has the English post', () => {
  assert.deepEqual(blog.getPosts('en').map((p) => p.slug), ['small-and-fast']);
  assert.equal(blog.blogPath('en'), '/blog');
  assert.equal(blog.feedPath('ka'), '/ka/blog/feed.xml');
});

test('English posts get typographic quotes; Georgian ones stay as written', () => {
  assert.match(blog.getPost('en', 'small-and-fast')!.html, /can’t say what the business does/);
  assert.match(blog.getPost('ka', 'older-post')!.html, /<pre tabindex="0">/);
});

test('a link into a section that is off keeps its words and loses the link', () => {
  cpSync(join(demo, 'content/en/blog/template.md'), join(root, 'content/en/blog/template.md'));
  assert.match(blog.getPost('en', 'template', { drafts: true })!.html, /<a href="\/projects">the projects<\/a>/);
  editJson('site.json', (s) => { s.sections.projects = false; });
  const html = blog.getPost('en', 'template', { drafts: true })!.html;
  assert.doesNotMatch(html, /href="\/projects"/);
  assert.match(html, /the projects\./);
  editJson('site.json', (s) => { s.sections.projects = true; });
});

test('a language without the blog has no posts, even with files', () => {
  editJson('site.json', (s) => { s.sections.blog = false; });
  assert.deepEqual(blog.getPosts('ka'), []);
  editJson('site.json', (s) => { s.sections.blog = true; });
});

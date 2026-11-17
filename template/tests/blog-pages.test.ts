// The blog's pages as Next renders them (the second language's routes, app/(second)/[lang]/blog),
// rendered here with react-dom/server: the index with and without posts, the post template, and
// drafts, which get a page only in a local preview (BLOG_DRAFTS=1) and say so on it.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useSite, fixtures, demo } from './helpers';

type Params = { params: Promise<{ lang: string; slug: string }> };
let postPage: typeof import('../app/(second)/[lang]/blog/[slug]/page');
let indexPage: { default: (props: { params: Promise<{ lang: string }> }) => Promise<ReactElement>; generateMetadata: (props: { params: Promise<{ lang: string }> }) => Promise<Metadata> };
let dir = '';

before(async () => {
  dir = join(useSite(), 'content/ka/blog');
  postPage = await import('../app/(second)/[lang]/blog/[slug]/page');
  indexPage = await import('../app/(second)/[lang]/blog/page');
});

beforeEach(() => {
  rmSync(dir, { recursive: true, force: true });
  cpSync(join(fixtures, 'blog'), dir, { recursive: true });
  cpSync(join(demo, 'content/ka/blog/template.md'), join(dir, 'template.md'));
});

const env = process.env as Record<string, string | undefined>;
/** A local preview build: the flag set, not Vercel, not CI. */
async function preview<T>(fn: () => Promise<T> | T): Promise<T> {
  const saved = { BLOG_DRAFTS: env.BLOG_DRAFTS, VERCEL: env.VERCEL, CI: env.CI };
  env.BLOG_DRAFTS = '1';
  delete env.VERCEL;
  delete env.CI;
  try { return await fn(); } finally { for (const [k, v] of Object.entries(saved)) if (v === undefined) delete env[k]; else env[k] = v; }
}
/** The published build, whatever this machine's environment says. */
async function published<T>(fn: () => Promise<T> | T): Promise<T> {
  const saved = env.BLOG_DRAFTS;
  delete env.BLOG_DRAFTS;
  try { return await fn(); } finally { if (saved !== undefined) env.BLOG_DRAFTS = saved; }
}

const params = (slug: string): Params => ({ params: Promise.resolve({ lang: 'ka', slug }) });
const renderPost = async (slug: string) => renderToStaticMarkup(await postPage.default(params(slug)));
const renderIndex = async () => renderToStaticMarkup(await indexPage.default({ params: Promise.resolve({ lang: 'ka' }) }));
const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;
/** Heading levels in order: one h1 first, and no level skipped on the way down. */
function assertHeadings(html: string) {
  const levels = [...html.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
  assert.equal(levels[0], 1, 'the page starts with its h1');
  assert.equal(levels.filter((l) => l === 1).length, 1, 'one h1');
  levels.forEach((l, i) => i && assert.ok(l <= levels[i - 1] + 1, `h${levels[i - 1]} → h${l}`));
}

test('a post page: title, summary, date, reading time, the text, a way back and one CTA', async () => {
  const html = await published(() => renderPost('older-post'));
  // The title stands on the field's edge; the summary and the date follow it on mist.
  assert.match(html, /<div class="head head--text"><div class="page-head page-head--edge">/);
  assert.match(html, /<h1 class="title title--edge">ძველი სატესტო პოსტი<\/h1><\/div><\/div><div class="wrap page-intro page-intro--dip"><p class="summary">სატესტო პოსტი: ბრჭყალებში ჩასმული აღწერა\.<\/p>/);
  assert.match(html, /<time dateTime="2026-11-02">2 ნოემბერი 2026<\/time><span>1 წუთის საკითხავი<\/span>/);
  assert.match(html, /<article class="prose post-body"><h2>პირველი ნაწილი<\/h2>/);
  assert.match(html, /<pre tabindex="0"><code class="language-bash">/);
  assert.match(html, /<a href="\/ka\/blog">ბლოგის ყველა პოსტი<\/a>/);
  assert.equal(count(html, /class="cta"/g), 1);
  assert.match(html, /"@type":"BlogPosting","headline":"ძველი სატესტო პოსტი"/);
  assert.doesNotMatch(html, /მონახაზი/);
  assertHeadings(html);
});

test('a post page’s metadata: title, canonical, the feed, an article for sharing, indexable', async () => {
  const meta = await published(() => postPage.generateMetadata(params('older-post')));
  assert.equal(meta.title, 'ძველი სატესტო პოსტი');
  assert.equal(meta.alternates?.canonical, '/ka/blog/older-post');
  assert.deepEqual(meta.alternates?.types, { 'application/rss+xml': [{ url: '/ka/blog/feed.xml', title: 'ბლოგი – ელისაბედ შაბლონი' }] });
  assert.equal((meta.openGraph as { type?: string }).type, 'article');
  assert.match(String((meta.openGraph as { images?: { url: string }[] }).images?.[0].url), /^\/ka\/blog\/share\.png\?[0-9a-f]{12}$/, 'a post shares the blog’s image');
  assert.equal(meta.robots, undefined);
});

test('the published build has a page for each published post and none for drafts', async () => {
  assert.equal(postPage.dynamicParams, false, 'no post is rendered on demand');
  await published(async () => {
    assert.deepEqual(postPage.generateStaticParams(), [{ lang: 'ka', slug: 'newer-post' }, { lang: 'ka', slug: 'older-post' }]);
    await assert.rejects(renderPost('template'), /NEXT_HTTP_ERROR_FALLBACK;404/, 'the template is a 404');
    await assert.rejects(renderPost('ready-draft'), /NEXT_HTTP_ERROR_FALLBACK;404/);
    assert.deepEqual(await postPage.generateMetadata(params('template')), {});
  });
});

test('the preview builds the template through the post template, marked as a draft and kept out of search', async () => {
  await preview(async () => {
    assert.deepEqual(postPage.generateStaticParams().map((p) => p.slug), ['ready-draft', 'newer-post', 'older-post', 'template']);
    const html = await renderPost('template');
    assert.match(html, /<h1 class="title title--edge"><span class="ph">\[\[პოსტის სათაური\]\]<\/span><\/h1>/, 'a placeholder title is drawn as one');
    assert.match(html, /<span class="ph">მონახაზი: არ გამოქვეყნდება<\/span>/);
    assert.match(html, /<article class="prose post-body"><p>ეს პოსტის შაბლონია/);
    assert.doesNotMatch(html, /application\/ld\+json/, 'no structured data for a draft');
    assert.equal(count(html, /class="cta"/g), 1);
    assertHeadings(html);
    const meta = await postPage.generateMetadata(params('template'));
    assert.deepEqual(meta.robots, { index: false, follow: false });
  });
});

test('the index lists posts newest first and offers the feed, with one CTA', async () => {
  const html = await published(renderIndex);
  const titles = [...html.matchAll(/<h2><a href="\/ka\/blog\/([^"]+)">/g)].map((m) => m[1]);
  assert.deepEqual(titles, ['newer-post', 'older-post']);
  assert.match(html, /<a href="\/ka\/blog\/feed\.xml" type="application\/rss\+xml">\/ka\/blog\/feed\.xml<\/a>/);
  assert.equal(count(html, /class="cta"/g), 1);
  assert.doesNotMatch(html, /პირველი პოსტი მალე/);
  const meta = await indexPage.generateMetadata({ params: Promise.resolve({ lang: 'ka' }) });
  assert.deepEqual(meta.alternates?.types, { 'application/rss+xml': [{ url: '/ka/blog/feed.xml', title: 'ბლოგი – ელისაბედ შაბლონი' }] });
  assertHeadings(html);
});

test('with no posts the index says so (content/ka/blog.json "empty") and points to the feed', async () => {
  rmSync(dir, { recursive: true, force: true });
  const html = await published(renderIndex);
  assert.match(html, /<div class="empty"><p>პირველი პოსტი მალე გამოჩნდება\.<\/p><\/div>/);
  assert.match(html, /href="\/ka\/blog\/feed\.xml"/);
  assert.equal(count(html, /class="cta"/g), 1);
});

test('drafts in the published index: never; in the preview: listed and marked', async () => {
  assert.doesNotMatch(await published(renderIndex), /blog\/template|ready-draft|მონახაზი/);
  const html = await preview(renderIndex);
  assert.match(html, /<span class="ph">მონახაზი: არ გამოქვეყნდება<\/span><\/p><h2><a href="\/ka\/blog\/ready-draft">/);
  assert.match(html, /href="\/ka\/blog\/template"/);
  assert.equal(count(html, /მონახაზი: არ გამოქვეყნდება/g), 2, 'only the two drafts are marked');
});

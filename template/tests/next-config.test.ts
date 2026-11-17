// next.config.ts as `next build` (production) sees it: the response headers and rewrites, and what the
// content decides: which sections are routes (pageExtensions), which fonts each layout gets, the
// rewrites for the second language.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import type { NextConfig } from 'next';
import { useSite } from './helpers';
import { loadContent } from '../lib/content';

// Match `source` patterns the way Next does.
const { getPathMatch } = createRequire(import.meta.url)('next/dist/shared/lib/router/utils/path-match') as {
  getPathMatch: (source: string) => (pathname: string) => object | false;
};

let config: NextConfig;
let mod: typeof import('../next.config');
before(async () => {
  useSite();
  (process.env as Record<string, string>).NODE_ENV = 'production';
  mod = await import('../next.config');
  config = mod.default;
});

const headersFor = async (path: string) => {
  const rules = await config.headers!();
  const out: Record<string, string> = {};
  for (const rule of rules) {
    if (getPathMatch(rule.source)(path)) for (const h of rule.headers) out[h.key.toLowerCase()] = h.value;
  }
  return out;
};

test('every page and text response gets the security headers', async () => {
  for (const path of ['/', '/ka', '/projects/menu-cards', '/llms.txt', '/does-not-exist']) {
    const h = await headersFor(path);
    assert.equal(h['x-content-type-options'], 'nosniff', path);
    assert.equal(h['x-frame-options'], 'DENY', path);
    assert.equal(h['referrer-policy'], 'strict-origin-when-cross-origin', path);
    assert.match(h['permissions-policy'], /camera=\(\)/, path);
    assert.match(h['strict-transport-security'], /^max-age=\d{8,}/, path);
    assert.ok(h['content-security-policy'], path);
  }
});

test('hashed assets under /_next/ get nosniff only', async () => {
  assert.deepEqual(await headersFor('/_next/static/chunks/app.js'), { 'x-content-type-options': 'nosniff' });
});

test('the CSP allows nothing from other origins except images, and no eval', async () => {
  const csp = Object.fromEntries((await headersFor('/'))['content-security-policy'].split('; ').map((d) => { const [k, ...v] = d.split(' '); return [k, v.join(' ')]; }));
  assert.equal(csp['default-src'], "'self'");
  assert.equal(csp['script-src'], "'self' 'unsafe-inline'");
  assert.equal(csp['object-src'], "'none'");
  assert.equal(csp['frame-ancestors'], "'none'");
  assert.equal(csp['base-uri'], "'self'");
  assert.equal(csp['form-action'], "'self'");
  assert.equal(csp['font-src'], "'self'");
  assert.doesNotMatch(JSON.stringify(csp), /unsafe-eval/);
});

test('the agent formats and the blog feeds can be fetched from any origin; pages cannot', async () => {
  for (const path of ['/llms.txt', '/llms-full.txt', '/projects.md', '/projects/menu-cards.md', '/ka/projects/menu-cards.md', '/blog/feed.xml', '/ka/blog/feed.xml'])
    assert.equal((await headersFor(path))['access-control-allow-origin'], '*', path);
  assert.equal((await headersFor('/projects/menu-cards'))['access-control-allow-origin'], undefined);
});

const rewriteGroups = async () => {
  const rewrites = await config.rewrites!();
  assert.ok(!Array.isArray(rewrites), 'rewrites come in phases (afterFiles, fallback)');
  const pick = (list: { source: string; destination: string }[] = []) => list.map(({ source, destination }) => ({ source, destination }));
  return { beforeFiles: pick(rewrites.beforeFiles), afterFiles: pick(rewrites.afterFiles), fallback: pick(rewrites.fallback) };
};

test('the .md twins rewrite to the Markdown route', async () => {
  const { beforeFiles, afterFiles } = await rewriteGroups();
  assert.deepEqual(beforeFiles, [], 'with every section on, nothing runs before the pages: a real page always wins');
  assert.deepEqual(afterFiles, [
    { source: '/projects/:slug.md', destination: '/md/en/:slug' },
    { source: '/ka/projects/:slug.md', destination: '/md/ka/:slug' },
  ]);
});

test('unknown Georgian addresses fall back to the prebuilt Georgian 404, and nothing else does', async () => {
  const { fallback } = await rewriteGroups();
  assert.deepEqual(fallback, [{ source: '/ka/:path+', destination: '/ka/404' }]);
  const match = getPathMatch(fallback[0].source);
  for (const path of ['/ka/nope', '/ka/projects/nope', '/ka/blog/nope/deeper', '/ka/nope.md']) assert.ok(match(path), path);
  // /ka itself is a page; addresses of the main language keep the global 404.
  for (const path of ['/ka', '/nope', '/projects/nope', '/kanope']) assert.equal(match(path), false, path);
});

test('sections are switches: only the sections that are on are route extensions', () => {
  assert.deepEqual(mod.pageExtensionsFor(loadContent()), ['tsx', 'ts', 'projects.tsx', 'projects.ts', 'work.tsx', 'work.ts', 'about.tsx', 'about.ts', 'blog.tsx', 'blog.ts']);
  assert.deepEqual(config.pageExtensions, mod.pageExtensionsFor(loadContent()));
  useSite({ shape: 'no-blog' });
  assert.deepEqual(mod.pageExtensionsFor(loadContent()), ['tsx', 'ts', 'projects.tsx', 'projects.ts', 'work.tsx', 'work.ts', 'about.tsx', 'about.ts']);
  // The main language's blog page is a page file, not a route handler: it is rewritten to the 404.
  assert.deepEqual(mod.rewritesFor(loadContent()).beforeFiles, [{ source: '/blog', destination: '/-/section-off/blog' }]);
  const match = getPathMatch('/blog');
  assert.ok(match('/blog') && !match('/blog/feed.xml') && !match('/blogs'), 'only the page itself; its feed and images are not routes at all');
  useSite();
});

test('each layout gets the fonts of its language’s script', () => {
  assert.deepEqual(mod.fontAliases(loadContent()), {
    'site-fonts/primary': './lib/fonts/latin.ts',
    'site-fonts/second': './lib/fonts/georgian.ts',
    'site-fonts/reading-primary': './lib/fonts/reading.ts',
    'site-fonts/reading-second': './lib/fonts/no-reading.ts',
  });
  assert.deepEqual((config.turbopack as { resolveAlias: object }).resolveAlias, mod.fontAliases(loadContent()));
  useSite({ shape: 'en+de' });
  assert.deepEqual(mod.fontAliases(loadContent())['site-fonts/second'], './lib/fonts/latin.ts', 'German is Latin-script');
  assert.deepEqual(mod.fontAliases(loadContent())['site-fonts/reading-second'], './lib/fonts/reading.ts');
  useSite();
});

test('one language: no Georgian rewrites, no second 404; German: the same under /de/', () => {
  useSite({ shape: 'en' });
  assert.deepEqual(mod.rewritesFor(loadContent()), { beforeFiles: [], afterFiles: [{ source: '/projects/:slug.md', destination: '/md/en/:slug' }], fallback: [] });
  useSite({ shape: 'en+de' });
  const de = mod.rewritesFor(loadContent());
  assert.deepEqual(de.fallback, [{ source: '/de/:path+', destination: '/de/404' }]);
  assert.deepEqual(de.afterFiles, [{ source: '/projects/:slug.md', destination: '/md/en/:slug' }], 'the German pages have no projects, so no German twins');
  assert.deepEqual(mod.agentFormats(loadContent()), ['/llms.txt', '/llms-full.txt', '/projects.md', '/projects/:slug.md', '/blog/feed.xml']);
  useSite();
});

test('vercel.json names the framework, so a Vercel project made without one still builds the site as Next.js', async () => {
  const { readFileSync } = await import('node:fs');
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.equal(config.framework, 'nextjs');
  assert.deepEqual(Object.keys(config).sort(), ['$schema', 'framework'], 'headers and rewrites stay in next.config.ts');
});

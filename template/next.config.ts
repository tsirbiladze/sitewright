import type { NextConfig } from 'next';
import { loadContent, scriptOf, SECTIONS, type Content } from './lib/content';

// The site's shape comes from content/site.json, read when Next starts: which sections are routes,
// which fonts each layout loads, and the rewrites for the second language. After changing the
// languages or the sections, restart `next dev`.
const content = loadContent();
const production = process.env.NODE_ENV === 'production';

/**
 * Sections are switches. A section's route handlers are named for it (`route.blog.ts`,
 * `share.png/route.work.tsx`, `app/projects.md/route.projects.ts`), and Next treats them as routes
 * only while the section is on: with a section off its share images, feed and Markdown files do not
 * exist at all. Pages keep the plain `page.tsx`, because Next finds a page's font preloads by its file
 * name less one extension (`page.work.tsx` would lose them): the second language's section pages are
 * built only where generateStaticParams lists them, and the main language's four section index pages
 * are rewritten to the 404 below (rewritesFor) when their section is off.
 */
export function pageExtensionsFor(c: Content): string[] {
  return ['tsx', 'ts', ...SECTIONS.filter((s) => c.sections[s]).flatMap((s) => [`${s}.tsx`, `${s}.ts`])];
}

/**
 * Each root layout loads the fonts of its language's script, so a page preloads only what it draws
 * first (lib/fonts/latin.ts, lib/fonts/georgian.ts): the layouts import 'site-fonts/primary' and
 * 'site-fonts/second', and these aliases point them at the right file. The project pages' reading face
 * is for Latin-script pages only. With no second language, the second layout has no pages; its alias
 * still names a file so the module compiles.
 */
export function fontAliases(c: Content): Record<string, string> {
  const script = (lang: string | undefined) => (lang ? scriptOf(lang) : 'latin');
  return {
    'site-fonts/primary': `./lib/fonts/${script(c.primary)}.ts`,
    'site-fonts/second': `./lib/fonts/${script(c.second)}.ts`,
    'site-fonts/reading-primary': script(c.primary) === 'latin' ? './lib/fonts/reading.ts' : './lib/fonts/no-reading.ts',
    'site-fonts/reading-second': script(c.second) === 'latin' ? './lib/fonts/reading.ts' : './lib/fonts/no-reading.ts',
  };
}

// Next's static pages carry inline scripts (the RSC payload) whose content changes every build, and
// nonces need per-request rendering, so script-src keeps 'unsafe-inline'. The policy still allows no
// script, style, font or connection from another origin, no plugins, no <base> hijack, no form posts
// elsewhere and no framing. Development needs eval for Fast Refresh, so the policy is production-only.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  // A skill's docs may embed images from other sites; the repo's own images are self-hosted at build time.
  "img-src 'self' data: https:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

// Headers that only mean something on a page or a text response. The hashed files under /_next/
// (scripts, CSS, fonts) get nosniff alone: repeating the rest on every asset costs bytes for nothing.
// No Cross-Origin-Opener-Policy: the site opens no windows, and Lighthouse measured it at +60 ms LCP.
const pageHeaders = [
  ...(production ? [{ key: 'Content-Security-Policy', value: csp }] : []),
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000' },
];

/** The address prefix of a language: '' for the main one, '/ka' for the second. */
const prefix = (c: Content, lang: string) => (lang === c.primary ? '' : `/${lang}`);

/**
 * The agent formats and the blog feeds are public text: browser-based agents and feed readers may
 * fetch them from any origin.
 */
export function agentFormats(c: Content): string[] {
  return [
    '/llms.txt',
    '/llms-full.txt',
    ...(c.lang[c.primary].projects ? ['/projects.md'] : []),
    ...c.languages.filter((l) => c.lang[l].projects).map((l) => `${prefix(c, l)}/projects/:slug.md`),
    ...c.languages.filter((l) => c.lang[l].blog).map((l) => `${prefix(c, l)}/blog/feed.xml`),
  ];
}

export function rewritesFor(c: Content) {
  return {
    // A section that is off: its main page answers like any unknown address (the global 404), before
    // the page the build stores for it (a 404 itself) could be sent. Nothing else runs before the pages.
    beforeFiles: SECTIONS.filter((s) => !c.sections[s]).map((s) => ({ source: `/${s}`, destination: `/-/section-off/${s}` })),
    // Markdown twins of the project pages, for agents: /projects/<slug>.md and /<code>/projects/<slug>.md.
    afterFiles: c.languages.filter((l) => c.lang[l].projects).map((l) => ({ source: `${prefix(c, l)}/projects/:slug.md`, destination: `/md/${l}/:slug` })),
    // Anything under /<code>/ that no page, file or dynamic route takes gets the second language's
    // prebuilt 404 (app/(second)/[lang]/404/page.tsx, status 404). Fallback rewrites run last, so real
    // routes always win.
    fallback: c.second ? [{ source: `/${c.second}/:path+`, destination: `/${c.second}/404` }] : [],
  };
}

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  pageExtensions: pageExtensionsFor(content),
  turbopack: { resolveAlias: fontAliases(content) },
  experimental: {
    // One 404 for every address no route takes, in the main language.
    globalNotFound: true,
    // Each root layout declares its own fonts so it preloads only its own (lib/fonts/). The default
    // CSS chunking merges one layout's @font-face rules into the chunk the other layout shares, and
    // a later @font-face with the same family wins, which wastes the preload. A low request cost
    // keeps each layout's fonts in their own chunk (checked by scripts/qa.mjs: one @font-face per face).
    cssChunking: { type: 'graph', requestCost: 5000 },
    // The CSS (≈8 KB gzipped) goes into the HTML: no render-blocking request before the first paint.
    inlineCss: true,
  },
  async headers() {
    return [
      { source: '/:path*', headers: [{ key: 'X-Content-Type-Options', value: 'nosniff' }] },
      { source: '/:path((?!_next/).*)', headers: pageHeaders },
      ...agentFormats(content).map((source) => ({ source, headers: [{ key: 'Access-Control-Allow-Origin', value: '*' }] })),
    ];
  },
  async rewrites() {
    return rewritesFor(content);
  },
};

export default config;

// Site QA against a running server: axe (WCAG 2.2 AA + best practice), horizontal overflow at
// 320–1280 px (element edges, not just scrollWidth), the keyboard path with visible focus, fonts
// (each face declared once, preloads used; the 404s included), one call to action per page, a clean
// console (CSP violations included), the JavaScript each page loads against a budget, the install
// tabs' arrow keys and copy, "Copy as Markdown", "On this page" following the scroll, the 404s'
// "Did you mean", the blog feeds as XML, every site link in the agent formats, and the name's fit
// (scripts/fit.mjs).
// The pages come from the site itself: every address in /sitemap.xml, and a 404 per language. The
// checks that need a feature (install tabs, a phone picture, a feed) run where the site has it.
// usage: node scripts/qa.mjs [base-url] [--strict]   (default http://localhost:4317)
//   --strict: also fail on the known issues that are only reported by default (marked "!").
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { chromium } from 'playwright-core';
import { AxeBuilder } from '@axe-core/playwright';
import { browserPath } from './lib/browser.mjs';

const args = process.argv.slice(2);
const strict = args.includes('--strict');
// The browser first: without one there is nothing to check (one line naming CHROMIUM=).
const executablePath = browserPath();
const base = (args.find((a) => !a.startsWith('--')) ?? 'http://localhost:4317').replace(/\/$/, '');
// The site's address and languages, from the content the server was built from.
const siteFile = JSON.parse(readFileSync(new URL('../content/site.json', import.meta.url), 'utf8'));
const site = `https://${siteFile.domain}`;
const [primary, second] = siteFile.languages;
// A 404 per language: the main language's for any unknown address, the second's under /<code>/.
const notFound = ['/nope', ...(second ? [`/${second}/nope`] : [])];
const sitemap = await (await fetch(`${base}/sitemap.xml`)).text();
const listed = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].slice(site.length) || '/');
if (!listed.length) { console.error(`no pages in ${base}/sitemap.xml`); process.exit(1); }
// JavaScript a page may load, in KiB gzipped (level 6, so the number doesn't depend on the server's
// compression): every script requested by the time the page has been scrolled through and gone
// quiet, link prefetches included, as Lighthouse counts it. Measured in round 3: 145.6 on every
// content page (React and Next's router are 132.7 of it), 135.9 on the 404s, which load no
// component code. Round 2 shipped 148.4.
const jsBudget = (path) => (notFound.includes(path) ? 138 : 148);
const pages = [...listed, ...notFound];
/** Pages whose HTML matches `re`, found by fetching each listed page once. */
const htmlOf = new Map(await Promise.all(listed.map(async (p) => [p, await (await fetch(base + p)).text()])));
const pagesWith = (re) => listed.filter((p) => re.test(htmlOf.get(p)));
const overflowWidths = [320, 360, 390, 414, 600, 768, 1024, 1280];
const axeWidths = [1280, 768, 390];
const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
const problems = [];
const warnings = [];
const fail = (msg) => { problems.push(msg); console.log('  ✗ ' + msg); };
/** A known issue another branch is fixing: reported, and a failure only with --strict. */
const known = (msg) => { if (strict) return fail(msg); warnings.push(msg); console.log('  ! ' + msg); };

async function open(path, width) {
  const mobile = width < 600;
  const ctx = await browser.newContext({ viewport: { width, height: mobile ? 844 : 900 }, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  await page.goto(base + path, { waitUntil: 'networkidle' });
  return { ctx, page };
}

for (const path of pages) {
  console.log(path);

  // 1. axe
  for (const w of axeWidths) {
    const { ctx, page } = await open(path, w);
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
    for (const v of r.violations) fail(`axe @${w} ${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')})`);
    await ctx.close();
  }

  // 2. overflow: any element whose box leaves the viewport, unless an ancestor clips or scrolls it
  for (const w of overflowWidths) {
    const { ctx, page } = await open(path, w);
    const off = await page.evaluate((w) => {
      const out = [];
      const clipped = (el) => {
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
          const ox = getComputedStyle(p).overflowX;
          if (ox !== 'visible') return true;
        }
        return false;
      };
      if (document.documentElement.scrollWidth > w) out.push(`scrollWidth ${document.documentElement.scrollWidth}`);
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect();
        if (!r.width || getComputedStyle(el).position === 'fixed') continue;
        if ((r.right > w + 0.5 || r.left < -0.5) && !clipped(el) && !el.closest('.sr-only, .skip'))
          out.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')} ${Math.round(r.left)}..${Math.round(r.right)}`);
      }
      return out.slice(0, 5);
    }, w);
    for (const o of off) fail(`overflow @${w}: ${o}`);
    // 2b. overlap: a link or a placeholder too long for its column runs into its neighbour without
    // leaving the viewport, which the check above cannot see. No two of them may cover each other.
    const over = await page.evaluate(() => {
      const boxes = [...document.querySelectorAll('main a, main .ph, footer a, footer .ph')]
        .filter((el) => !el.closest('.sr-only, .skip'))
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 0 && r.height > 0);
      const out = [];
      for (let i = 0; i < boxes.length; i++)
        for (let j = i + 1; j < boxes.length; j++) {
          const [a, b] = [boxes[i], boxes[j]];
          if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
          const x = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
          const y = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
          if (x > 2 && y > 2) out.push(`"${a.el.textContent.trim().slice(0, 30)}" and "${b.el.textContent.trim().slice(0, 30)}" (${Math.round(x)} × ${Math.round(y)} px)`);
        }
      return out.slice(0, 5);
    });
    for (const o of over) fail(`overlap @${w}: ${o}`);
    await ctx.close();
  }

  // 3. keyboard path: every Tab stop shows a visible focus indicator; all links and buttons are reachable
  {
    const { ctx, page } = await open(path, 1280);
    const seen = new Set();
    for (let i = 0; i < 80; i++) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        const cs = getComputedStyle(el);
        const visible = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2) || cs.boxShadow !== 'none';
        if (!el.dataset.qa) el.dataset.qa = String(document.querySelectorAll('[data-qa]').length + 1);
        const id = el.dataset.qa + ' ' + el.tagName.toLowerCase() + ':' + (el.getAttribute('href') ?? el.textContent.trim().slice(0, 30));
        return { id, visible };
      });
      if (!info) break;
      if (seen.has(info.id)) break;
      seen.add(info.id);
      if (!info.visible) fail(`focus not visible on ${info.id}`);
    }
    const expected = await page.evaluate(() =>
      [...document.querySelectorAll('a[href], button, [tabindex="0"]')]
        .filter((el) => el.getClientRects().length && !el.closest('[hidden]') && el.getAttribute('tabindex') !== '-1')
        .length);
    if (seen.size < expected) fail(`keyboard reached ${seen.size} of ${expected} focusable elements`);
    else console.log(`  ✓ keyboard: ${seen.size} stops, all with visible focus`);
    await ctx.close();
  }

  // 4. fonts: every face is declared once (with two @font-face rules for the same face the later one
  // wins, and a preloaded file goes unused), and every preloaded font is one the page's CSS uses.
  // The 404s too (their HTML comes with status 404); there the duplicates are a known issue for now
  // (app/global-not-found.tsx declares its fonts again next to the English layout's).
  const fontIssue = notFound.includes(path) ? known : fail;
  const res = await fetch(base + path);
  const html = await res.text();
  {
    let css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
    for (const [, href] of html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)) css += await (await fetch(new URL(href, base))).text();
    const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1]);
    const keys = faces.map((f) => ['font-family', 'font-style', 'font-weight', 'unicode-range'].map((d) => f.match(new RegExp(`${d}:\\s*([^;]+)`))?.[1].trim()).join(' | '));
    const twice = [...new Set(keys.filter((k, i) => keys.indexOf(k) !== i))];
    const preloads = [...html.matchAll(/<link rel="preload" href="([^"]+)" as="font"/g)].map((m) => m[1].split('/').pop());
    const unused = preloads.filter((file) => !css.includes(file));
    if (twice.length) fontIssue(`${path}: ${twice.length} font face(s) declared twice, e.g. ${twice[0].slice(0, 70)}`);
    for (const file of unused) fail(`preloaded font not in the page's CSS: ${file}`);
    // Every page of a language preloads what its home preloads (the fonts its layout draws first).
    if (!notFound.includes(path)) {
      const home = second && (path === `/${second}` || path.startsWith(`/${second}/`)) ? `/${second}` : '/';
      const want = [...(htmlOf.get(home) ?? '').matchAll(/<link rel="preload" href="([^"]+)" as="font"/g)].map((m) => m[1].split('/').pop()).sort().join(' ');
      if (!want) fail(`${home} preloads no font`);
      else if (preloads.slice().sort().join(' ') !== want) fail(`${path} preloads ${preloads.join(' ') || 'no font'}, its home ${want}`);
    }
    if (!twice.length && !unused.length) console.log(`  ✓ fonts: ${faces.length} faces, each once; ${preloads.length} preloaded`);
  }

  // 4b. a 404 answers 404, in the language of its address: anything under /<code>/ gets the second language's.
  if (notFound.includes(path)) {
    const lang = html.match(/<html[^>]*\slang="([^"]+)"/)?.[1];
    const want = second && path.startsWith(`/${second}/`) ? second : primary;
    if (res.status !== 404) fail(`${path} answered ${res.status}, not 404`);
    else if (lang !== want) fail(`404 at ${path} has lang="${lang}", want "${want}"`);
    else console.log(`  ✓ 404: status 404, in its address's language (lang="${lang}")`);
  }

  // 4c. one call to action per page
  {
    const { ctx, page } = await open(path, 1280);
    const ctas = await page.evaluate(() => [...document.querySelectorAll('.cta')].map((el) => el.textContent.trim().slice(0, 40)));
    if (ctas.length !== 1) fail(`${ctas.length} calls to action (.cta), want 1: ${ctas.join(' | ')}`);
    else console.log(`  ✓ one call to action: "${ctas[0]}"`);
    await ctx.close();
  }

  // 5. console: no errors, no uncaught exceptions, no CSP violations (a 404's own status excepted)
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    const errors = [];
    const fonts = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));
    const scripts = [];
    page.on('response', (r) => {
      const type = r.request().resourceType();
      if (type === 'font') fonts.push(r.body().then((b) => [r.url().split('/').pop(), createHash('sha1').update(b).digest('hex')], () => null));
      if (type === 'script') scripts.push(r.body().then((b) => gzipSync(b, { level: 6 }).length, () => 0));
    });
    await page.goto(base + path, { waitUntil: 'networkidle' });
    await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 30)); } });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500); // link prefetches start when the browser is idle
    const real = errors.filter((e) => !(notFound.includes(path) && /status of 404/.test(e)));
    for (const e of real) fail(`console: ${e.slice(0, 160)}`);
    if (!real.length) console.log('  ✓ console: no errors');
    // the same font file under two URLs (e.g. a preloaded and a plain copy of one face) is downloaded twice
    const byHash = new Map();
    for (const [file, hash] of (await Promise.all(fonts)).filter(Boolean)) byHash.set(hash, [...(byHash.get(hash) ?? []), file]);
    const twice = [...byHash.values()].filter((files) => files.length > 1);
    for (const files of twice) fontIssue(`${path}: one font downloaded ${files.length}×: ${files.join(', ')}`);
    if (!twice.length) console.log(`  ✓ font downloads: ${fonts.length}, none twice`);
    const sizes = await Promise.all(scripts);
    const kib = sizes.reduce((a, b) => a + b, 0) / 1024;
    if (kib > jsBudget(path)) fail(`${path}: ${kib.toFixed(1)} KiB of JavaScript (gzipped, ${sizes.length} files), over the ${jsBudget(path)} KiB budget`);
    else console.log(`  ✓ JavaScript: ${kib.toFixed(1)} KiB gzipped in ${sizes.length} files (budget ${jsBudget(path)})`);
    await ctx.close();
  }
}

// 6. install tabs: arrow keys move selection and focus, Home/End work, copy shows its "copied" label
// and puts the command on the clipboard. On the first page with install tabs, in each language.
for (const path of [primary, second].filter(Boolean).map((lang) => pagesWith(/role="tablist"/).find((p) => (lang === primary ? !second || !p.startsWith(`/${second}/`) : p.startsWith(`/${lang}/`)))).filter(Boolean)) {
  const { ctx, page } = await open(path, 1280);
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
  const names = await page.$$eval('[role="tab"]', (tabs) => tabs.map((t) => t.textContent));
  await page.focus('[role="tab"][aria-selected="true"]');
  const sel = () => page.evaluate(() => document.querySelector('[role="tab"][aria-selected="true"]').textContent + '|' + document.activeElement.textContent);
  const both = (name) => `${name}|${name}`;
  await page.keyboard.press('ArrowRight');
  const a = await sel();
  await page.keyboard.press('End');
  const b = await sel();
  await page.keyboard.press('ArrowRight');
  const c = await sel();
  if (names.length < 2) fail(`${path}: ${names.length} install tab(s); the keys need two`);
  else if (a !== both(names[1]) || b !== both(names.at(-1)) || c !== both(names[0])) fail(`${path}: tabs keys: ${a} / ${b} / ${c}`);
  else console.log(`✓ ${path}: tabs: arrow keys, End and wrap-around`);
  const button = '[role="tabpanel"]:not([hidden]) .copy';
  if (await page.$(button)) {
    const idle = (await page.textContent(button)).trim();
    const command = await page.textContent('[role="tabpanel"]:not([hidden]) pre code');
    await page.click(button);
    await page.waitForFunction(([sel, before]) => document.querySelector(sel).textContent.trim() !== before, [button, idle], { timeout: 2000 }).catch(() => {});
    const label = (await page.textContent(button)).trim();
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    if (label === idle || clip !== command) fail(`${path}: copy: "${label}" / "${clip}"`);
    else console.log(`✓ ${path}: copy: clipboard and "${label}"`);
  }
  await ctx.close();
}

// 7. "Copy as Markdown" puts the page's own Markdown twin on the clipboard, on every project page
const projectPages = pagesWith(/<a href="[^"]+" type="text\/markdown"/);
for (const path of projectPages) {
  const { ctx, page } = await open(path, 1280);
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
  const href = await page.getAttribute('a[type="text/markdown"]', 'href');
  const button = page.locator('.install__links button.link-btn');
  if (!href || (await button.count()) !== 1) { fail(`${path}: no "View as Markdown" link or no single "Copy as Markdown" button`); await ctx.close(); continue; }
  const twin = await (await fetch(new URL(href, base + path))).text();
  await page.evaluate(() => navigator.clipboard.writeText(''));
  await button.click();
  await page.waitForFunction(async () => (await navigator.clipboard.readText()).length > 0, null, { timeout: 5000 }).catch(() => {});
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  if (clip !== twin) fail(`${path}: "Copy as Markdown" put ${clip.length} characters on the clipboard, the twin ${href} has ${twin.length}`);
  else console.log(`✓ ${path}: "Copy as Markdown" copies ${href} (${twin.length} characters)`);
  await ctx.close();
}

// 8. "On this page": after scrolling to a section, each list marks exactly that section as current
// (wide: the sticky list; phone: the list and the bar, which also names the section). On every page
// with three sections or more.
for (const path of pagesWith(/class="toc"/).filter((p) => (htmlOf.get(p).match(/<li><a href="#/g) ?? []).length >= 3)) {
  for (const width of [1280, 390]) {
    const { page, ctx } = await open(path, width);
    // The longest section that is neither the first (on a phone the list is still in view there) nor
    // the last, its heading scrolled to 100 px from the top.
    const target = await page.evaluate(() => {
      const ids = [...document.querySelectorAll('.toc > ol a')].map((a) => decodeURIComponent(a.hash.slice(1)));
      const tops = ids.map((id) => document.getElementById(id).getBoundingClientRect().top + scrollY);
      let best = Math.min(1, ids.length - 1);
      for (let i = best + 1; i < ids.length - 1; i++) if (tops[i + 1] - tops[i] > tops[best + 1] - tops[best]) best = i;
      scrollTo({ top: tops[best] - 100, behavior: 'instant' }); // not the page's smooth scrolling
      return { id: ids[best], text: document.querySelector(`.toc > ol a[href="#${CSS.escape(ids[best])}"]`).textContent };
    });
    await page.waitForTimeout(400);
    const state = await page.evaluate(() => ({
      lists: [...document.querySelectorAll('.toc ol')].filter((ol) => !ol.closest('[hidden]'))
        .map((ol) => [...ol.querySelectorAll('a[aria-current]')].map((a) => decodeURIComponent(a.hash.slice(1)))),
      bar: document.querySelector('.toc-bar:not([hidden]) .toc-bar__now')?.textContent ?? null,
      // The bar steps aside once the call to action is in view (components/Toc.tsx); on a short page
      // that can already be so at the section scrolled to.
      ctaInView: (document.querySelector('.article-layout .cta-block')?.getBoundingClientRect().top ?? Infinity) < innerHeight,
    }));
    const wrong = state.lists.filter((marked) => marked.length !== 1 || marked[0] !== target.id);
    const barWrong = width < 1080 && (state.ctaInView ? state.bar !== null : state.bar !== target.text);
    if (!state.lists.length || wrong.length || barWrong)
      fail(`${path} @${width}: scrolled to "${target.text}", marked ${JSON.stringify(state.lists)}${width < 1080 ? `, bar says ${JSON.stringify(state.bar)}` : ''}`);
    else console.log(`✓ ${path} @${width}: "On this page" marks "${target.text}" only${width < 1080 ? (state.ctaInView ? ', and the bar has stepped aside for the call to action' : ', and the bar names it') : ''}`);
    await ctx.close();
  }
}

// 9. A page that shows no project picture must not download one (prefetching Work used to pull in
// the picture on About); and a phone gets a picture's phone version, never the wide one.
const pictureOf = (html) => [...html.matchAll(/<picture class="specimen">([\s\S]*?)<\/picture>/g)].map((m) => ({
  phone: m[1].match(/<source media="\(max-width: 699px\)" srcSet="([^"]+)"/)?.[1],
  wide: m[1].match(/<img [^>]*src="([^"]+)"/)?.[1],
}));
const pictures = new Set(listed.flatMap((p) => pictureOf(htmlOf.get(p)).flatMap((x) => [x.phone, x.wide])).filter(Boolean));
for (const path of listed.filter((p) => !pictureOf(htmlOf.get(p)).length && /\/about$/.test(p))) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const hits = [];
  page.on('request', (r) => { const p = new URL(r.url()).pathname; if (pictures.has(p)) hits.push(p); });
  await page.goto(base + path, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000); // link prefetches run when the browser is idle
  await page.mouse.wheel(0, 2000);
  await page.waitForTimeout(1000);
  if (hits.length) fail(`${path} requested project pictures it doesn't show: ${[...new Set(hits)].join(', ')}`);
  else console.log(`✓ ${path}: no project picture requested`);
  await ctx.close();
}
for (const path of listed.filter((p) => pictureOf(htmlOf.get(p)).some((x) => x.phone)).slice(0, 4)) {
  const shown = pictureOf(htmlOf.get(path)).filter((x) => x.phone);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const imgs = [];
  page.on('request', (r) => { const p = new URL(r.url()).pathname; if (pictures.has(p)) imgs.push(p); });
  await page.goto(base + path, { waitUntil: 'networkidle' });
  await page.mouse.wheel(0, 3000);
  await page.waitForTimeout(800);
  const wide = shown.map((x) => x.wide).filter((w) => imgs.includes(w));
  if (wide.length) fail(`${path} @390: downloaded the wide picture (${wide.join(', ')})`);
  else if (!shown.some((x) => imgs.includes(x.phone))) known(`${path} @390: no phone picture requested (${imgs.join(', ') || 'none'})`);
  else console.log(`✓ ${path} @390: phone picture only`);
  await ctx.close();
}

// 9b. the 404s' "Did you mean": a mistyped address gets a link to the nearest real one, in the
// 404's language (lib/suggest.ts, sent to the browser as an inline script).
// Cases from the site's own pages: two letters swapped in a page's last part, in each language, and
// a project's slug alone (the route with the same last part wins).
const swap = (path) => path.replace(/([a-z])([a-z])(?=[a-z]*$)/, '$2$1');
const guessCases = [
  ...[primary, second].filter(Boolean).map((lang) => listed.find((p) => (lang === primary ? !second || !p.startsWith(`/${second}`) : p.startsWith(`/${lang}/`)) && /\/[a-z]{4,}$/.test(p))).filter(Boolean).map((p) => [swap(p), p]),
  ...listed.filter((p) => /^\/projects\/[^/]+$/.test(p)).slice(0, 1).map((p) => [`/${p.split('/').pop()}`, p]),
].filter(([typo, want]) => typo !== want);
for (const [path, want] of guessCases) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(base + path, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300); // the Georgian 404 is drawn twice; the line is filled again
  const guess = await page.evaluate(() => {
    const el = document.getElementById('nf-guess');
    return el && !el.hidden ? { href: el.querySelector('a')?.getAttribute('href'), text: el.textContent.trim() } : null;
  });
  if (guess?.href !== want) fail(`${path}: the 404 suggests ${JSON.stringify(guess)}, want a link to ${want}`);
  else console.log(`✓ ${path}: the 404 says "${guess.text}"`);
  await ctx.close();
}

// 9c. each blog feed: RSS 2.0 that parses as XML (with or without posts), linked from its blog, every
// post with an absolute link, a guid and a date
for (const blogPath of listed.filter((p) => /^(\/[a-z]{2,3})?\/blog$/.test(p))) {
  const feedPath = `${blogPath}/feed.xml`;
  const r = await fetch(base + feedPath);
  const type = r.headers.get('content-type') ?? '';
  const xml = await r.text();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(base + blogPath, { waitUntil: 'domcontentloaded' });
  const linked = await page.evaluate((feed) => [...document.querySelectorAll('link[rel="alternate"][type="application/rss+xml"]')].some((l) => new URL(l.href).pathname === feed), feedPath);
  const feed = await page.evaluate((text) => {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    const err = doc.querySelector('parsererror');
    if (err) return { error: err.textContent.trim().slice(0, 160) };
    const rss = doc.documentElement;
    const channel = rss.querySelector(':scope > channel');
    const kid = (el, name) => el?.getElementsByTagName(name)[0]?.textContent?.trim() ?? '';
    const items = [...(channel?.getElementsByTagName('item') ?? [])].map((it) => ({ title: kid(it, 'title'), link: kid(it, 'link'), guid: kid(it, 'guid'), date: kid(it, 'pubDate') }));
    return {
      root: `${rss.nodeName} ${rss.getAttribute('version')}`,
      channel: channel ? ['title', 'link', 'description'].every((n) => kid(channel, n)) : false,
      self: channel?.getElementsByTagNameNS('http://www.w3.org/2005/Atom', 'link')[0]?.getAttribute('href') ?? '',
      bad: items.filter((i) => !i.title || !/^https:\/\//.test(i.link) || i.guid !== i.link || Number.isNaN(Date.parse(i.date))).map((i) => i.link || i.title),
      items: items.length,
    };
  }, xml);
  await ctx.close();
  const problemsBefore = problems.length;
  if (r.status !== 200 || !type.startsWith('application/rss+xml')) fail(`${feedPath} answered ${r.status} ${type}`);
  else if (feed.error) fail(`${feedPath} is not well-formed XML: ${feed.error}`);
  else {
    if (feed.root !== 'rss 2.0') fail(`${feedPath}: root is ${feed.root}, want rss 2.0`);
    if (!feed.channel) fail(`${feedPath}: the channel needs a title, a link and a description`);
    if (!feed.self.endsWith(feedPath)) fail(`${feedPath}: atom:link rel="self" is "${feed.self}"`);
    for (const b of feed.bad) fail(`${feedPath}: item without a title, an absolute link, a matching guid or a date: ${b}`);
  }
  if (!linked) fail(`${blogPath} has no <link rel="alternate" type="application/rss+xml"> to ${feedPath}`);
  if (problems.length === problemsBefore) console.log(`✓ ${feedPath}: RSS 2.0, well-formed, ${feed.items} post(s), linked from ${blogPath}`);
}

// 10. agent formats: every site link in /llms.txt, /llms-full.txt and /projects.md (when the projects
// section is on) answers 200, and the .md twins answer as Markdown
{
  const links = new Set();
  const sitePattern = new RegExp(`${site.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\\s)>\\]"'\`]*`, 'g');
  const files = ['/llms.txt', '/llms-full.txt', ...(siteFile.sections.projects ? ['/projects.md'] : [])];
  for (const file of files) {
    const r = await fetch(base + file);
    if (r.status !== 200) { fail(`${file} answered ${r.status}`); continue; }
    for (const [url] of (await r.text()).matchAll(sitePattern)) links.add(url.replace(/[.,;:]+$/, ''));
  }
  const broken = [];
  for (const url of links) {
    const r = await fetch(base + (url.slice(site.length) || '/'), { redirect: 'manual' });
    if (r.status !== 200) broken.push(`${url} → ${r.status}`);
    else if (url.endsWith('.md') && !r.headers.get('content-type')?.startsWith('text/markdown')) broken.push(`${url} → ${r.headers.get('content-type')}`);
  }
  for (const b of broken) fail(`agent formats link: ${b}`);
  if (!broken.length) console.log(`✓ agent formats: ${links.size} site links, all 200`);
}

// 11. the name's fit: every large name and the amount from margin to margin at every width, for the
// site's own and for a set of fictional names and prices (scripts/fit.mjs, also `pnpm fit`)
{
  const fit = spawnSync(process.execPath, ['--import', fileURLToPath(new URL('../tests/register.mjs', import.meta.url)), fileURLToPath(new URL('./fit.mjs', import.meta.url)), base], { encoding: 'utf8', env: { ...process.env, CHROMIUM: executablePath } });
  process.stdout.write(fit.stdout);
  if (fit.status !== 0) fail(`the name's fit (pnpm fit): ${(fit.stderr || fit.stdout).trim().split('\n').pop()}`);
}

await browser.close();
if (warnings.length) console.log(`\n${warnings.length} known issue(s) reported, not failed (--strict fails on them):\n${warnings.map((w) => '  ! ' + w).join('\n')}`);
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nAll checks passed');
process.exit(problems.length ? 1 : 0);

// The name's fit, proved in a real browser against a running server: every large name (the home and
// About, in each language) and the Work page's amount are drawn at 320–1280 px and measured against
// their column. The site's own name and amount first, as built; then a set of fictional names and
// prices put into the same pages with the values lib/fit.ts computes for them (all a build would
// change), so one build proves any name.
//
// For a name: every line starts at or after the column's left edge and ends at or before its right
// edge (half a pixel of rounding), its widest line is no more than 1.5% short of the column, and it
// takes the lines lib/fit.ts says. For the amount, below 1000 px the same; from 1000 px it ends on the
// right margin and takes at most 60% of the column.
//
// usage: node --import ./tests/register.mjs scripts/fit.mjs [base-url]   (pnpm fit; default http://localhost:4317)
// `pnpm qa` runs it too.
import { chromium } from 'playwright-core';
import { browserPath } from './lib/browser.mjs';
import { NAME_CHARS, charCount, fitAmount, masthead, nameFitOf, nameLines } from '../lib/fit.ts';
import { fill, loadContent } from '../lib/content.ts';
import { NAMES, PRICES, WIDTHS } from '../tests/fit-cases.mjs';

const SHORT = 0.015;

const executablePath = browserPath();
const base = (process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'http://localhost:4317').replace(/\/$/, '');
const c = loadContent();
const prefix = (lang) => (lang === c.primary ? '' : `/${lang}`);
const nb = (s) => s.replace(/ /g, ' ');
let failures = 0;
let checked = 0;
let worst = { short: 0, where: '' };
/** The furthest any line reached past its right margin, in px (negative: never reached it). */
let over = -Infinity;
const fail = (line) => { failures++; console.log(`  ✗ ${line}`); };

const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

/** Puts `text` and its custom properties into the page's element `selector`, and waits for its fonts. */
async function put(selector, holder, text, vars, dip) {
  await page.evaluate(async ({ selector, holder, text, vars, dip }) => {
    const el = document.querySelector(selector);
    const box = el.closest(holder);
    for (const [k, v] of Object.entries(vars)) box.style.setProperty(k, v);
    // As components/Text.tsx draws it: ₾ in the face that has it (components/Lari.tsx).
    el.textContent = '';
    text.split('₾').forEach((part, i) => {
      if (i) { const lari = document.createElement('span'); lari.className = 'lari'; lari.textContent = '₾'; el.append(lari); }
      el.append(part);
    });
    if (dip !== null) el.classList.toggle('name--dip', dip);
    document.querySelectorAll('.fit-after').forEach((after) => dip !== null && after.classList.toggle('fit-after--dip', dip));
    void el.offsetWidth;
    await document.fonts.ready;
  }, { selector, holder, text, vars, dip });
}

/** The drawn lines of an element's text and its column (the container's content box). */
const measure = (selector) => page.evaluate((selector) => {
  const el = document.querySelector(selector);
  const wrap = el.closest('.wrap');
  const r = wrap.getBoundingClientRect();
  const cs = getComputedStyle(wrap);
  const left = r.left + parseFloat(cs.paddingLeft), right = r.right - parseFloat(cs.paddingRight);
  const range = document.createRange();
  range.selectNodeContents(el);
  // One rect per line: rects whose middles are less than 0.4 em apart (a face with other metrics, the
  // ₾ in its own span) are on the same line; lines are at least 0.86 em apart.
  const size = parseFloat(getComputedStyle(el).fontSize);
  const lines = [];
  for (const rect of range.getClientRects()) {
    if (rect.width < 1) continue;
    const mid = (rect.top + rect.bottom) / 2;
    const line = lines.find((l) => Math.abs(l.mid - mid) < 0.4 * size);
    if (line) { line.left = Math.min(line.left, rect.left); line.right = Math.max(line.right, rect.right); }
    else lines.push({ mid, left: rect.left, right: rect.right });
  }
  return { left, right, lines, size };
}, selector);

/** Checks a name drawn in the page against its column at the current width. */
async function checkName(where, name, script, width) {
  const m = await measure('h1.name');
  const col = m.right - m.left;
  const widest = Math.max(...m.lines.map((l) => l.right - l.left));
  const short = 1 - widest / col;
  const want = nameLines(nameFitOf(name, script), col);
  checked++;
  if (short > worst.short) worst = { short, where: `${where} "${name}" @${width}` };
  const problems = [];
  for (const l of m.lines) {
    over = Math.max(over, l.right - m.right);
    if (l.left < m.left - 0.5) problems.push(`starts ${(m.left - l.left).toFixed(1)} px left of the margin`);
    if (l.right > m.right + 0.5) problems.push(`runs ${(l.right - m.right).toFixed(1)} px past the margin`);
  }
  if (short > SHORT) problems.push(`stops ${(short * 100).toFixed(1)}% short of the margin`);
  if (m.lines.length !== want) problems.push(`takes ${m.lines.length} lines, lib/fit.ts says ${want}`);
  if (problems.length) fail(`${where} @${width}: "${name}" (${m.size.toFixed(0)} px, ${m.lines.length} lines): ${problems.join('; ')}`);
}

async function checkAmount(where, amount, width) {
  const m = await measure('.price__amount');
  const col = m.right - m.left;
  const [line] = m.lines;
  const wide = line.right - line.left;
  checked++;
  const problems = [];
  if (m.lines.length !== 1) problems.push(`takes ${m.lines.length} lines`);
  over = Math.max(over, line.right - m.right);
  if (line.left < m.left - 0.5) problems.push(`starts ${(m.left - line.left).toFixed(1)} px left of the margin`);
  if (line.right > m.right + 0.5) problems.push(`runs ${(line.right - m.right).toFixed(1)} px past the margin`);
  if (width < 1000) {
    // An amount of fewer characters than a name's minimum ("90 €") is drawn as large as one of that
    // many and no larger (lib/fit.ts fitAmount), so it stops short by that share, by design.
    const byDesign = Math.max(0, 1 - charCount(amount) / NAME_CHARS.min);
    const short = 1 - wide / col - byDesign;
    if (short > worst.short) worst = { short, where: `${where} "${amount}" @${width}` };
    if (short > SHORT) problems.push(`stops ${(short * 100).toFixed(1)}% short of the margin`);
  } else {
    if (m.right - line.right > 1) problems.push(`ends ${(m.right - line.right).toFixed(1)} px before the right margin`);
    if (wide > col * 0.6 + 1) problems.push(`takes ${((wide / col) * 100).toFixed(0)}% of the column (at most 60%)`);
  }
  if (problems.length) fail(`${where} @${width}: "${amount}" (${m.size.toFixed(0)} px): ${problems.join('; ')}`);
}

for (const lang of c.languages) {
  const script = c.lang[lang].script;
  const own = c.lang[lang].site.name;
  const names = [own, ...NAMES[script].filter((n) => n !== own)];
  const pages = [`${prefix(lang)}/`, ...(c.lang[lang].about ? [`${prefix(lang)}/about`] : [])].map((p) => p.replace(/(.)\/$/, '$1'));
  for (const path of pages) {
    const before = failures;
    await page.goto(base + path, { waitUntil: 'networkidle' });
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      for (const [i, name] of names.entries()) {
        // The site's own name is checked as built; the others are put in with what a build would write.
        if (i > 0) {
          const fit = masthead(name, script);
          await put('h1.name', '[style*="--fit-1"]', name, fit.style, fit.dip);
        } else await put('h1.name', '[style*="--fit-1"]', own, {}, null);
        await checkName(path, name, script, width);
      }
      // back to the page as built
      const fit = masthead(own, script);
      await put('h1.name', '[style*="--fit-1"]', own, fit.style, fit.dip);
    }
    if (failures === before) console.log(`✓ ${path}: ${names.length} names at ${WIDTHS.length} widths run from margin to margin`);
  }
  const work = c.lang[lang].work;
  if (work) {
    const path = `${prefix(lang)}/work`;
    const before = failures;
    await page.goto(base + path, { waitUntil: 'networkidle' });
    const amounts = [fill(work.amount, { price: nb(work.price) }), ...PRICES.map((p) => fill(work.amount, { price: nb(p) }))];
    // The page's own amount is measured with the value its build wrote.
    const built = await page.evaluate(() => getComputedStyle(document.querySelector('main')).getPropertyValue('--amount-fit').trim());
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      for (const [i, amount] of amounts.entries()) {
        await put('.price__amount', '[style*="--amount-fit"]', amount, { '--amount-fit': i ? String(fitAmount(amount, script).em) : built }, null);
        await checkAmount(path, amount, width);
      }
    }
    if (failures === before) console.log(`✓ ${path}: ${amounts.length} amounts at ${WIDTHS.length} widths fit their column`);
  }
}

await browser.close();
console.log(`${checked} drawings measured; the widest line is at most ${(worst.short * 100).toFixed(2)}% short of the margin (${worst.where}), and ${over > 0 ? `runs at most ${over.toFixed(2)} px past it` : `never reaches past it (${(-over).toFixed(2)} px inside at the closest)`}`);
if (failures) {
  console.log(`✗ ${failures} problem(s) with the name's fit`);
  process.exit(1);
}

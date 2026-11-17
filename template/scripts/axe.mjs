// Run axe-core (WCAG 2.2 AA tags) on pages at several widths.
// usage: node scripts/axe.mjs <url-or-file> [...] [--widths=1280,390]
import { chromium } from 'playwright-core';
import { AxeBuilder } from '@axe-core/playwright';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { browserPath } from './lib/browser.mjs';

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
const targets = args.filter(a => !a.startsWith('--'));
const widths = String(flags.widths ?? '1280,390').split(',').map(Number);
const browser = await chromium.launch({ executablePath: browserPath(), args: ['--no-sandbox'] });
let total = 0;
for (const t of targets) {
  const url = /^https?:|^file:/.test(t) ? t : pathToFileURL(resolve(t)).href;
  for (const w of widths) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, isMobile: w < 600, hasTouch: w < 600 });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
    total += r.violations.length;
    console.log(`${t} @${w}: ${r.violations.length} violations`);
    for (const v of r.violations) console.log(`  - ${v.id} (${v.impact}): ${v.help} — ${v.nodes.slice(0, 3).map(n => n.target.join(' ')).join(' | ')}`);
    await ctx.close();
  }
}
await browser.close();
process.exit(total ? 1 : 0);

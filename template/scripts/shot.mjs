// Screenshot pages at several widths with device emulation.
// usage: node scripts/shot.mjs <out-dir> <name=url-or-file> [...] [--widths=1280,768,390] [--full] [--fold] [--css=trial.css]
// --css adds a stylesheet to the loaded page before the capture, to try a change without editing the site.
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { browserPath } from './lib/browser.mjs';

const args = process.argv.slice(2);
const out = args.shift();
const flags = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
const targets = args.filter(a => !a.startsWith('--')).map(a => { const i = a.indexOf('='); return [a.slice(0, i), a.slice(i + 1)]; });
const widths = String(flags.widths ?? '1280,768,390').split(',').map(Number);
const full = flags.full !== undefined || flags.fold === undefined;
const fold = flags.fold !== undefined;
const trialCss = typeof flags.css === 'string' ? readFileSync(flags.css, 'utf8') : null;
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ executablePath: browserPath(), args: ['--no-sandbox'] });
for (const [name, target] of targets) {
  const url = /^https?:|^file:/.test(target) ? target : pathToFileURL(resolve(target)).href;
  for (const w of widths) {
    const mobile = w < 600;
    const ctx = await browser.newContext({ viewport: { width: w, height: mobile ? 844 : 800 }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(e => console.error('goto', name, w, e.message));
    // The site's CSP allows inline styles, so a <style> element works on built pages too.
    if (trialCss) await page.addStyleTag({ content: trialCss });
    // Scroll through the page so lazy images load before a full-page capture.
    await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 40)); } window.scrollTo(0, 0); });
    await page.waitForTimeout(400);
    // Mobile emulation can widen the layout viewport to fit overflowing content, so compare with the requested width.
    const overflow = await page.evaluate((w) => Math.max(document.documentElement.scrollWidth, window.innerWidth) - w, w);
    if (fold) await page.screenshot({ path: `${out}/${name}-${w}-fold.png` });
    if (full) await page.screenshot({ path: `${out}/${name}-${w}.png`, fullPage: true });
    console.log(`${name} @${w}: ${overflow > 0 ? 'OVERFLOW ' + overflow + 'px' : 'no overflow'}`);
    await ctx.close();
  }
}
await browser.close();

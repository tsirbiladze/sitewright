// Lighthouse against a running server, phone emulation (Lighthouse's default: Moto G Power, slow 4G,
// 4× CPU slowdown, simulated). Prints the four category scores and LCP / CLS / TBT per page; each
// page runs --runs times and the run with the median performance score is reported.
// usage: node scripts/lighthouse.mjs [base-url] [--runs=3] [--paths=/,/ka] [--details] [--json=out.json]
//   default base-url http://localhost:4317; default paths: the main home, /work and /about (add a project page with --paths).
//   --details lists the audits that lost points on the reported run.
// Uses the Chrome, Chromium, Edge or Brave it finds (scripts/lib/browser.mjs; CHROMIUM= overrides).
import lighthouse from 'lighthouse';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { browserPath } from './lib/browser.mjs';

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
const base = (args.find((a) => !a.startsWith('--')) ?? 'http://localhost:4317').replace(/\/$/, '');
const runs = Number(flags.runs ?? 3);
const paths = String(flags.paths ?? '/,/work,/about').split(',');
const categories = ['performance', 'accessibility', 'best-practices', 'seo'];

const freePort = () => new Promise((resolve) => {
  const srv = createServer().listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
});

async function launchChromium() {
  const port = await freePort();
  const profile = mkdtempSync(join(tmpdir(), 'lh-chromium-'));
  const proc = spawn(browserPath(), [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--no-sandbox', '--no-first-run', '--no-default-browser-check', '--disable-extensions', 'about:blank',
  ], { stdio: 'ignore' });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) break; } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  const exited = new Promise((r) => proc.once('exit', r));
  return { port, close: async () => { proc.kill(); await exited; rmSync(profile, { recursive: true, force: true, maxRetries: 5 }); } };
}

const chromium = await launchChromium();
const rows = [];
try {
  for (const path of paths) {
    const results = [];
    for (let i = 0; i < runs; i++) {
      const { lhr } = await lighthouse(base + path, { port: chromium.port, logLevel: 'error', output: 'json', onlyCategories: categories });
      if (lhr.runtimeError) throw new Error(`${path}: ${lhr.runtimeError.code} ${lhr.runtimeError.message}`);
      results.push(lhr);
    }
    results.sort((a, b) => a.categories.performance.score - b.categories.performance.score);
    const lhr = results[Math.floor(results.length / 2)];
    const score = (c) => Math.round(lhr.categories[c].score * 100);
    const num = (id) => lhr.audits[id].numericValue;
    const row = {
      path,
      performance: score('performance'), accessibility: score('accessibility'), bestPractices: score('best-practices'), seo: score('seo'),
      lcp: num('largest-contentful-paint'), cls: num('cumulative-layout-shift'), tbt: num('total-blocking-time'), fcp: num('first-contentful-paint'),
      bytes: num('total-byte-weight'),
      perfRuns: results.map((r) => Math.round(r.categories.performance.score * 100)),
    };
    rows.push(row);
    console.log(`${path.padEnd(28)} perf ${String(row.performance).padStart(3)}  a11y ${String(row.accessibility).padStart(3)}  bp ${String(row.bestPractices).padStart(3)}  seo ${String(row.seo).padStart(3)}  │  LCP ${(row.lcp / 1000).toFixed(2)} s  CLS ${row.cls.toFixed(3)}  TBT ${Math.round(row.tbt)} ms  FCP ${(row.fcp / 1000).toFixed(2)} s  ${Math.round(row.bytes / 1024)} KiB  (perf runs ${row.perfRuns.join('/')})`);
    if (flags.details) {
      for (const c of categories) {
        for (const ref of lhr.categories[c].auditRefs) {
          const a = lhr.audits[ref.id];
          if (ref.weight > 0 && a.score !== null && a.score < 1) console.log(`    ${c}: ${a.id} (${Math.round(a.score * 100)}) ${a.displayValue ?? ''}`);
        }
      }
      // Lighthouse 13 reports the LCP element and its timing parts in the LCP breakdown insight.
      const parts = lhr.audits['lcp-breakdown-insight']?.details?.items ?? [];
      const node = parts.find((i) => i.type === 'node');
      const timing = parts.find((i) => i.type === 'table')?.items?.map((i) => `${i.label} ${Math.round(i.duration)} ms`).join(', ');
      if (node?.snippet) console.log(`    LCP element: ${node.snippet.slice(0, 120)}`);
      if (timing) console.log(`    LCP parts: ${timing}`);
    }
  }
} finally {
  await chromium.close();
}
if (flags.json) writeFileSync(String(flags.json), JSON.stringify(rows, null, 2) + '\n');

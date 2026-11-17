// The name's fit (lib/fit.ts, lib/type-metrics.ts), without a browser: the widths read from the fonts
// match what Chromium drew with the same files, the rule picks the lines and the size the CSS computes,
// every name of the set runs from margin to margin at every width, and the share images fit it too.
// scripts/fit.mjs proves the same in a real browser (pnpm fit, part of pnpm qa).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { root, useSite } from './helpers';
import { decodePng } from './png';
import { charCount, fitAmount, fitName, masthead, NAME_CHARS, nameLines, nameNotes, nameSize, ONE_LINE_PX, SLACK, STYLES, widthOf } from '../lib/fit';
import { NAMES, PRICES, WIDTHS } from './fit-cases.mjs';

before(() => { useSite(); });

/** The column at a viewport width: the viewport less the gutters (clamp(20px, 5vw, 56px)), at most 1200 px. */
const column = (v: number) => Math.min(v - 2 * Math.max(20, Math.min(0.05 * v, 56)), 1200);

test('widths read from the fonts are the widths Chromium draws (156, same files, measured at 100 px)', () => {
  // getBoundingClientRect().width / 100 of each text, set as the masthead and the amount set it.
  const drawn: [string, 'latin' | 'georgian', 'name' | 'amount', number][] = [
    ['Elisabed Shabloni', 'latin', 'name', 5.8341],
    ['Bo Li Yu', 'latin', 'name', 2.5055], // a kerned pair across a space is not kerned
    ['AVATAR Tywo', 'latin', 'name', 4.5483], // kerning takes 4.7% here
    ['Łukasz Żółć', 'latin', 'name', 3.8766], // three of the faces' files in one name
    ['Maximiliane von Hohenbruck-Aue', 'latin', 'name', 10.9989],
    ['ელისაბედ შაბლონი', 'georgian', 'name', 8.9531],
    ['ჟუჟუნა წყალტუბოელი', 'georgian', 'name', 10.0541],
  ];
  for (const [text, script, kind, em] of drawn) {
    const style = kind === 'name' ? STYLES.name[script] : STYLES.amount[script];
    const { width, missing } = widthOf(text, script, style);
    assert.deepEqual(missing, []);
    assert.ok(Math.abs(width - em) / em < 0.0005, `${text}: ${width.toFixed(4)} em, Chromium drew ${em} em`);
  }
});

test('the masthead and the amount are set as lib/fit.ts measures them (app/styles)', () => {
  const home = readFileSync(join(root, 'app/styles/home.css'), 'utf8');
  const pages = readFileSync(join(root, 'app/styles/pages.css'), 'utf8');
  const base = readFileSync(join(root, 'app/styles/base.css'), 'utf8');
  /** Every declaration block of a selector, in order. */
  const rule = (css: string, selector: string) => [...css.matchAll(new RegExp(`\\n${selector.replace(/[.()]/g, '\\$&')} \\{([^}]*)\\}`, 'g'))].map((m) => m[1]).join('\n');
  assert.match(rule(home, '.name'), new RegExp(`font-stretch: ${STYLES.name.latin.wdth}%;[\\s\\S]*font-weight: ${STYLES.name.latin.wght};[\\s\\S]*letter-spacing: var\\(--track-display\\)`));
  assert.match(base, new RegExp(`--track-display: ${STYLES.name.latin.tracking}em;`));
  assert.match(rule(home, '.name:lang(ka)'), new RegExp(`font-stretch: ${STYLES.name.georgian.wdth}%;`));
  assert.match(base, /:root:lang\(ka\) \{[^}]*--track-display: normal;/);
  assert.match(rule(pages, '.price__amount'), new RegExp(`font-size: calc\\(100cqi / var\\(--amount-fit\\)\\);[\\s\\S]*font-stretch: ${STYLES.amount.latin.wdth}%; font-weight: ${STYLES.amount.latin.wght};`));
  assert.match(pages, new RegExp(`\\.price__amount:lang\\(ka\\) \\{ font-stretch: ${STYLES.amount.georgian.wdth}%; \\}`));
  // the size: the column over the widest line of the fewest lines that reach the smallest size
  assert.match(home, /--fit-size: min\(\s*var\(--fit-c\) \/ var\(--fit-3\),\s*max\(var\(--fit-c\) \/ var\(--fit-2\), var\(--fit-c\) \/ var\(--fit-2\) \+ \(var\(--fit-2-from\) - var\(--fit-c\)\) \* 1000\),\s*max\(var\(--fit-c\) \/ var\(--fit-1\), var\(--fit-c\) \/ var\(--fit-1\) \+ \(var\(--fit-1-from\) - var\(--fit-c\)\) \* 1000\)\s*\);/);
});

test('the rule: the fewest lines that reach the script’s smallest masthead, and the demo where the design had it', () => {
  const demo = fitName('Elisabed Shabloni', 'latin');
  assert.deepEqual(demo.lines, [['Elisabed Shabloni'], ['Elisabed', 'Shabloni'], ['Elisabed', 'Shabloni']]);
  assert.ok(Math.abs(demo.em[0] - 5.8341 * SLACK) < 0.001);
  // one line from about 520 px, as the design had it (the column is 90% of the viewport there)
  assert.ok(Math.abs(demo.from[0] / 0.9 - 520) < 3, `${demo.from[0] / 0.9}`);
  assert.equal(demo.from[1], 0, 'two lines are as narrow as it gets: never three');
  const ka = fitName('ელისაბედ შაბლონი', 'georgian');
  assert.ok(Math.abs(ka.from[0] / 0.9 - 640) < 3, `${ka.from[0] / 0.9}`);
  // A size at least ONE_LINE_PX on one line; below, two lines; the size always the column over the widest line.
  for (const c of [200, 300, 468, 470, 900, 1168]) {
    const lines = nameLines(demo, c);
    assert.equal(lines, c >= demo.from[0] ? 1 : 2);
    assert.ok(Math.abs(nameSize(demo, c) - c / demo.em[lines - 1]) < 1e-9);
    if (lines === 1) assert.ok(nameSize(demo, c) >= ONE_LINE_PX.latin - 0.01);
  }
  // Three lines only where two are too small, breaking after a hyphen when it must.
  const long = fitName('Maximiliane von Hohenbruck-Aue', 'latin');
  assert.deepEqual(long.lines[2], ['Maximiliane von', 'Hohenbruck-', 'Aue']);
  assert.equal(nameLines(long, column(320)), 3);
  assert.equal(nameLines(long, column(768)), 2);
  assert.equal(nameLines(long, column(1280)), 1);
  // A name with no space takes one line at any width.
  assert.deepEqual(fitName('Madonna', 'latin').from, [0, 0]);
  // What the page gets: the custom properties, and whether the name dips below the edge.
  assert.deepEqual(Object.keys(masthead('gigi jgharkava', 'latin').style), ['--fit-1', '--fit-2', '--fit-3', '--fit-1-from', '--fit-2-from']);
  assert.equal(masthead('gigi jgharkava', 'latin').dip, true);
  assert.equal(masthead('Elisabed Shabloni', 'latin').dip, false);
  assert.equal(masthead('ნია ხე', 'georgian').dip, true);
});

test('every name of the set runs from margin to margin at every width: never past it, at most 1% short', () => {
  for (const script of ['latin', 'georgian'] as const) {
    for (const name of NAMES[script]) {
      const fit = fitName(name, script);
      assert.deepEqual(fit.missing, [], `${name}: every character is in the fonts`);
      for (const v of WIDTHS) {
        const c = column(v);
        const n = nameLines(fit, c);
        const size = nameSize(fit, c);
        const widest = Math.max(...fit.lines[n - 1].map((line) => widthOf(line, script, STYLES.name[script]).width)) * size;
        assert.ok(widest <= c, `${name} @${v}: ${widest.toFixed(1)} px in a ${c} px column`);
        assert.ok(widest >= c * 0.99, `${name} @${v}: ${((1 - widest / c) * 100).toFixed(1)}% short`);
      }
    }
  }
  // The amount, on one line below 1000 px, for each price.
  for (const price of PRICES) {
    for (const [amount, script] of [[`From ${price}`, 'latin'], [`${price}-დან`, 'georgian']] as const) {
      const text = amount.replace(/ /g, ' ');
      const { em } = fitAmount(text, script);
      for (const v of WIDTHS.filter((w) => w < 1000)) {
        const drawn = widthOf(text, script, STYLES.amount[script]).width * (column(v) / em);
        assert.ok(drawn <= column(v) && drawn >= column(v) * 0.99, `${amount} @${v}`);
      }
    }
  }
});

test('outside 6 to 30 characters: never past the margin, and pnpm check says what is promised', () => {
  assert.equal(charCount('Zoë O’Brien-Smith'), 17);
  // Shorter: as large as a name of six characters would be, so it stops short.
  const al = fitName('Al', 'latin');
  assert.ok(Math.abs(al.em[0] - widthOf('Al', 'latin', STYLES.name.latin).width * SLACK * 3) < 1e-9);
  assert.deepEqual(nameNotes('Al', 'content/en/site.json'), ['content/en/site.json: "name" has 2 characters: below 6 the masthead draws it as large as a 6-character name, so it stops short of the right margin (it never runs past it)']);
  const long = 'Maximiliane Josephine von Hohenbruck-Aue';
  assert.ok(charCount(long) > NAME_CHARS.max);
  assert.match(nameNotes(long, 'content/en/site.json')[0], /has 40 characters: above 30 the masthead still runs from margin to margin, on up to 3 lines, but smaller/);
  const fit = fitName(long, 'latin');
  for (const v of WIDTHS) assert.ok(Math.max(...fit.lines[nameLines(fit, column(v)) - 1].map((l) => widthOf(l, 'latin', STYLES.name.latin).width)) * nameSize(fit, column(v)) <= column(v));
  for (const name of [...NAMES.latin, ...NAMES.georgian]) assert.deepEqual(nameNotes(name, 'x'), [], name);
});

test('the share images fit the name: its ink within the margins, its widest line across most of them', async (t) => {
  const og = await import('../lib/og');
  const warn = t.mock.method(console, 'warn', () => {});
  const W = 1200, PAD = 72;
  for (const [lang, names] of [['en', NAMES.latin], ['ka', NAMES.georgian]] as const) {
    const horizon = lang === 'ka' ? 356 : 384;
    for (const name of names) {
      const png = decodePng(Buffer.from(await og.shareImage({ lang, title: name, wordmark: false, name: true }).arrayBuffer()));
      // the title's foam pixels in the field (the domain, top right, is a softer colour)
      let left = W, right = 0, top = horizon;
      for (let x = 0; x < W; x++)
        for (let y = 0; y < horizon; y++) {
          const [r, g, b] = png.rgb(x, y);
          if (r > 230 && g > 215 && b > 220) { left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); }
        }
      assert.ok(left >= PAD - 4 && right <= W - PAD + 4, `${name}: ink from ${left} to ${right} px, the margins are ${PAD} and ${W - PAD}`);
      // across the width, unless the field's height is what limits it (its top at the wordmark's row)
      assert.ok(right - left >= (W - 2 * PAD) * 0.9 || top < 126, `${name}: ink ${right - left} px wide of ${W - 2 * PAD}, its top at ${top} px`);
      assert.ok(top >= 92, `${name}: its top at ${top} px, under the domain's row (which ends near 88 px)`);
    }
  }
  assert.equal(warn.mock.callCount(), 0, 'every letter of every name is drawn');
});

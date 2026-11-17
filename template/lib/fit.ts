// The name on the horizon runs from the left margin to the right one at every width, whatever the
// name. Its size is computed here, at build time, from the name and the fonts the page draws it with
// (assets/fonts/web/, read by lib/type-metrics.ts), and handed to the page as a few custom properties;
// app/styles/home.css turns them into a font size with min() and max() alone: no media query, no
// script, no layout shift. The same is done for the amount on the Work page (app/styles/pages.css).
//
// The rule, for a name of 6 to 30 characters:
// - The name takes one, two or three lines. The browser breaks them itself, at a space or after a
//   hyphen, and only where the size leaves it no room on fewer lines.
// - At a given column width the name takes the fewest lines at which it is at least ONE_LINE_PX (the
//   script's smallest masthead), and is sized so that its widest line runs exactly across the column
//   (less SLACK). When no number of lines reaches that size, it takes the most lines it can.
// - A name shorter than 6 characters is drawn as large as a 6-character name of the same letters
//   would be, so it stops short of the right margin; a longer one than 30 still fits, only smaller.
//   `pnpm check` says so for each (`nameNotes`).
import { join } from 'node:path';
import type { CSSProperties } from 'react';
import { measure, readFont, type Face, type FontFile } from './type-metrics';
import type { Script } from './content';

/** The name's characters the promise is made for. */
export const NAME_CHARS = { min: 6, max: 30 } as const;
/** The widest line is drawn this much narrower than the column, for rounding between browsers. */
export const SLACK = 1.005;
/**
 * The smallest masthead size on one line (or on two), in px: below it the name takes one more line.
 * Measured from the design's own breakpoints for the demo name: one line from 520 px (Latin) and from
 * 640 px (Georgian).
 */
export const ONE_LINE_PX: Record<Script, number> = { latin: 80, georgian: 64 };
export const MAX_LINES = 3;

/** How each large text is set (app/styles/home.css, pages.css): width axis, weight, letter-spacing in em. */
export const STYLES = {
  name: { latin: { wdth: 62, wght: 800, tracking: -0.012 }, georgian: { wdth: 62.5, wght: 800, tracking: 0 } },
  amount: { latin: { wdth: 62, wght: 800, tracking: 0 }, georgian: { wdth: 70, wght: 800, tracking: 0 } },
} as const;

// The unicode-range Google Fonts gives each file in the page's CSS (next/font copies it): the browser
// draws a character with the first face of the family whose range covers it.
const range = (s: string): [number, number][] =>
  s.split(',').map((r) => {
    const [a, b] = r.trim().replace(/^U\+/, '').split('-');
    if (a.includes('?')) return [parseInt(a.replace(/\?/g, '0'), 16), parseInt(a.replace(/\?/g, 'F'), 16)];
    return [parseInt(a, 16), parseInt(b ?? a, 16)];
  });
const LATIN = range('U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD');
const LATIN_EXT = range('U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C4,U+2113,U+2C60-2C7F,U+A720-A7FF');
const VIETNAMESE = range('U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB');
const GEORGIAN = range('U+0589,U+10A0-10FF,U+1C90-1CBA,U+1CBD-1CBF,U+205A,U+2D00-2D2F,U+2E31');

/** The pages' two families (lib/fonts/*.ts), each as the files of its subsets in the order the browser tries them. */
export const FONT_FILES = {
  archivo: [['archivo-latin.woff2', LATIN], ['archivo-latin-ext.woff2', LATIN_EXT], ['archivo-vietnamese.woff2', VIETNAMESE]],
  georgian: [['noto-georgian-latin.woff2', LATIN], ['noto-georgian-latin-ext.woff2', LATIN_EXT], ['noto-georgian-georgian.woff2', GEORGIAN]],
} as const satisfies Record<string, readonly (readonly [string, [number, number][]])[]>;

const files = new Map<string, FontFile>();
const faces = new Map<string, Face[]>();
function family(name: keyof typeof FONT_FILES, axes: { wdth: number; wght: number }, script: Script): Face[] {
  const key = `${name} ${axes.wdth} ${axes.wght} ${script}`;
  let found = faces.get(key);
  if (!found) {
    found = FONT_FILES[name].map(([file, ranges]) => {
      const path = join(process.cwd(), 'assets/fonts/web', file);
      let font = files.get(path);
      if (!font) { font = readFont(path, ranges); files.set(path, font); }
      return font.at(axes, script === 'georgian' ? 'geor' : 'latn');
    });
    faces.set(key, found);
  }
  return found;
}

/** The families a page draws with, in the order of `--sans` in app/styles/base.css. */
const stack = (script: Script, axes: { wdth: number; wght: number }) =>
  script === 'georgian' ? [family('georgian', axes, script), family('archivo', axes, script)] : [family('archivo', axes, script), family('georgian', axes, script)];

/** The width of `text` in em, as the page draws it in `style`. */
export function widthOf(text: string, script: Script, style: { wdth: number; wght: number; tracking: number }) {
  return measure(text, stack(script, style), style.tracking);
}

/** Characters as a reader counts them (a letter with its accents is one). */
export const charCount = (text: string) => [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].length;

/**
 * Every way to set `text` on `lines` lines, breaking where a browser may: at a space (which then
 * disappears) or after a hyphen between letters (which stays at the line's end).
 */
function layouts(text: string, lines: number): string[][] {
  const breaks: { end: number; next: number }[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === ' ') breaks.push({ end: i, next: i + 1 });
    else if (/[-‐]/.test(text[i]) && /\p{L}/u.test(text[i - 1] ?? '') && /\p{L}/u.test(text[i + 1] ?? '')) breaks.push({ end: i + 1, next: i + 1 });
  }
  const out: string[][] = [];
  const pick = (from: number, start: number, left: number, acc: string[]) => {
    if (left === 0) { out.push([...acc, text.slice(start)]); return; }
    for (let b = from; b < breaks.length; b++) pick(b + 1, breaks[b].next, left - 1, [...acc, text.slice(start, breaks[b].end)]);
  };
  pick(0, 0, lines - 1, []);
  return out.filter((l) => l.every((line) => line.trim()));
}

export interface Fit {
  /** The widest line in em (SLACK included) on one, two and three lines; equal when the text cannot take more. */
  em: [number, number, number];
  /** The lines of each, as a browser would break them at that size. */
  lines: [string[], string[], string[]];
  /** The column width in px from which one line (index 0), then two (index 1), reach ONE_LINE_PX. */
  from: [number, number];
  /** Characters no font of the page has (measured as its widest glyph). */
  missing: string[];
}

/** The masthead's fit for a name in a script. */
export function fitName(name: string, script: Script): Fit {
  const style = STYLES.name[script];
  const text = name.trim().replace(/\s+/g, ' ');
  const missing = new Set<string>();
  const width = (line: string) => {
    const m = widthOf(line, script, style);
    m.missing.forEach((ch) => missing.add(ch));
    return m.width;
  };
  // A name shorter than NAME_CHARS.min is drawn as large as one of that length.
  const short = Math.max(1, NAME_CHARS.min / Math.max(1, charCount(text)));
  const best: { em: number; lines: string[] }[] = [];
  for (let n = 1; n <= MAX_LINES; n++) {
    const options = layouts(text, n).map((lines) => ({ lines, em: Math.max(...lines.map(width)) }));
    const top = options.sort((a, b) => a.em - b.em)[0];
    const prev = best[n - 2];
    best.push(top && (!prev || top.em < prev.em) ? top : prev);
  }
  const em = best.map((b) => b.em * SLACK * short) as Fit['em'];
  const px = ONE_LINE_PX[script];
  return {
    em,
    lines: best.map((b) => b.lines) as Fit['lines'],
    // Where a layout is no narrower than the one with fewer lines, it is never chosen: 0 keeps the fewer lines.
    from: [em[1] < em[0] ? px * em[0] : 0, em[2] < em[1] ? px * em[1] : 0],
    missing: [...missing],
  };
}

const num = (n: number) => String(Math.round(n * 10000) / 10000);

/** The custom properties app/styles/home.css sizes the name from (on the page's <main>). */
export function nameFitStyle(fit: Fit): Record<string, string> {
  return {
    '--fit-1': num(fit.em[0]), '--fit-2': num(fit.em[1]), '--fit-3': num(fit.em[2]),
    '--fit-1-from': `${num(fit.from[0])}px`, '--fit-2-from': `${num(fit.from[1])}px`,
  };
}

/** The name's size in px in a column `c` px wide, as app/styles/home.css computes it. */
export function nameSize(fit: Fit, c: number, big = 1000) {
  return Math.min(
    c / fit.em[2],
    Math.max(c / fit.em[1], c / fit.em[1] + (fit.from[1] - c) * big),
    Math.max(c / fit.em[0], c / fit.em[0] + (fit.from[0] - c) * big),
  );
}

/** How many lines the name takes in a column `c` px wide. */
export const nameLines = (fit: Fit, c: number) => (c >= fit.from[0] ? 1 : c >= fit.from[1] ? 2 : 3);

/** The Work page's amount, on one line: its width in em (SLACK included), for app/styles/pages.css. */
export function fitAmount(amount: string, script: Script): { em: number; missing: string[] } {
  const m = widthOf(amount, script, STYLES.amount[script]);
  const short = Math.max(1, NAME_CHARS.min / Math.max(1, charCount(amount)));
  return { em: m.width * SLACK * short, missing: m.missing };
}

/** Whether the text reaches below the baseline in its script (descenders, a comma): its ink crosses the field's edge. */
export const dips = (text: string, script: Script) => script === 'georgian' || /[gjpqyçşţęąįųŋ,;]/.test(text);

const fits = new Map<string, Fit>();
/** fitName, once per name and script. */
export function nameFitOf(name: string, script: Script): Fit {
  const key = `${script} ${name}`;
  let fit = fits.get(key);
  if (!fit) { fit = fitName(name, script); fits.set(key, fit); }
  return fit;
}

/**
 * What a page with the name on its horizon needs: the custom properties for the element that holds
 * both the masthead and what follows it, and whether the name dips below the edge.
 */
export function masthead(name: string, script: Script): { style: CSSProperties; dip: boolean } {
  return { style: nameFitStyle(nameFitOf(name, script)) as CSSProperties, dip: dips(name, script) };
}

/**
 * What `pnpm check` says about a name outside NAME_CHARS: what the masthead promises it.
 */
export function nameNotes(name: string, file: string): string[] {
  const n = charCount(name.trim());
  if (n < NAME_CHARS.min) return [`${file}: "name" has ${n} characters: below ${NAME_CHARS.min} the masthead draws it as large as a ${NAME_CHARS.min}-character name, so it stops short of the right margin (it never runs past it)`];
  if (n > NAME_CHARS.max) return [`${file}: "name" has ${n} characters: above ${NAME_CHARS.max} the masthead still runs from margin to margin, on up to ${MAX_LINES} lines, but smaller than a name of ${NAME_CHARS.max}`];
  return [];
}

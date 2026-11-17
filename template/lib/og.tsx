/**
 * Share images (Open Graph, Twitter) in the Saperavi identity: a wine field, the title standing
 * on its bottom edge (the horizon), one line of text on the mist below. Georgian descenders (and
 * Latin g, p, y…) cross the edge and turn wine, as the Georgian name does on /ka.
 *
 * Use from any `opengraph-image.tsx`:
 *
 *   import { shareImage, ogSize as size, ogContentType as contentType } from '@/lib/og';
 *   export { size, contentType };
 *   export const alt = `Work with me – ${L('en').site.name}`;
 *   export default () => shareImage({ lang: 'en', title: 'Work with me', text: '…' });
 *
 * The project pages use `projectShareImage()` (through lib/og-project.tsx): the same field with the
 * project's title and summary, and its install command straddling the horizon, as on the page.
 *
 * Every font is committed under assets/fonts (SIL OFL 1.1, licences alongside), so the build draws the
 * same images with or without a network: Archivo at width 62.5 / weight 800 for titles and 100 / 400
 * for text, Noto Sans Georgian likewise, IBM Plex Mono 400 for commands. Titles and commands are
 * measured from the font files, so they fill the width and wrap or shrink only when they must. A
 * character none of the fonts has is reported in the build log, never silently dropped.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { getContent, L, type Lang } from './content';

export const ogSize = { width: 1200, height: 630 };
export const ogContentType = 'image/png';

/** The site's palette (content/site.json "colours", lib/colours.ts), for anything drawn into a share image. */
export function ogColors() {
  const p = getContent().palette;
  return { saperavi: p.field, deep: p.deep, foam: p.foam, foamSoft: p.foamSoft, mist: p.mist, ink: p.ink, inkSoft: p.inkSoft };
}

type FontKey = 'latinDisplay' | 'latinText' | 'georgianDisplay' | 'georgianText' | 'mono';
const files: Record<FontKey, string> = {
  latinDisplay: 'archivo-ec-800.ttf',
  latinText: 'archivo-400.ttf',
  georgianDisplay: 'noto-georgian-ec-800.ttf',
  georgianText: 'noto-georgian-400.ttf',
  mono: 'ibm-plex-mono-400.ttf',
};

/** Advance widths, coverage and vertical metrics read straight from a TrueType file (cmap 4, hmtx, hhea). */
interface Metrics { upm: number; ascent: number; descent: number; capHeight: number; advance: (cp: number) => number; has: (cp: number) => boolean }

function readMetrics(buf: Buffer): Metrics {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const tables: Record<string, number> = {};
  for (let i = 0; i < dv.getUint16(4); i++) tables[buf.toString('latin1', 12 + i * 16, 16 + i * 16)] = dv.getUint32(12 + i * 16 + 8);
  const upm = dv.getUint16(tables.head + 18);
  const ascent = dv.getInt16(tables.hhea + 4);
  const descent = -dv.getInt16(tables.hhea + 6);
  // OS/2 version 2 and later give the height of the capitals.
  const capHeight = tables['OS/2'] && dv.getUint16(tables['OS/2']) >= 2 ? dv.getInt16(tables['OS/2'] + 88) : Math.round(upm * 0.7);
  const numHMetrics = dv.getUint16(tables.hhea + 34);
  const glyphOf = new Map<number, number>();
  const cmap = tables.cmap;
  for (let i = 0; i < dv.getUint16(cmap + 2); i++) {
    const sub = cmap + dv.getUint32(cmap + 4 + i * 8 + 4);
    if (dv.getUint16(sub) !== 4) continue;
    const segX2 = dv.getUint16(sub + 6);
    const ends = sub + 14, starts = ends + segX2 + 2, deltas = starts + segX2, offsets = deltas + segX2;
    for (let s = 0; s < segX2 / 2; s++) {
      const end = dv.getUint16(ends + s * 2), start = dv.getUint16(starts + s * 2);
      const delta = dv.getInt16(deltas + s * 2), ro = dv.getUint16(offsets + s * 2);
      for (let c = start; c <= end && c !== 0xffff; c++) {
        const g = ro === 0 ? (c + delta) & 0xffff : dv.getUint16(offsets + s * 2 + ro + (c - start) * 2);
        if (g) glyphOf.set(c, ro === 0 ? g : (g + delta) & 0xffff);
      }
    }
    break;
  }
  const hmtx = tables.hmtx;
  const adv = (g: number) => dv.getUint16(hmtx + Math.min(g, numHMetrics - 1) * 4);
  return { upm, ascent, descent, capHeight, advance: (cp) => adv(glyphOf.get(cp) ?? 0), has: (cp) => glyphOf.has(cp) };
}

type Loaded = Record<FontKey, { data: Buffer; metrics: Metrics }>;
let loaded: Loaded | null = null;
function fonts(): Loaded {
  if (!loaded) {
    const dir = join(process.cwd(), 'assets/fonts');
    loaded = Object.fromEntries(
      Object.entries(files).map(([k, f]) => {
        const data = readFileSync(join(dir, f));
        return [k, { data, metrics: readMetrics(data) }];
      }),
    ) as Loaded;
  }
  return loaded;
}

/** The fonts in ImageResponse form. Each script's face comes first; the other is the fallback (₾ lives in Noto Sans Georgian). */
export function ogFonts(lang: Lang, { mono = false }: { mono?: boolean } = {}) {
  const f = fonts();
  const latin = [
    { name: 'Archivo', data: f.latinDisplay.data, weight: 800 as const, style: 'normal' as const },
    { name: 'Archivo', data: f.latinText.data, weight: 400 as const, style: 'normal' as const },
  ];
  const georgian = [
    { name: 'Noto Sans Georgian', data: f.georgianDisplay.data, weight: 800 as const, style: 'normal' as const },
    { name: 'Noto Sans Georgian', data: f.georgianText.data, weight: 400 as const, style: 'normal' as const },
  ];
  const code = mono ? [{ name: 'IBM Plex Mono', data: f.mono.data, weight: 400 as const, style: 'normal' as const }] : [];
  return [...(georgianScript(lang) ? [...georgian, ...latin] : [...latin, ...georgian]), ...code];
}

const georgianScript = (lang: Lang) => L(lang).script === 'georgian';

const family = (lang: Lang) => (georgianScript(lang) ? '"Noto Sans Georgian", Archivo' : 'Archivo, "Noto Sans Georgian"');
const MONO = '"IBM Plex Mono", Archivo, "Noto Sans Georgian"';

/** The display (800) or text (400) face of the page's script, and the other script's as the fallback. */
function faces(lang: Lang, kind: 'display' | 'text'): [Metrics, Metrics] {
  const f = fonts();
  const latin = kind === 'display' ? f.latinDisplay : f.latinText;
  const georgian = kind === 'display' ? f.georgianDisplay : f.georgianText;
  return georgianScript(lang) ? [georgian.metrics, latin.metrics] : [latin.metrics, georgian.metrics];
}

/** Width of `text` at 1 px; characters missing from the first face are measured in the next one that has them. */
function measureIn(text: string, stack: Metrics[], tracking = 0) {
  let w = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    const m = stack.find((s) => s.has(cp)) ?? stack[0];
    w += m.advance(cp) / m.upm;
  }
  return w + tracking * Math.max(0, [...text].length - 1);
}

/** Width of `text` at 1 px in the display face. */
const measure = (text: string, lang: Lang, tracking: number) => measureIn(text, faces(lang, 'display'), tracking);

/** Greedy word wrap at size `px`. */
function wrapIn(text: string, stack: Metrics[], px: number, width: number, tracking = 0) {
  const lines: string[] = [];
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = lines.length ? `${lines[lines.length - 1]} ${word}` : word;
    if (lines.length && measureIn(next, stack, tracking) * px <= width) lines[lines.length - 1] = next;
    else lines.push(word);
  }
  return lines;
}
const wrap = (text: string, lang: Lang, px: number, width: number, tracking: number) => wrapIn(text, faces(lang, 'display'), px, width, tracking);

const TEXT_FACES: FontKey[] = ['latinDisplay', 'latinText', 'georgianDisplay', 'georgianText'];
const MONO_FACES: FontKey[] = ['mono', 'latinText', 'georgianText'];

/**
 * `text` with only what the committed fonts can draw. For any other character ImageResponse would
 * fetch a font or an emoji from the network at build time (and crash or drop it offline), so it is
 * left out here, and the build log says which one, where. Unknown spaces become plain spaces.
 */
function drawable(where: string, text: string, keys: FontKey[] = TEXT_FACES): string {
  const f = fonts();
  const missing = new Set<string>();
  let out = '';
  for (const ch of text) {
    if (keys.some((k) => f[k].metrics.has(ch.codePointAt(0)!))) out += ch;
    else if (/\s/.test(ch)) out += ' ';
    else missing.add(ch);
  }
  if (missing.size) {
    const list = [...missing].map((ch) => `"${ch}" (U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')})`).join(', ');
    console.warn(`⚠ share image "${where}": no font in assets/fonts has ${list}, so it is left out. Add a font that has it (lib/og.tsx).`);
  }
  return out;
}

const W = ogSize.width, H = ogSize.height, PAD = 72;
/** The title's top stays under this line, below the wordmark and the domain. */
const TOP = 112;
const descends = (s: string, lang: Lang) => georgianScript(lang) || /[gjpqy,;()/[\]{}|@_]/.test(s);

export interface ShareImage {
  lang: Lang;
  /** Stands on the horizon, as large as it fits (one or two lines). */
  title: string;
  /** One or two plain sentences on the mist. */
  text?: string;
  /** Show the wordmark in the wine field (off for the home pages, where the title is the name). */
  wordmark?: boolean;
  /** The title is the person's name (the homes): as large as the field holds, as the masthead runs from margin to margin. */
  name?: boolean;
}

export function shareImage(image: ShareImage) {
  const { lang, wordmark = true } = image;
  const C = ogColors();
  const title = drawable(image.title, image.title);
  const text = image.text && drawable(image.title, image.text);
  const f = fonts();
  const ka = georgianScript(lang);
  const m = ka ? f.georgianDisplay.metrics : f.latinDisplay.metrics;
  const tracking = ka ? 0 : -0.012; // Georgian is never letter-spaced
  const width = W - 2 * PAD;
  const maxPx = image.name ? Infinity : ka ? 168 : 216;
  const minPx = ka ? 92 : 112;
  const lh = ka ? 1.08 : 0.9;
  const horizon = ka ? 356 : 384;
  // The lines' top stays under TOP: the last line's capitals (Mkhedruli's ascenders, about 0.8 em; an
  // accent on a capital, Å É, about 0.2 em more), and a line height for each line above it.
  const cap = (ka ? 0.8 : m.capHeight / m.upm) + (/\p{Lu}\p{M}/u.test(title.normalize('NFD')) ? 0.2 : 0);
  const room = (n: number) => Math.floor((horizon - TOP) / ((n - 1) * lh + cap));

  // One line if it fits at minPx or larger; otherwise as many as it takes at minPx.
  let px = Math.min(maxPx, room(1), Math.floor((width / measure(title, lang, tracking)) * 0.985));
  let lines = [title];
  if (px < minPx) {
    px = minPx;
    lines = wrap(title, lang, px, width, tracking);
    const longest = Math.max(...lines.map((l) => measure(l, lang, tracking)));
    px = Math.min(maxPx, room(lines.length), Math.floor((width / longest) * 0.985));
  }

  // Line box = lineHeight × px; the baseline sits at half-leading + ascent from the box top.
  const asc = m.ascent / m.upm, desc = m.descent / m.upm;
  const baselineInBox = ((lh - (asc + desc)) / 2 + asc) * px;
  const dip = ka ? 0.34 * px : 0.22 * px; // how far descenders reach below the edge

  const lineTop = (i: number) => horizon - baselineInBox - (lines.length - 1 - i) * lh * px;

  const titleLines = (color: string, offset: number) =>
    lines.map((line, i) => (
      <div
        key={i}
        style={{
          position: 'absolute', left: PAD, top: lineTop(i) - offset, display: 'flex',
          fontFamily: family(lang), fontWeight: 800, fontSize: px, lineHeight: lh, letterSpacing: `${tracking}em`,
          color, whiteSpace: 'nowrap',
        }}
      >
        {line}
      </div>
    ));

  const textTop = horizon + (lines.some((l) => descends(l, lang)) ? dip : 0) + (ka ? 34 : 40);

  return new ImageResponse(
    (
      <div style={{ width: W, height: H, display: 'flex', position: 'relative', background: C.mist, fontFamily: family(lang) }}>
        {/* the wine field, ending at the horizon; the title in foam, clipped at the edge */}
        <div style={{ position: 'absolute', left: 0, top: 0, width: W, height: horizon, display: 'flex', overflow: 'hidden', background: C.saperavi }}>
          {wordmark && (
            <div style={{ position: 'absolute', left: PAD, top: 50, display: 'flex', color: C.foam, fontSize: 34, fontWeight: 800 }}>{drawable('wordmark', L(lang).site.name)}</div>
          )}
          <div style={{ position: 'absolute', right: PAD, top: 56, display: 'flex', color: C.foamSoft, fontSize: 26, fontWeight: 400, fontFamily: 'Archivo' }}>
            {drawable('domain', getContent().site.domain)}
          </div>
          {titleLines(C.foam, 0)}
        </div>
        {/* below the edge, whatever crosses it turns wine */}
        {lines.some((l) => descends(l, lang)) && (
          <div style={{ position: 'absolute', left: 0, top: horizon, width: W, height: H - horizon, display: 'flex', overflow: 'hidden' }}>
            {titleLines(C.saperavi, horizon)}
          </div>
        )}
        {text && (
          <div
            style={{
              position: 'absolute', left: PAD, top: textTop, width: ka ? 1000 : 980, display: 'flex',
              color: C.ink, fontSize: ka ? 30 : 34, fontWeight: 400, lineHeight: ka ? 1.55 : 1.38,
            }}
          >
            {text}
          </div>
        )}
      </div>
    ),
    { ...ogSize, fonts: ogFonts(lang) },
  );
}

export interface ProjectShareImage {
  lang: Lang;
  /** The project's title, as on its page. */
  title: string;
  /** What it does, one or two sentences. */
  summary: string;
  /** The install command, drawn in the dark box on the horizon; without one, the project's address. */
  command: string;
  /** Short facts on the mist: category, status, version, licence. */
  meta: string[];
  /** The page's address without the scheme, e.g. example.com/projects/menu-cards. */
  address: string;
}

/** Fits `lines` of text into `maxLines`: the last line that fits ends in "…". */
function clampLines(lines: string[], maxLines: number, stack: Metrics[], px: number, width: number) {
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = `${kept[maxLines - 1]} ${lines[maxLines]}`;
  while (last.includes(' ') && measureIn(`${last}…`, stack, 0) * px > width) last = last.slice(0, last.lastIndexOf(' '));
  kept[maxLines - 1] = `${last.replace(/[\s,.;:–—-]+$/, '')}…`;
  return kept;
}

/**
 * A project page's share image, in the page's language: the wine field with the wordmark, the title and
 * the summary; the install command straddling the horizon, as on the page; the facts and the address on
 * the mist. The title shrinks to fit one line, and takes two only below a readable size; the summary
 * takes at most three lines; the command shrinks to fit its box.
 */
export function projectShareImage(image: ProjectShareImage) {
  const { lang } = image;
  const C = ogColors();
  const ka = georgianScript(lang);
  const name = L(lang).site.name;
  const [title, summary, address] = [image.title, image.summary, image.address].map((s) => drawable(image.title, s));
  const meta = image.meta.map((m) => drawable(image.title, m)).filter(Boolean);
  const command = drawable(`${image.title}: command`, image.command, MONO_FACES);

  const horizon = 452;
  const boxTop = horizon - 54, boxH = 108;
  const left = 72, width = W - 2 * left;

  // Title: one line from maxPx down to minPx, then two balanced lines (every word kept).
  const display = faces(lang, 'display');
  const tracking = ka ? 0 : -0.012; // Georgian is never letter-spaced
  const maxPx = ka ? 104 : 124, minPx = ka ? 76 : 88;
  const titleLh = 1.08;
  const fit = (lines: string[]) => Math.min(maxPx, Math.floor((width / Math.max(...lines.map((l) => measureIn(l, display, tracking)))) * 0.985));
  let titleLines = [title];
  const words = title.split(/\s+/).filter(Boolean);
  if (fit(titleLines) < minPx && words.length > 1) {
    const splits = words.slice(1).map((_, i) => [words.slice(0, i + 1).join(' '), words.slice(i + 1).join(' ')]);
    titleLines = splits.reduce((best, split) => (fit(split) > fit(best) ? split : best));
  }
  const titlePx = fit(titleLines);
  const titleTop = 104;

  // Summary: below the title, above the command box, at most three lines.
  const text = faces(lang, 'text');
  const summaryPx = ka ? 27 : 31, summaryLh = ka ? 1.55 : 1.4, summaryW = 1000;
  const summaryTop = titleTop + titleLines.length * titleLh * titlePx + (ka ? 22 : 14);
  const room = Math.max(1, Math.floor((boxTop - 18 - summaryTop) / (summaryPx * summaryLh)));
  const summaryLines = clampLines(wrapIn(summary, text, summaryPx, summaryW), Math.min(3, room), text, summaryPx, summaryW);

  // Command: 30 px, smaller if it would leave the box (never below 20 px).
  const f = fonts();
  const monoStack = [f.mono.metrics, f.latinText.metrics, f.georgianText.metrics];
  const inner = width - 72;
  const commandPx = Math.max(20, Math.min(30, Math.floor((inner / measureIn(command, monoStack)) * 0.99)));

  return new ImageResponse(
    (
      <div style={{ width: W, height: H, display: 'flex', position: 'relative', background: C.mist, color: C.ink, fontFamily: family(lang) }}>
        <div style={{ position: 'absolute', left: 0, top: 0, width: W, height: horizon, background: C.saperavi, display: 'flex' }} />
        <div style={{ position: 'absolute', left, top: 50, display: 'flex', fontSize: 30, fontWeight: 800, color: C.foamSoft }}>{name}</div>
        <div style={{ position: 'absolute', left: left - 4, top: titleTop, width: width + 8, display: 'flex', flexDirection: 'column' }}>
          {titleLines.map((line, i) => (
            <div key={i} style={{ display: 'flex', fontSize: titlePx, fontWeight: 800, lineHeight: titleLh, letterSpacing: `${tracking}em`, color: C.foam, whiteSpace: 'nowrap' }}>{line}</div>
          ))}
        </div>
        <div style={{ position: 'absolute', left, top: summaryTop, width: summaryW, display: 'flex', flexDirection: 'column' }}>
          {summaryLines.map((line, i) => (
            <div key={i} style={{ display: 'flex', fontSize: summaryPx, fontWeight: 400, lineHeight: summaryLh, color: C.foam, whiteSpace: 'nowrap' }}>{line}</div>
          ))}
        </div>
        {/* the install command straddles the horizon, as on the page */}
        <div style={{ position: 'absolute', left, top: boxTop, width, height: boxH, display: 'flex', alignItems: 'center', padding: '0 36px', borderRadius: 18, background: C.deep, color: C.foam, fontFamily: MONO, fontSize: commandPx, fontWeight: 400, whiteSpace: 'nowrap', overflow: 'hidden' }}>
          {command}
        </div>
        <div style={{ position: 'absolute', left, top: 536, display: 'flex', gap: 36, fontSize: 25, fontWeight: 400, color: C.inkSoft }}>
          {meta.map((m) => <div key={m} style={{ display: 'flex' }}>{m}</div>)}
        </div>
        <div style={{ position: 'absolute', left, top: 588, display: 'flex', fontSize: 21, fontWeight: 400, color: C.saperavi }}>{address}</div>
      </div>
    ),
    { ...ogSize, fonts: ogFonts(lang, { mono: true }) },
  );
}

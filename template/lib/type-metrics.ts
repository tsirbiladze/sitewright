// How wide a text is drawn, read from the font files the pages draw it with: the WOFF2 files Google
// Fonts serves for next/font (assets/fonts/web/), at any point of their width and weight axes. A glyph's
// advance comes from `hmtx` plus its `HVAR` delta at that point (after `fvar` and `avar`), and each pair's
// kerning from the `kern` feature of `GPOS`, its variation deltas included (`GDEF`'s variation store).
// Node opens WOFF2 with its own Brotli; nothing else is needed. lib/fit.ts sizes the name with it.
import { readFileSync } from 'node:fs';
import { brotliDecompressSync } from 'node:zlib';

const KNOWN_TAGS = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill'];

interface Table { view: DataView; transformed: boolean }

/** The tables of a WOFF2 file (https://www.w3.org/TR/WOFF2/), decompressed. */
function woff2Tables(file: Buffer): Record<string, Table> {
  const dv = new DataView(file.buffer, file.byteOffset, file.byteLength);
  if (dv.getUint32(0) !== 0x774f4632) throw new Error('not a WOFF2 file');
  const numTables = dv.getUint16(12);
  const compressed = dv.getUint32(20);
  let p = 48;
  const base128 = () => {
    let v = 0;
    for (let i = 0; i < 5; i++) {
      const b = file[p++];
      v = v * 128 + (b & 0x7f);
      if (!(b & 0x80)) return v;
    }
    throw new Error('bad UIntBase128');
  };
  const entries: { tag: string; length: number; transformed: boolean }[] = [];
  for (let i = 0; i < numTables; i++) {
    const flags = file[p++];
    const tag = (flags & 0x3f) === 0x3f ? file.toString('latin1', p, (p += 4)) : KNOWN_TAGS[flags & 0x3f];
    const version = flags >> 6;
    const origLength = base128();
    const transformed = tag === 'glyf' || tag === 'loca' ? version === 0 : version !== 0;
    entries.push({ tag, length: transformed ? base128() : origLength, transformed });
  }
  const data = brotliDecompressSync(file.subarray(p, p + compressed));
  const tables: Record<string, Table> = {};
  let off = 0;
  for (const e of entries) {
    tables[e.tag] = { view: new DataView(data.buffer, data.byteOffset + off, e.length), transformed: e.transformed };
    off += e.length;
  }
  return tables;
}

const f2dot14 = (v: DataView, at: number) => v.getInt16(at) / 16384;
const fixed = (v: DataView, at: number) => v.getInt32(at) / 65536;

interface Axis { tag: string; min: number; def: number; max: number }

/** An ItemVariationStore (HVAR, GDEF): the delta of an item at normalised coordinates. */
function variationStore(v: DataView, at: number) {
  const regionList = at + v.getUint32(at + 2);
  const axisCount = v.getUint16(regionList);
  const regionCount = v.getUint16(regionList + 2);
  const datas = Array.from({ length: v.getUint16(at + 6) }, (_, i) => at + v.getUint32(at + 8 + i * 4));
  const scalar = (region: number, coords: number[]) => {
    let s = 1;
    for (let a = 0; a < axisCount; a++) {
      const r = regionList + 4 + (region * axisCount + a) * 6;
      const [start, peak, end] = [f2dot14(v, r), f2dot14(v, r + 2), f2dot14(v, r + 4)];
      const c = coords[a] ?? 0;
      if (peak === 0 || start > peak || peak > end || (start < 0 && end > 0)) continue;
      if (c < start || c > end) return 0;
      if (c === peak) continue;
      s *= c < peak ? (c - start) / (peak - start) : (end - c) / (end - peak);
    }
    return s;
  };
  if (regionCount === 0) return () => 0;
  return (outer: number, inner: number, coords: number[]) => {
    const d = datas[outer];
    if (d === undefined) return 0;
    const itemCount = v.getUint16(d);
    if (inner >= itemCount) return 0;
    const wordDeltaCount = v.getUint16(d + 2);
    const regionIndexCount = v.getUint16(d + 4);
    const long = (wordDeltaCount & 0x8000) !== 0;
    const words = wordDeltaCount & 0x7fff;
    const rowSize = long ? 4 * words + 2 * (regionIndexCount - words) : 2 * words + (regionIndexCount - words);
    let p = d + 6 + regionIndexCount * 2 + inner * rowSize;
    let delta = 0;
    for (let i = 0; i < regionIndexCount; i++) {
      let value: number;
      if (i < words) { value = long ? v.getInt32(p) : v.getInt16(p); p += long ? 4 : 2; }
      else { value = long ? v.getInt16(p) : v.getInt8(p); p += long ? 2 : 1; }
      const s = scalar(v.getUint16(d + 6 + i * 2), coords);
      if (s) delta += value * s;
    }
    return delta;
  };
}

/** A Coverage table: the glyph's index in it, or -1. */
function coverage(v: DataView, at: number, glyph: number): number {
  const format = v.getUint16(at);
  if (format === 1) {
    let lo = 0, hi = v.getUint16(at + 2) - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1, g = v.getUint16(at + 4 + mid * 2);
      if (g === glyph) return mid;
      if (g < glyph) lo = mid + 1; else hi = mid - 1;
    }
    return -1;
  }
  for (let i = 0, n = v.getUint16(at + 2); i < n; i++) {
    const r = at + 4 + i * 6, start = v.getUint16(r), end = v.getUint16(r + 2);
    if (glyph >= start && glyph <= end) return v.getUint16(r + 4) + glyph - start;
  }
  return -1;
}

/** A ClassDef table: the glyph's class (0 when it has none). */
function classOf(v: DataView, at: number, glyph: number): number {
  if (v.getUint16(at) === 1) {
    const start = v.getUint16(at + 2), count = v.getUint16(at + 4);
    return glyph >= start && glyph < start + count ? v.getUint16(at + 6 + (glyph - start) * 2) : 0;
  }
  for (let i = 0, n = v.getUint16(at + 2); i < n; i++) {
    const r = at + 4 + i * 6;
    if (glyph >= v.getUint16(r) && glyph <= v.getUint16(r + 2)) return v.getUint16(r + 4);
  }
  return 0;
}

const popcount = (n: number) => { let c = 0; for (; n; n &= n - 1) c++; return c; };

/** One face: a font file with its axes, measured at one point of them. */
export interface Face {
  /** The unicode-range the page's CSS gives this file: the characters it draws. */
  covers: (cp: number) => boolean;
  /** The glyph of a character in this file, or 0. */
  glyph: (cp: number) => number;
  /** A glyph's advance in em, at the face's axis values. */
  advance: (glyph: number) => number;
  /** The kerning between two glyphs in em, at the face's axis values. */
  kern: (left: number, right: number) => number;
}

export interface FontFile {
  /** At a point of the axes: { wdth: 62, wght: 800 }. A value outside an axis's range is clamped to it, as browsers do. */
  at: (axes: Record<string, number>, script: 'latn' | 'geor') => Face;
  axes: Axis[];
}

/** Reads a WOFF2 file; `ranges` is its unicode-range in the page's CSS, as [first, last] pairs. */
export function readFont(path: string, ranges: [number, number][]): FontFile {
  const t = woff2Tables(readFileSync(path));
  const head = t.head.view, hhea = t.hhea.view, hmtx = t.hmtx.view, cmap = t.cmap.view;
  const upm = head.getUint16(18);
  const numberOfHMetrics = hhea.getUint16(34);
  const hmtxBase = t.hmtx.transformed ? 1 : 0;
  const hmtxStep = t.hmtx.transformed ? 2 : 4;
  const defaultAdvance = (g: number) => hmtx.getUint16(hmtxBase + Math.min(g, numberOfHMetrics - 1) * hmtxStep);

  // cmap: format 12 if there is one, else format 4.
  const glyphOf = new Map<number, number>();
  const subtables = Array.from({ length: cmap.getUint16(2) }, (_, i) => cmap.getUint32(8 + i * 8));
  const f12 = subtables.find((o) => cmap.getUint16(o) === 12);
  const f4 = subtables.find((o) => cmap.getUint16(o) === 4);
  if (f12 !== undefined) {
    for (let i = 0, n = cmap.getUint32(f12 + 12); i < n; i++) {
      const r = f12 + 16 + i * 12, start = cmap.getUint32(r), end = cmap.getUint32(r + 4), g0 = cmap.getUint32(r + 8);
      for (let c = start; c <= end; c++) glyphOf.set(c, g0 + c - start);
    }
  } else if (f4 !== undefined) {
    const segX2 = cmap.getUint16(f4 + 6);
    const ends = f4 + 14, starts = ends + segX2 + 2, deltas = starts + segX2, offsets = deltas + segX2;
    for (let s = 0; s < segX2 / 2; s++) {
      const end = cmap.getUint16(ends + s * 2), start = cmap.getUint16(starts + s * 2);
      const delta = cmap.getInt16(deltas + s * 2), ro = cmap.getUint16(offsets + s * 2);
      for (let c = start; c <= end && c !== 0xffff; c++) {
        let g = ro === 0 ? (c + delta) & 0xffff : cmap.getUint16(offsets + s * 2 + ro + (c - start) * 2);
        if (ro !== 0 && g) g = (g + delta) & 0xffff;
        if (g) glyphOf.set(c, g);
      }
    }
  }

  const axes: Axis[] = [];
  if (t.fvar) {
    const v = t.fvar.view, at = v.getUint16(4), size = v.getUint16(10);
    for (let i = 0; i < v.getUint16(8); i++) {
      const a = at + i * size;
      axes.push({ tag: String.fromCharCode(v.getUint8(a), v.getUint8(a + 1), v.getUint8(a + 2), v.getUint8(a + 3)), min: fixed(v, a + 4), def: fixed(v, a + 8), max: fixed(v, a + 12) });
    }
  }
  /** Normalised coordinates (fvar, then avar), as F2DOT14 values. */
  const normalise = (values: Record<string, number>) => axes.map((axis, i) => {
    const value = Math.min(axis.max, Math.max(axis.min, values[axis.tag] ?? axis.def));
    let n = value < axis.def ? (axis.def === axis.min ? 0 : (value - axis.def) / (axis.def - axis.min)) : value > axis.def ? (value - axis.def) / (axis.max - axis.def) : 0;
    if (t.avar) {
      const v = t.avar.view;
      let p = 8;
      for (let j = 0; j < i; j++) p += 2 + v.getUint16(p) * 4;
      const count = v.getUint16(p);
      const maps = Array.from({ length: count }, (_, k) => [f2dot14(v, p + 2 + k * 4), f2dot14(v, p + 4 + k * 4)]);
      for (let k = 1; k < maps.length; k++) {
        const [x0, y0] = maps[k - 1], [x1, y1] = maps[k];
        if (n <= x1) { n = x1 === x0 ? y0 : y0 + ((n - x0) * (y1 - y0)) / (x1 - x0); break; }
      }
    }
    return Math.round(n * 16384) / 16384;
  });

  // HVAR: the advance deltas, through its index map when there is one.
  let advanceDelta = (_g: number, _coords: number[]) => 0;
  if (t.HVAR) {
    const v = t.HVAR.view;
    const store = variationStore(v, v.getUint32(4));
    const mapAt = v.getUint32(8);
    advanceDelta = (g, coords) => {
      if (!mapAt) return store(0, g, coords);
      const format = v.getUint8(mapAt), entryFormat = v.getUint8(mapAt + 1);
      const count = format === 0 ? v.getUint16(mapAt + 2) : v.getUint32(mapAt + 2);
      const data = mapAt + (format === 0 ? 4 : 6);
      const size = ((entryFormat & 0x30) >> 4) + 1, innerBits = (entryFormat & 0x0f) + 1;
      let entry = 0;
      for (let b = 0, at = data + Math.min(g, count - 1) * size; b < size; b++) entry = entry * 256 + v.getUint8(at + b);
      return store(entry >>> innerBits, entry & ((1 << innerBits) - 1), coords);
    };
  }

  // GDEF's variation store, for the kerning's deltas.
  let gdefStore: ReturnType<typeof variationStore> | null = null;
  if (t.GDEF) {
    const v = t.GDEF.view;
    if (v.getUint16(2) >= 3 && v.getUint32(14)) gdefStore = variationStore(v, v.getUint32(14));
  }

  /** The PairPos subtables of the `kern` feature for a script, in lookup order. */
  const kernSubtables = (script: 'latn' | 'geor') => {
    if (!t.GPOS) return [] as number[][];
    const v = t.GPOS.view;
    const scriptList = v.getUint16(4), featureList = v.getUint16(6), lookupList = v.getUint16(8);
    const scripts = new Map<string, number>();
    for (let i = 0, n = v.getUint16(scriptList); i < n; i++) {
      const r = scriptList + 2 + i * 6;
      scripts.set(String.fromCharCode(v.getUint8(r), v.getUint8(r + 1), v.getUint8(r + 2), v.getUint8(r + 3)), scriptList + v.getUint16(r + 4));
    }
    const s = scripts.get(script) ?? scripts.get('DFLT') ?? scripts.get('latn');
    if (s === undefined || !v.getUint16(s)) return [];
    const langSys = s + v.getUint16(s);
    const lookups = new Set<number>();
    for (let i = 0, n = v.getUint16(langSys + 4); i < n; i++) {
      const fr = featureList + 2 + v.getUint16(langSys + 6 + i * 2) * 6;
      if (String.fromCharCode(v.getUint8(fr), v.getUint8(fr + 1), v.getUint8(fr + 2), v.getUint8(fr + 3)) !== 'kern') continue;
      const feature = featureList + v.getUint16(fr + 4);
      for (let j = 0, m = v.getUint16(feature + 2); j < m; j++) lookups.add(v.getUint16(feature + 4 + j * 2));
    }
    return [...lookups].sort((a, b) => a - b).map((index) => {
      const lookup = lookupList + v.getUint16(lookupList + 2 + index * 2);
      const type = v.getUint16(lookup);
      const subs: number[] = [];
      for (let i = 0, n = v.getUint16(lookup + 4); i < n; i++) {
        let sub = lookup + v.getUint16(lookup + 6 + i * 2);
        let subType = type;
        if (type === 9) { subType = v.getUint16(sub + 2); sub += v.getUint32(sub + 4); }
        if (subType === 2) subs.push(sub);
      }
      return subs;
    });
  };

  return {
    axes,
    at(values, script) {
      const coords = normalise(values);
      const lookups = kernSubtables(script);
      const v = t.GPOS?.view;
      /** The x advance a value record adds, its device (variation) delta included. */
      const xAdvance = (sub: number, record: number, format: number) => {
        if (!v || !(format & 0x4)) return 0;
        let value = v.getInt16(record + 2 * popcount(format & 0x3));
        if (format & 0x40 && gdefStore) {
          const device = v.getUint16(record + 2 * popcount(format & 0x3f));
          if (device && v.getUint16(sub + device + 4) === 0x8000) value += gdefStore(v.getUint16(sub + device), v.getUint16(sub + device + 2), coords);
        }
        return value;
      };
      const advanceCache = new Map<number, number>();
      return {
        covers: (cp) => ranges.some(([a, b]) => cp >= a && cp <= b),
        glyph: (cp) => glyphOf.get(cp) ?? 0,
        advance(g) {
          let a = advanceCache.get(g);
          if (a === undefined) { a = (defaultAdvance(g) + Math.round(advanceDelta(g, coords))) / upm; advanceCache.set(g, a); }
          return a;
        },
        kern(left, right) {
          if (!v) return 0;
          let total = 0;
          for (const subs of lookups) {
            for (const sub of subs) {
              const index = coverage(v, sub + v.getUint16(sub + 2), left);
              if (index < 0) continue;
              const f1 = v.getUint16(sub + 4), f2 = v.getUint16(sub + 6);
              const size1 = 2 * popcount(f1 & 0xff), size2 = 2 * popcount(f2 & 0xff);
              if (v.getUint16(sub) === 1) {
                const set = sub + v.getUint16(sub + 10 + index * 2);
                let found = false;
                for (let i = 0, n = v.getUint16(set); i < n; i++) {
                  const r = set + 2 + i * (2 + size1 + size2);
                  if (v.getUint16(r) !== right) continue;
                  total += xAdvance(sub, r + 2, f1) + xAdvance(sub, r + 2 + size1, f2);
                  found = true;
                  break;
                }
                if (found) break;
                continue;
              }
              const c1 = classOf(v, sub + v.getUint16(sub + 8), left), c2 = classOf(v, sub + v.getUint16(sub + 10), right);
              const class2Count = v.getUint16(sub + 14);
              if (c1 >= v.getUint16(sub + 12) || c2 >= class2Count) continue;
              const r = sub + 16 + (c1 * class2Count + c2) * (size1 + size2);
              total += xAdvance(sub, r, f1) + xAdvance(sub, r + size1, f2);
              break;
            }
          }
          return total / upm;
        },
      };
    },
  };
}

const SPACES = /[  ]/;

/** The faces of one family at one point of the axes, in the order the browser tries them for a character. */
export type Family = Face[];

/**
 * The width of `text` in em: each character drawn by the first face whose unicode-range covers it (as
 * the browser picks among a family's files), the glyphs of a run in one face kerned pair by pair, and
 * `tracking` (letter-spacing, in em) added after every character, as browsers add it. A character no
 * face has is measured as the widest glyph seen, so a missing one never makes the name look narrower.
 */
export function measure(text: string, stack: Family[], tracking = 0): { width: number; missing: string[] } {
  let width = 0;
  const missing: string[] = [];
  let prev: { face: Face; glyph: number } | null = null;
  let widest = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    const face = stack.flat().find((f) => f.covers(cp) && f.glyph(cp));
    if (!face) { missing.push(ch); prev = null; width += tracking; continue; }
    const glyph = face.glyph(cp);
    const advance = face.advance(glyph);
    widest = Math.max(widest, advance);
    width += advance + tracking;
    if (prev && prev.face === face) width += face.kern(prev.glyph, glyph);
    // Browsers shape word by word: nothing kerns across a space.
    prev = SPACES.test(ch) ? null : { face, glyph };
  }
  return { width: width + missing.length * widest, missing };
}

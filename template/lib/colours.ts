// The site's colours: `colours` in content/site.json, a preset's name or a custom pair { field, accent }.
// The field is the deep colour every page stands on; the accent fills the one call to action. The rest
// of the palette is derived from those two (OKLCH lightness and chroma, the field's hue), the neutral
// ground and ink stay as the design has them, and every place two colours meet on the site is listed
// in MEETINGS with the contrast WCAG AA asks of it: a pair that falls under it anywhere is refused.
//
// The pages get the palette as custom properties on <html> (app/styles/base.css holds the wine as its
// defaults), the share images, the icons and the browser's theme colour read it here.

export type Hex = `#${string}`;

/** The presets, each a deep field and an accent someone would choose. The first is the default. */
export const PRESETS = {
  wine: { field: '#470b2d', accent: '#d21d79' },
  ink: { field: '#172554', accent: '#c2410c' },
  pine: { field: '#123d2e', accent: '#c42b1c' },
  sea: { field: '#0b3a4a', accent: '#a35a00' },
  walnut: { field: '#3b2314', accent: '#0f766e' },
  slate: { field: '#262b33', accent: '#6741d9' },
} as const satisfies Record<string, { field: Hex; accent: Hex }>;
export type Preset = keyof typeof PRESETS;
export const DEFAULT_PRESET: Preset = 'wine';

/** What content/site.json may say: a preset's name, or a pair of colours. */
export type Colours = Preset | { field: Hex; accent: Hex };

export interface Palette {
  /** The field: headers, the masthead's ground, links and headings on the light ground. */
  field: Hex;
  /** A step deeper: the footer, the install box. */
  deep: Hex;
  /** Deeper still: the command wells in the install box. */
  well: Hex;
  /** The call to action, the focus ring on the light ground, selection. */
  accent: Hex;
  /** The call to action under the pointer. */
  accentPress: Hex;
  /** Text on the field: a light tint of its hue. */
  foam: Hex;
  /** Quieter text on the field (navigation, labels). */
  foamSoft: Hex;
  /** The neutral ground, its text and lines: the same for every palette. */
  mist: Hex; ink: Hex; inkSoft: Hex; rule: Hex; codeBg: Hex; slot: Hex;
}

const NEUTRAL = { mist: '#f3f5f8', ink: '#1e2531', inkSoft: '#4f5867', rule: '#d6dce4', codeBg: '#e4e8ee', slot: '#e8ecf1' } as const;

/** The wine as the design drew it by hand: its derived colours are kept exactly. */
const WINE: Palette = {
  field: '#470b2d', deep: '#2e0519', well: '#210311', accent: '#d21d79', accentPress: '#b8186a',
  foam: '#f8eef3', foamSoft: '#e0c4d1', ...NEUTRAL,
};

// ───────────── Colour arithmetic: sRGB, OKLab/OKLCH, WCAG contrast ─────────────

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export const isHex = (s: unknown): s is Hex => typeof s === 'string' && /^#[0-9a-fA-F]{6}$/.test(s);
const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
const hexOf = (r: number, g: number, b: number): Hex =>
  `#${[r, g, b].map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, '0')).join('')}` as Hex;

/** WCAG 2 relative luminance. */
export function luminance(hex: string) {
  const [r, g, b] = rgb(hex).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** WCAG 2 contrast ratio, 1 to 21. */
export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** sRGB hex to OKLCH (L 0–1, C, H in degrees). */
export function oklch(hex: string): [number, number, number] {
  const [r, g, b] = rgb(hex).map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360];
}

/** OKLCH to sRGB hex; a colour outside sRGB loses chroma until it fits. */
export function fromOklch(L: number, C: number, H: number): Hex {
  for (let c = C; ; c *= 0.95) {
    const a = c * Math.cos((H * Math.PI) / 180), b = c * Math.sin((H * Math.PI) / 180);
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    const lin = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
    if (lin.every((v) => v >= -1e-4 && v <= 1 + 1e-4) || c < 1e-4) return hexOf(...(lin.map((v) => toGamma(Math.min(1, Math.max(0, v)))) as [number, number, number]));
  }
}

// ───────────── The palette ─────────────

/** The palette of `colours`: a preset's, or the one derived from a custom pair. */
export function palette(colours: Colours = DEFAULT_PRESET): Palette {
  if (colours === 'wine') return WINE;
  const { field, accent } = typeof colours === 'string' ? PRESETS[colours] : colours;
  const [fl, fc, fh] = oklch(field);
  const [al, ac, ah] = oklch(accent);
  // The ratios are the hand-drawn wine's (WINE): derived from its own two colours they give it back
  // within a step of each channel. A light tint of the field's hue for text on it, and a quieter one:
  // the darkest that keeps 4.6:1 on the field and on its deeper step, however light the field is.
  const deep = fromOklch(fl * 0.755, fc * 0.74, fh);
  const foam = fromOklch(0.958, Math.min(0.016, fc * 0.135), fh);
  let soft = 0.848;
  const softC = Math.min(0.045, fc * 0.375);
  while (soft < 0.95 && Math.min(contrast(fromOklch(soft, softC, fh), field), contrast(fromOklch(soft, softC, fh), deep)) < 4.6) soft += 0.01;
  return {
    field: field as Hex,
    deep,
    well: fromOklch(fl * 0.62, fc * 0.6, fh),
    accent: accent as Hex,
    accentPress: fromOklch(Math.max(0, al - 0.053), ac * 0.91, ah),
    foam,
    foamSoft: fromOklch(soft, softC, fh),
    ...NEUTRAL,
  };
}

type Token = keyof Palette | 'white';
/**
 * Every place two colours of the palette meet on the site, with what WCAG AA asks of it: 4.5:1 for
 * text, 3:1 for large text and for what a control must show (its fill against the ground, the focus
 * ring). tests/colours.test.ts holds each against every preset, and the styles to this list.
 */
export const MEETINGS: { text: Token; on: Token; where: string; need: 4.5 | 3 }[] = [
  { text: 'foam', on: 'field', where: 'the header, the masthead and the page titles', need: 4.5 },
  { text: 'foamSoft', on: 'field', where: 'the navigation, breadcrumbs and labels on the field', need: 4.5 },
  { text: 'field', on: 'foam', where: 'the skip link', need: 4.5 },
  { text: 'foam', on: 'deep', where: 'the footer’s links and the install box', need: 4.5 },
  { text: 'foamSoft', on: 'deep', where: 'the footer’s labels and the install box’s tabs', need: 4.5 },
  { text: 'foam', on: 'well', where: 'the install box’s commands', need: 4.5 },
  { text: 'deep', on: 'foam', where: 'a copied command’s button', need: 4.5 },
  { text: 'field', on: 'mist', where: 'links and headings on the page', need: 4.5 },
  { text: 'field', on: 'white', where: 'links on a white panel', need: 4.5 },
  { text: 'field', on: 'codeBg', where: 'code in a link', need: 4.5 },
  { text: 'white', on: 'accent', where: 'the call to action’s words, and selected text', need: 4.5 },
  { text: 'white', on: 'accentPress', where: 'the call to action’s words under the pointer', need: 4.5 },
  { text: 'accent', on: 'mist', where: 'the call to action against the page, and the focus ring', need: 3 },
  { text: 'foam', on: 'field', where: 'the focus ring on the field', need: 3 },
  { text: 'ink', on: 'mist', where: 'the text of the page', need: 4.5 },
  { text: 'inkSoft', on: 'mist', where: 'quieter text on the page', need: 4.5 },
  { text: 'inkSoft', on: 'slot', where: 'the photo’s empty slot', need: 4.5 },
  { text: 'ink', on: 'codeBg', where: 'code', need: 4.5 },
];

const colourOf = (p: Palette, t: Token) => (t === 'white' ? '#ffffff' : p[t]);
/** Each meeting of a palette, with its ratio. */
export const meetings = (p: Palette) => MEETINGS.map((m) => ({ ...m, ratio: contrast(colourOf(p, m.text), colourOf(p, m.on)), colours: [colourOf(p, m.text), colourOf(p, m.on)] as const }));

const NAMES: Record<Token, string> = {
  field: 'the field', deep: 'the deep field', well: 'the command well', accent: 'the accent', accentPress: 'the pressed accent',
  foam: 'the light text', foamSoft: 'the quieter light text', white: 'white', mist: 'the page', ink: 'the ink', inkSoft: 'the soft ink',
  rule: 'the rules', codeBg: 'the code ground', slot: 'the slot',
};

/**
 * Why a custom pair is refused, in one line, or null: the meeting that falls furthest under WCAG AA,
 * named with its two colours, and how many more do.
 */
export function refusal(pair: { field: Hex; accent: Hex }): string | null {
  const failing = meetings(palette(pair)).filter((m) => m.ratio < m.need).sort((a, b) => a.ratio / a.need - b.ratio / b.need);
  if (!failing.length) return null;
  const [m] = failing;
  const from = (t: Token) => (t === 'accentPress' ? 'from the accent' : ['deep', 'well', 'foam', 'foamSoft'].includes(t) ? 'from the field' : 'the design’s');
  const named = (t: Token, hex: string) => (t === 'field' || t === 'accent' ? `${NAMES[t]} ${hex}` : `${NAMES[t]} (${hex}, ${from(t)})`);
  const more = failing.length > 1 ? ` (${failing.length - 1} more place${failing.length > 2 ? 's' : ''} fall${failing.length > 2 ? '' : 's'} short too)` : '';
  return `the field ${pair.field} and the accent ${pair.accent} fail WCAG AA: ${named(m.text, m.colours[0])} on ${named(m.on, m.colours[1])}, in ${m.where}, is ${m.ratio.toFixed(2)}:1, under the ${m.need}:1 it needs${more}`;
}

/** The palette as the custom properties app/styles/base.css draws with. */
export function cssVars(p: Palette): Record<string, string> {
  return {
    '--saperavi': p.field, '--saperavi-deep': p.deep, '--well': p.well, '--must': p.accent, '--must-press': p.accentPress,
    '--foam': p.foam, '--foam-soft': p.foamSoft,
  };
}

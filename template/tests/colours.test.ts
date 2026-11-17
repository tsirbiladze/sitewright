// The colours (lib/colours.ts, content/site.json "colours"): every place two colours meet on the site
// passes WCAG AA in every preset, a custom pair that does not is refused in one line, the styles draw
// only with the palette's tokens, and the share images and icons follow it.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { editJson, root, useSite } from './helpers';
import { decodePng } from './png';
import { contrast, cssVars, DEFAULT_PRESET, MEETINGS, meetings, palette, PRESETS, refusal, type Palette } from '../lib/colours';
import { ContentError, loadContent } from '../lib/content';

before(() => { useSite(); });

const problems = () => {
  try { loadContent(); return []; } catch (err) { if (err instanceof ContentError) return err.problems; throw err; }
};

test('every preset passes WCAG AA wherever two of its colours meet', (t) => {
  for (const name of Object.keys(PRESETS) as (keyof typeof PRESETS)[]) {
    const all = meetings(palette(name));
    for (const m of all) assert.ok(m.ratio >= m.need, `${name}: ${m.text} on ${m.on} (${m.where}) is ${m.ratio.toFixed(2)}:1, needs ${m.need}:1`);
    const tightest = all.reduce((a, b) => (a.ratio / a.need < b.ratio / b.need ? a : b));
    t.diagnostic(`${name} ${PRESETS[name].field} ${PRESETS[name].accent}: tightest ${tightest.text} on ${tightest.on} ${tightest.ratio.toFixed(2)}:1 (needs ${tightest.need})`);
  }
  assert.equal(DEFAULT_PRESET, 'wine');
  assert.ok(MEETINGS.length >= 15);
});

test('the wine is the design’s own; derived from its two colours it comes back within two steps a channel', () => {
  const wine = palette('wine');
  assert.deepEqual([wine.field, wine.deep, wine.accent, wine.foam, wine.foamSoft], ['#470b2d', '#2e0519', '#d21d79', '#f8eef3', '#e0c4d1']);
  const derived = palette(PRESETS.wine);
  const channels = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  for (const key of ['deep', 'well', 'accentPress', 'foam', 'foamSoft'] as (keyof Palette)[])
    channels(derived[key]).forEach((c, i) => assert.ok(Math.abs(c - channels(wine[key])[i]) <= 6, `${key}: ${derived[key]} against ${wine[key]}`));
});

test('app/styles/base.css holds the wine as its defaults, and the styles draw only with the palette’s tokens', () => {
  const base = readFileSync(join(root, 'app/styles/base.css'), 'utf8');
  for (const [name, value] of Object.entries(cssVars(palette('wine')))) assert.match(base, new RegExp(`\\n  ${name}: ${value};`), name);
  const p = palette('wine');
  for (const [name, value] of [['--mist', p.mist], ['--ink', p.ink], ['--ink-soft', p.inkSoft], ['--rule', p.rule], ['--code-bg', p.codeBg], ['--slot', p.slot]]) assert.match(base, new RegExp(`\\n  ${name}: ${value};`), name);
  // Outside :root, a colour is a token; plain white and black (panels, print, masks) and one shadow of the ink are all that is written as a value.
  const allowed = /^(#fff|#000|rgba\(30, 37, 49, 0\.04\))$/;
  for (const file of readdirSync(join(root, 'app/styles'))) {
    const css = readFileSync(join(root, 'app/styles', file), 'utf8').replace(/:root\s*\{[^}]*\}/g, '');
    for (const [colour] of css.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g)) assert.match(colour, allowed, `${file}: ${colour}`);
  }
});

test('a custom pair: the rest derived from it, or refused in one line naming the colours, the place and the ratio', () => {
  const ok = { field: '#1d3557', accent: '#c1121f' } as const;
  assert.equal(refusal(ok), null);
  const p = palette(ok);
  assert.equal(p.field, ok.field);
  assert.equal(p.accent, ok.accent);
  assert.ok(contrast(p.foam, p.field) > 7);
  // A light accent: white words on it are unreadable.
  assert.equal(refusal({ field: '#1d3557', accent: '#ffb703' }), 'the field #1d3557 and the accent #ffb703 fail WCAG AA: white (#ffffff, the design’s) on the accent #ffb703, in the call to action’s words, and selected text, is 1.75:1, under the 4.5:1 it needs (2 more places fall short too)');
  // A light field: nothing on it reads.
  assert.equal(refusal({ field: '#a8dadc', accent: '#c1121f' }), 'the field #a8dadc and the accent #c1121f fail WCAG AA: the field #a8dadc on the code ground (#e4e8ee, the design’s), in code in a link, is 1.24:1, under the 4.5:1 it needs (9 more places fall short too)');
  // The content: a pair, a refused pair, an unknown preset.
  editJson('site.json', (s) => { s.colours = ok; });
  assert.deepEqual(problems(), []);
  assert.equal(loadContent().palette.field, ok.field);
  editJson('site.json', (s) => { s.colours = { field: '#1d3557', accent: '#ffb703' }; });
  assert.deepEqual(problems(), [`content/site.json: "colours": ${refusal({ field: '#1d3557', accent: '#ffb703' })}`]);
  editJson('site.json', (s) => { s.colours = 'pines'; });
  assert.deepEqual(problems(), ['content/site.json: "colours" is "pines", which is not a preset (did you mean "pine"?): write a preset ("wine", "ink", "pine", "sea", "walnut", "slate") or a pair { "field": "#rrggbb", "accent": "#rrggbb" }']);
  editJson('site.json', (s) => { s.colours = { field: 'navy' }; });
  assert.deepEqual(problems(), ['content/site.json: "colours.field" must be a colour as #rrggbb (the deep colour every page stands on)', 'content/site.json: "colours.accent" is missing (the colour of the one call to action)']);
  editJson('site.json', (s) => { delete s.colours; });
  assert.equal(loadContent().palette.field, PRESETS.wine.field, 'without "colours", the wine');
  useSite();
});

test('the share images and the icons are drawn in the site’s colours', async () => {
  useSite();
  editJson('site.json', (s) => { s.colours = 'sea'; });
  const sea = palette('sea');
  const og = await import('../lib/og');
  const png = decodePng(Buffer.from(await og.shareImage({ lang: 'en', title: 'Work with me' }).arrayBuffer()));
  const hex = (x: number, y: number) => `#${png.rgb(x, y).map((c) => c.toString(16).padStart(2, '0')).join('')}`;
  assert.equal(hex(10, 10), sea.field, 'the field');
  assert.equal(hex(10, 620), sea.mist, 'the ground');
  const icon = await (await import('../app/icon')).default().text();
  assert.match(icon, new RegExp(`fill="${sea.field}"`));
  assert.match(icon, new RegExp(`fill="${sea.foam}"`));
  const apple = decodePng(Buffer.from(await (await import('../app/apple-icon')).default().arrayBuffer()));
  assert.deepEqual(apple.rgb(5, 5), [1, 3, 5].map((i) => parseInt(sea.field.slice(i, i + 2), 16)));
  useSite();
});

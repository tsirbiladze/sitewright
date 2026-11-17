// The share images (lib/og.tsx, lib/og-project.tsx): drawn from the committed fonts with the network
// blocked, every part of the layout actually drawn (not silently left out), the same bytes every time.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { useSite, slug } from './helpers';
import { decodePng, share, type Png } from './png';

let og: typeof import('../lib/og');
let projectOgImage: typeof import('../lib/og-project').projectOgImage;
let getProject: typeof import('../lib/projects').getProject;
const realFetch = globalThis.fetch;
const fetched: string[] = [];

before(async () => {
  useSite({ skill: true });
  // No network. ImageResponse loads its own WebAssembly from data: URLs; anything else (a font or an
  // emoji for a character the committed fonts lack) would land here and fail the test.
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith('data:')) return realFetch(input, init);
    fetched.push(url);
    throw new Error(`network is off in this test: ${url}`);
  }) as typeof fetch;
  og = await import('../lib/og');
  ({ projectOgImage } = await import('../lib/og-project'));
  ({ getProject } = await import('../lib/projects'));
});
after(() => { globalThis.fetch = realFetch; });

const bytes = async (res: Response) => Buffer.from(await res.arrayBuffer());
const png = async (res: Response) => decodePng(await bytes(res));
/** The site's palette (app/styles/base.css). */
const C = { saperavi: '#470b2d', foam: '#f8eef3', mist: '#f3f5f8', ink: '#1e2531', inkSoft: '#4f5867' };

/** Where each part of a project image is drawn (lib/og.tsx, projectShareImage). */
const skillBoxes = {
  title: { x: 72, y: 110, w: 1056, h: 120 },
  summary: { x: 72, y: 245, w: 1000, h: 90 },
  command: { x: 100, y: 420, w: 1000, h: 60 },
  meta: { x: 72, y: 530, w: 1056, h: 40 },
  address: { x: 72, y: 585, w: 1056, h: 30 },
};
const skillParts = (p: Png) => ({
  title: share(p, C.foam, skillBoxes.title),
  summary: share(p, C.foam, skillBoxes.summary),
  command: share(p, C.foam, skillBoxes.command, 60),
  meta: share(p, C.inkSoft, skillBoxes.meta, 60),
  address: share(p, C.saperavi, skillBoxes.address, 60),
});

test('a German page image: Latin script, ä ö ü ß drawn without a warning', async (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  const p = await png(og.shareImage({ lang: 'en', title: 'Zusammenarbeit', text: 'Größe, Äpfel, Übung, Straße.' }));
  assert.equal(p.width, 1200);
  assert.equal(warn.mock.callCount(), 0);
});

test('a page image: 1200 × 630, the title on the wine field, the text on the mist, no network', async () => {
  const res = og.shareImage({ lang: 'en', title: 'Work with me', text: 'A small, fast website for your business, written in your words. Packages from 1,500 ₾.' });
  assert.equal(res.headers.get('content-type'), 'image/png');
  const p = await png(res);
  assert.deepEqual([p.width, p.height], [og.ogSize.width, og.ogSize.height]);
  assert.ok(share(p, C.saperavi, { x: 0, y: 0, w: 60, h: 40 }) > 0.99, 'the wine field');
  assert.ok(share(p, C.foam, { x: 72, y: 230, w: 1056, h: 154 }) > 0.15, 'the title stands on the horizon');
  assert.ok(share(p, C.ink, { x: 72, y: 410, w: 1056, h: 110 }, 60) > 0.01, 'the text under it');
  assert.deepEqual(fetched, []);
});

test('a Georgian page image: the title in Noto Sans Georgian, its descenders crossing the edge', async () => {
  const p = await png(og.shareImage({ lang: 'ka', title: 'ვებგვერდი შენთვის', text: 'პატარა, სწრაფი ვებგვერდი შენი ბიზნესისთვის, შენი სიტყვებით.' }));
  assert.ok(share(p, C.foam, { x: 72, y: 230, w: 1056, h: 126 }) > 0.1, 'the title');
  assert.ok(share(p, C.saperavi, { x: 72, y: 356, w: 1056, h: 40 }) > 0.05, 'descenders below the horizon, in wine');
  assert.ok(share(p, C.ink, { x: 72, y: 410, w: 1056, h: 110 }, 60) > 0.01, 'the text');
  assert.deepEqual(fetched, []);
});

for (const [name, lang] of [[slug, 'en'], [slug, 'ka'], ['menu-cards', 'en'], ['menu-cards', 'ka']] as const) {
  test(`the project image (${name}, ${lang}): title, summary, command, facts and address all drawn, no network`, async () => {
    const parts = skillParts(await png(projectOgImage(getProject(name)!, lang)));
    assert.ok(parts.title > 0.08, `title ${parts.title}`);
    assert.ok(parts.summary > 0.008, `summary ${parts.summary}`);
    assert.ok(parts.command > 0.02, `command ${parts.command}`);
    assert.ok(parts.meta > 0.01, `facts ${parts.meta}`);
    assert.ok(parts.address > 0.01, `address ${parts.address}`);
    assert.deepEqual(fetched, []);
  });
}

test('the pixel checks see a missing part: an image with empty strings has none of them', async () => {
  const parts = skillParts(await png(og.projectShareImage({ lang: 'en', title: '', summary: '', command: '', meta: [], address: '' })));
  assert.deepEqual(parts, { title: 0, summary: 0, command: 0, meta: 0, address: 0 });
});

test('the same input draws the same bytes', async () => {
  const skill = getProject(slug)!;
  assert.ok((await bytes(projectOgImage(skill, 'en'))).equals(await bytes(projectOgImage(skill, 'en'))));
  const page = () => og.shareImage({ lang: 'ka', title: 'ბლოგი', text: 'ტექსტი.' });
  assert.ok((await bytes(page())).equals(await bytes(page())));
});

test('a long title takes two lines and keeps every word; a long command shrinks to fit its box', async () => {
  const title = 'The /customs-declaration-cross-checker Skill';
  const p = await png(og.projectShareImage({
    lang: 'en', title, summary: 'One sentence.', command: 'npx skills@latest add example-owner/customs-declaration-cross-checker-extended',
    meta: ['Trade documents'], address: 'example.com/projects/x',
  }));
  // The second line ("Skill") is drawn below the first.
  assert.ok(share(p, C.foam, { x: 72, y: 200, w: 300, h: 50 }) > 0.05, 'the second title line');
  // Nothing of the command is drawn past the box's inner edge.
  assert.equal(share(p, C.foam, { x: 1094, y: 420, w: 30, h: 60 }, 60), 0);
  assert.ok(share(p, C.foam, { x: 100, y: 420, w: 990, h: 60 }, 60) > 0.02, "the command is drawn");
});

test('a character no committed font has is left out with a warning, instead of a network fetch', async (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  const p = await png(og.shareImage({ lang: 'en', title: 'Skills ☃', text: 'Привет' }));
  assert.equal(p.width, 1200);
  const messages = warn.mock.calls.map((c) => String(c.arguments[0]));
  assert.ok(messages.some((m) => m.includes('U+2603') && m.includes('Skills ☃')), messages.join('\n'));
  assert.ok(messages.some((m) => m.includes('U+041F')), 'Cyrillic in the text');
  assert.deepEqual(fetched, []);
});

test('commands are drawn in IBM Plex Mono, which also has Cyrillic: no warning for them', async (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  await bytes(og.projectShareImage({ lang: 'en', title: 'T', summary: 'S', command: 'npx skills@latest add example/привет', meta: [], address: 'x' }));
  assert.equal(warn.mock.callCount(), 0);
});

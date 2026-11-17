// The 404's "Did you mean …?" (lib/suggest.ts): the edit distance, the pick, and the inline script
// the page actually ships, run in a VM against a stand-in DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { editDistance, normalizePath, suggestPath, guessScript } from '../lib/suggest';

// The demo's routes as the Georgian 404 passes them: its own language first.
const ka = ['/ka', '/ka/projects', '/ka/work', '/ka/about', '/ka/blog', '/ka/projects/menu-cards'];
const en = ['/', '/projects', '/work', '/about', '/blog', '/projects/menu-cards'];

test('edit distance counts insertions, deletions and substitutions', () => {
  assert.equal(editDistance('', ''), 0);
  assert.equal(editDistance('abc', 'abc'), 0);
  assert.equal(editDistance('', 'abc'), 3);
  assert.equal(editDistance('abc', ''), 3);
  assert.equal(editDistance('kitten', 'sitting'), 3);
  assert.equal(editDistance('/skils', '/skills'), 1);
  assert.equal(editDistance('/wrok', '/work'), 2, 'a swap is two edits');
  assert.equal(editDistance('/ka/ბლოგი', '/ka/ბლოგ'), 1, 'Georgian letters count one each');
  for (const [a, b] of [['/about', '/abuot'], ['menu-cards', 'menu-crads']]) assert.equal(editDistance(a, b), editDistance(b, a));
});

test('compares the address as a route: decoded, lower case, no trailing slash or .md', () => {
  assert.equal(normalizePath('/Projects/Menu-Cards/'), '/projects/menu-cards');
  assert.equal(normalizePath('/projects/menu-cards.md'), '/projects/menu-cards');
  assert.equal(normalizePath('/ka/%E1%83%91%E1%83%9A%E1%83%9D%E1%83%92%E1%83%98'), '/ka/ბლოგი');
  assert.equal(normalizePath('///'), '/');
  assert.equal(normalizePath('/bad/%E0%A4%A'), '/bad/%e0%a4%a', 'a malformed escape is compared as typed, not thrown');
});

test('suggests the route with the same last segment, wherever it lives', () => {
  assert.equal(suggestPath('/menu-cards', [...en, ...ka]), '/projects/menu-cards');
  assert.equal(suggestPath('/ka/menu-cards', [...ka, ...en]), '/ka/projects/menu-cards', 'the page’s own language wins the tie');
  assert.equal(suggestPath('/x/blog', [...ka, ...en]), '/ka/blog', 'the Georgian 404 suggests the Georgian blog');
  assert.equal(suggestPath('/x/blog', [...en, ...ka]), '/blog', 'the main 404 suggests the main one');
});

test('suggests a near route for a typo', () => {
  assert.equal(suggestPath('/projcts', en), '/projects');
  assert.equal(suggestPath('/wrok', en), '/work');
  assert.equal(suggestPath('/ka/projets/menu-card', [...ka, ...en]), '/ka/projects/menu-cards');
  assert.equal(suggestPath('/Projects/Menu-Crds/', en), '/projects/menu-cards');
  assert.equal(suggestPath('/projects/menu-crds.md', en), '/projects/menu-cards');
});

test('suggests nothing when no route is close, or the address is already a route', () => {
  assert.equal(suggestPath('/completely-unrelated-address', [...en, ...ka]), null);
  assert.equal(suggestPath('/xyz', en), null, 'the nearest, /, is 3 edits away: too far for a short route');
  assert.equal(suggestPath('/work', en), null);
  assert.equal(suggestPath('/work/', en), null);
  assert.equal(suggestPath('/anything', []), null);
});

test('a long route allows more edits (a quarter of its length), a short one at most 2', () => {
  // '/projects/menu-cards' has 20 characters: up to 5 edits.
  assert.equal(suggestPath('/prjts/mnu-crds', en), '/projects/menu-cards');
  assert.equal(suggestPath('/prjts/mn-crds', en), null, '6 edits');
});

/** A stand-in for the bits of the DOM the script touches. */
function fakeDom(pathname: string) {
  const make = (tag: string) => ({ tag, hidden: true, href: '', textContent: '', children: [] as unknown[], replaceChildren(...nodes: unknown[]) { this.children = nodes; } });
  type El = ReturnType<typeof make>;
  const dom = {
    current: make('p') as El | null,
    observer: null as null | (() => void),
    disconnected: false,
    timeout: 0,
  };
  const context = {
    location: { pathname },
    document: {
      documentElement: {},
      getElementById: (id: string) => (id === 'nf-guess' ? dom.current : null),
      createElement: make,
    },
    MutationObserver: class {
      constructor(fn: () => void) { dom.observer = fn; }
      observe() {}
      disconnect() { dom.disconnected = true; }
    },
    setTimeout: (fn: () => void, ms: number) => { dom.timeout = ms; fn(); },
    decodeURIComponent,
  };
  return { dom, context, make };
}

/** What the line reads, as text, and where its link points. */
const line = (el: { children: unknown[] }) => {
  const link = el.children.find((c): c is { href: string; textContent: string } => typeof c === 'object');
  return { text: el.children.map((c) => (typeof c === 'string' ? c : (c as { textContent: string }).textContent)).join(''), href: link?.href };
};

test('the inline script fills the line with a link and shows it', () => {
  const script = guessScript([...ka, ...en], 'იქნებ ამ გვერდს ეძებ:', '');
  const { dom, context } = fakeDom('/ka/projets/menu-card');
  const el = dom.current!;
  runInNewContext(script, context);
  assert.equal(el.hidden, false);
  assert.deepEqual(line(el), { text: 'იქნებ ამ გვერდს ეძებ: /ka/projects/menu-cards', href: '/ka/projects/menu-cards' });
  assert.equal(dom.timeout, 10000, 'the observer stops after ten seconds');
  assert.ok(dom.disconnected);
});

test('the inline script fills a new line again after React redraws the 404', () => {
  const script = guessScript(en, 'Did you mean', '?');
  const { dom, context, make } = fakeDom('/abuot');
  // Keep the observer running: the redraw happens before the ten seconds are up.
  context.setTimeout = () => {};
  runInNewContext(script, context);
  assert.deepEqual(line(dom.current!), { text: 'Did you mean /about?', href: '/about' });
  const redrawn = make('p');
  dom.current = redrawn;
  dom.observer!();
  assert.equal(redrawn.hidden, false);
  assert.deepEqual(line(redrawn), { text: 'Did you mean /about?', href: '/about' });
});

test('the inline script leaves the line hidden when there is nothing to suggest', () => {
  const { dom, context } = fakeDom('/completely-unrelated-address');
  runInNewContext(guessScript(en, 'Did you mean', '?'), context);
  assert.equal(dom.current!.hidden, true);
  assert.deepEqual(dom.current!.children, []);
  assert.equal(dom.observer, null, 'no observer is left running');
});

test('the inline script cannot close its own <script> element', () => {
  const script = guessScript(['/</script><script>alert(1)</script>'], '</script>', '');
  assert.doesNotMatch(script, /<\/script/i);
  assert.doesNotThrow(() => new Function(script));
});

// The 404's "Did you mean …?": the nearest real address for a mistyped one. Both 404s are static
// pages, so the guess is made in the browser, from the address the reader actually typed.

/**
 * Everything the guess needs, in one function that uses no imports and no outer names, so the same
 * code runs in the tests and, sent as source (`guessScript`), in the browser.
 */
function makeSuggest() {
  /** Levenshtein distance: the fewest single-character insertions, deletions and substitutions. */
  function editDistance(a: string, b: string): number {
    const row: number[] = [];
    for (let j = 0; j <= b.length; j++) row[j] = j;
    for (let i = 1; i <= a.length; i++) {
      let diagonal = row[0];
      row[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const above = row[j];
        row[j] = Math.min(above + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
        diagonal = above;
      }
    }
    return row[b.length];
  }

  /** The address as typed, compared as a route: decoded, lower case, no trailing slash, no `.md`. */
  function normalizePath(pathname: string): string {
    let path = pathname;
    try {
      path = decodeURIComponent(pathname);
    } catch {
      // A malformed %-escape: compare the address as it is.
    }
    return path.toLowerCase().replace(/\/+$/, '').replace(/\.md$/, '') || '/';
  }

  /**
   * The route to suggest, or null. A route with the same last segment wins outright (/menu-cards →
   * /projects/menu-cards); otherwise the nearest by edit distance, if it is close enough: at most 2
   * edits, or a quarter of the route's length for long ones. Earlier routes win ties, so pass the
   * page's own language first.
   */
  function suggestPath(pathname: string, routes: readonly string[]): string | null {
    const path = normalizePath(pathname);
    const last = path.split('/').pop();
    let best: string | null = null;
    let bestDistance = Infinity;
    for (const route of routes) {
      const distance = last && route.split('/').pop() === last ? 0 : editDistance(path, route);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = route;
      }
    }
    if (best === null || best === path || bestDistance > Math.max(2, Math.floor(best.length / 4))) return null;
    return best;
  }

  return { editDistance, normalizePath, suggestPath };
}

export const { editDistance, normalizePath, suggestPath } = makeSuggest();

/**
 * The inline script that fills `#nf-guess` with "<before> <a>route</a><after>". Without JavaScript
 * the page still lists every section. The Georgian 404 is drawn twice (the prebuilt HTML, then
 * React's own not-found render, see app/(ka)/ka/404/layout.tsx), and a script React inserts never
 * runs, so the line is filled again whenever a new #nf-guess appears, for the first ten seconds.
 */
export function guessScript(routes: readonly string[], before: string, after: string): string {
  // JSON in a <script>: `<` is escaped so no value can close the element.
  const json = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');
  return `(function(){
var best=(${makeSuggest.toString()})().suggestPath(location.pathname,${json(routes)});
if(!best)return;
var done=null;
function fill(){var el=document.getElementById('nf-guess');if(!el||el===done)return;done=el;
var a=document.createElement('a');a.href=best;a.textContent=best;
el.replaceChildren(${json(before)}+' ',a,${json(after)});el.hidden=false;}
fill();
var o=new MutationObserver(fill);o.observe(document.documentElement,{childList:true,subtree:true});setTimeout(function(){o.disconnect();},10000);
})();`;
}

// `pnpm check`: reads and checks content/ the way the build does, without building. Prints what the
// site holds, every [[placeholder]] still waiting for a fact and what the masthead promises a name
// outside 6 to 30 characters; exits 1 with one line per problem.
import { ContentError, getContent, placeholders, SECTIONS } from '../lib/content';
import { routes } from '../lib/routes';
import { nameFitOf, nameNotes } from '../lib/fit';

try {
  const c = getContent();
  const pages = routes();
  console.log(`content: ${c.site.domain}, ${c.languages.join(' + ')} (main: ${c.primary})`);
  console.log(`sections on: ${SECTIONS.filter((s) => c.sections[s]).join(', ') || 'none'}`);
  for (const lang of c.languages) console.log(`  ${lang}: ${pages.filter((r) => r.lang === lang).map((r) => r.path).join('  ')}`);
  const left = placeholders(c);
  console.log(left.length ? `${left.length} placeholder(s) to fill:` : 'no placeholders left');
  for (const p of left) console.log(`  ${p.file}: ${p.text}`);
  // The masthead runs from margin to margin for a name of 6 to 30 characters (lib/fit.ts): what it
  // promises any other, and any letter the fonts do not have.
  for (const lang of c.languages) {
    const { name } = c.lang[lang].site;
    const file = `content/${lang}/site.json`;
    for (const note of nameNotes(name, file)) console.log(`note: ${note}`);
    const missing = nameFitOf(name, c.lang[lang].script).missing;
    if (missing.length) console.log(`note: ${file}: "name" has ${missing.map((ch) => `"${ch}"`).join(', ')}, which the site's fonts do not have: the browser draws it in another font, and the masthead may stop short of the margin`);
  }
} catch (err) {
  if (!(err instanceof ContentError)) throw err;
  console.error(err.message);
  process.exit(1);
}

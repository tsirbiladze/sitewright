# Page text

Every word of the site is in `content/`, as JSON and Markdown: no component holds a sentence of the owner's. `README.md`, "The content model", lists every file and field; these hold what is asked for most:

| Text | Where |
|---|---|
| The name (the masthead sets it from margin to margin whatever its length; a no-break space keeps two words on one line), job title, the site's description, the contact button | `content/<lang>/site.json` |
| The paragraph under the name on the home | `content/<lang>/home.json` |
| The domain, email, profile links, photo, the footer's year, the colours | `content/site.json` |
| The projects section's name and texts | `content/<lang>/projects.json` |
| The offer: price, package, steps, the email it ends with | `content/<lang>/work.json` |
| About and the CV: facts, roles, stack, the PDF's address | `content/<lang>/about.json`; the PDF itself in `public/` |
| The blog's name and texts | `content/<lang>/blog.json` |
| Navigation, labels, the 404 | `content/ui/<lang>.json`: a language's interface words, the same for every person. Change them only to correct the language |

A page's title and description for search and sharing are its file's `title` and `description`.

- **Each language says the same thing.** A text that exists in two languages changes in both, each written as its own language and not as a translation of the other.
- **A `[[placeholder]]` is a fact the owner has not given.** Replace one only with the fact they give you, written in the page's language. A new fact they have not given gets a placeholder of its own. The photo is `"photo": null` until there is one; then the file goes in `public/` and `photo` holds its `src`, `width` and `height`.
- **Tokens stay as written**: `{price}` in `content/<lang>/work.json`, `{count}` and `{n}` in counts. `pnpm check` names a token a text cannot fill.
- **The tests do not hold any sentence.** They run on a copy of the demo in `tests/fixtures/site/`, never on `content/`; what they check on `content/` holds for any text (every page renders, one call to action a page, every internal link leads somewhere). A test that fails after a text change is a real failure: its message names the page.
- **The colours** are `colours` in `content/site.json`: a preset's name (`README.md`, "Colours", shows each) or the owner's own pair `{ "field": "#rrggbb", "accent": "#rrggbb" }`. `pnpm check` refuses a pair that leaves any text on the site under WCAG AA, in one line naming where; offer the owner a preset, or a darker field or accent, rather than choosing for them.
- **Length moves the layout.** After a change to a heading, a button or the name, check every page at phone and desktop widths: `pnpm build`, `pnpm start -p 4317`, then `pnpm qa --strict` in another shell (`scripts/qa.mjs` says what it checks).

Done when the changed text reads right in the build, in every language the page has, and `pnpm check` and `pnpm test` pass.

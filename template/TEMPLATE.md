# The template as shipped

This folder is the site template of sitewright. `README.md` is written for the owner of a site made
from it; this file says what is true only of the template itself. sitewright's scaffold deletes it when
it makes a person's site, and nothing else in the folder needs to change for that.

## The demo person

The content the template ships with belongs to **Elisabed Shabloni (ელისაბედ შაბლონი), a fictional
person**: every fact, address (`example.com`, `example.org`), project, employer, price and document on
the demo site is invented. Their `content/` and `public/` are the same, file for file, as the demo the
tests run on, `tests/fixtures/site/` (`tests/demo.test.ts` keeps them so while the main language's
`name` is the demo person's; a change to the demo is made in both places).

Only `content/`, `public/`, `tests/` and this file name the demo person (`tests/readme.test.ts`), so a
site whose content is a person's own carries no trace of them outside its tests.

## Where it is tested

The template is proven in every shape a site can take (`scripts/lib/shapes.mjs`): English and Georgian
(the demo as it ships), English only, English and German, and each of the four sections off in turn,
always on the demo. `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm shapes` and `pnpm qa --strict`
pass on it as it ships, in Node 24 with Chromium 156 on Linux. `pnpm qa --strict` was also run once on a
build of each other colour preset (ink, pine, sea, walnut, slate) on 2026-11-17, and passed.

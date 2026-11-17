# Sections and languages

Both are switches in `content/site.json`. `next.config.ts` reads them when it starts: restart `pnpm dev` after changing either.

## A section switched on or off

`sections` holds `projects`, `work`, `about` and `blog`, each `true` or `false`. A section's address is fixed (`/projects`, `/work`, `/about`, `/blog`); its name comes from its file's `title`.

- **Off**: its pages, its navigation entry, its sitemap entries, its share images and its lines in `/llms.txt` are gone, and a link to it in a text keeps its words and loses the link. Its files may stay in `content/`. With Work off, the call to action of every page becomes an email (`contact` in `content/<lang>/site.json`).
- **On**: the main language needs the section's file, `content/<lang>/<section>.json`, with every field `README.md` lists for it (the blog also its folder of posts, the projects their files). The second language may leave a section out: that page then exists in the main language only. Every fact the new section states and the owner has not given is a `[[placeholder]]`.

## A language added

At most two: the main one, at `/`, and one more, under `/<code>/`. Follow `README.md`, "Adding a language". What it does not say:

- **Scripts**: Latin-script languages and Georgian. A language written in another script cannot be added: tell the owner.
- **Each text is written as its own language**, not as a translation of the other: the same facts, in that language's own words. A fact the owner gave in one language is theirs in both; a sentence you would have to invent is a `[[placeholder]]`.

## A language removed, or the main one changed

- **Removed**: take its code out of `languages`, delete `content/<code>/`, and remove its words from every install tab and per-language link label (`pnpm check` names each one).
- **The main one changed**: put its code first in `languages`; it must then have every section that is on. Every address changes (`/<code>/work` becomes `/work`, and the other way): tell the owner before, since links shared earlier stop working.

Done when `pnpm check` reports no problem and lists the pages each language should have, and `pnpm test` passes.

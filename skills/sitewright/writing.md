# Writing the site

After the scaffold, the site's pages stand with a `[[placeholder]]` wherever the owner's words belong. This page is how those become text. Which file holds which text is in the site's own `README.md`, "The content model"; `pnpm check` lists every placeholder left, and `pnpm dev` shows each one as a dashed box on its page.

## One section at a time

Go in the order a visitor meets them: the home's paragraph, then each section that is on.

1. **Get the owner's own words.** Ask them to tell it as they would to a person: what they do and for whom, what a project was and what came of it, what they offer and what it costs. A CV, a profile or an old site they hand you is a source too: take the facts from it and ask about what it leaves out.
2. **Write it short**, from what they said, keeping their phrases where they gave them.
3. **Show it and let them correct it.** The text is finished when the owner says it is theirs.

Then the next section. A draft of the whole site at once gets a nod instead of a reading.

The words the scaffold wrote are the owner's too. A section's name, its headings and its buttons ("Work with me", "What you get", "Skills") are defaults for someone who works for clients: fit them to what this owner does. A teacher's page is about classes, a musician's about concerts.

## The voice

The owner speaks: first person, to the reader as "you", in plain words. One paragraph says one thing. A site reads as a person's when it says what they made, for whom, and what happened; adjectives about themselves do the opposite.

## Two languages

Each language is written as a text of its own, by its own habits, not word for word from the other. The facts, the numbers, the order of the sections and the links are the same in both, and each links to the site's pages in its own language. A proper name is written as that language writes it.

If you cannot write one of the languages well enough for a native reader, say so, write your best, and ask the owner to read that one closely.

A language other than English and Georgian also has its interface words to translate, in `content/ui/<code>.json`: the menu, labels, the 404 page, the link that leads to this language from the other one. Translate every string in the file, those of sections that are off too: they are what the site says the day a section is switched on. The owner reads them as well.

## What the owner has not given

It stays a `[[placeholder]]` that names what is missing. Before the site goes live, read the owner the list from `pnpm check` and ask of each: now, or left open? An open one is a dashed box that visitors see too, so say that. A section with nothing to say yet is better switched off (`content/site.json`, `sections`) than left full of boxes: offer that.

A price, a client's name, a date, a number: ask, even when a guess seems safe.

## Files

A photo, the CV as a PDF and a project's pictures go into `public/`, and the content names them (the README says where). Ask for the photo and the CV once. Without a photo the site shows a slot for one; without a CV file the About page has no CV link.

## Before the owner reads it

- `pnpm check` and `pnpm test` pass.
- `pnpm build`, then `pnpm start -p 4317`: open every page in each language yourself first, at a phone's width and a desktop's. A long heading or button label can push a line out of its box; shorten the text or ask the owner for another wording. A build that stops with Next's `SecurityFatalError` notice about an upgrade passes when it is run again; upgrades are for after the hand-over.
- Where the machine has Chrome, Chromium, Edge or Brave, `pnpm qa --strict` checks the site on port 4317 for the same and more (the README, "Tests and QA").

Then give the owner the address `pnpm start` printed, and the list of pages to read.

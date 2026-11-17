# This site

A person's own site: a static Next.js site whose every word is in `content/`. The person is its **owner**: their name is `name` in `content/<lang>/site.json`, where `<lang>` is the main language, the first of `languages` in `content/site.json`. `README.md` describes the content model and holds the rules the content follows (one language a page, one call to action, a `[[placeholder]]` for a missing fact, pinned dependencies): they bind every change. `package.json` has the commands.

## Working with the owner

Write to the owner in the language they write to you in, in a few short sentences. A decision that is theirs is asked with ready answers, the recommended one first.

## Rules of the work

- **What the public sees is the owner's.** Work ends at a Vercel preview, made with `pnpm preview`. Taking the site live (`pnpm go-live`) and putting a domain on it (`pnpm domain`) wait for the owner's yes in the current conversation; each such command is then written with `SITE_GO_LIVE=<domain>` in front, where `<domain>` is `domain` in `content/site.json`. That mark is the owner's yes: the two commands refuse to run without it, and in Claude Code `scripts/no-production.mjs` refuses them one step earlier. DNS records are entered by the owner, at their registrar. The Vercel project stays unconnected to GitHub.
- **A push waits for the owner's yes** too. Commit locally as you go.
- **Every fact is the owner's or the repo's.** A client, a testimonial, a number, a price, an employer or a date they have not given is written as a visible `[[placeholder]]`. What you remember from another session is neither, until they confirm it.
- **Secrets stay out** of files, commits and messages.

## Changing what the site says

A blog post, a project, page text, the CV, a section switched on or off, a language added, a preview, or taking the site live: follow the `site` skill in `.agents/skills/site/SKILL.md`.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

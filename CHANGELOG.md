# Changelog

## 1.0.0 — 2026-11-17

First release.

- The skill: seven steps from the first question to a live site, with a condition that says when each is done. The GitHub repository, going live and the domain each wait for the owner's yes.
- `scaffold.mjs` makes a site's folder from a person's answers: languages, sections, name, colours, projects, domain. Every fact not given becomes a visible `[[placeholder]]`; nothing is invented. It refuses a wrong answers file in one line that names the field.
- The site template: a static Next.js site whose every word is in `content/`, in one or two languages (Latin-script languages and Georgian), with projects, a work page, an About page with a CV, and a blog as switches.
- The owner's name is fitted from margin to margin at build time, for a name of 6 to 30 characters, at every width from 320 to 1280 px.
- Six palettes, or two colours of the owner's own, refused with the place and the contrast ratio when text on them would fall under WCAG AA.
- `pnpm preview`, `pnpm go-live` and `pnpm domain`: each proves its result before it says so. Going live and the domain run only with the owner's mark, and a new project's first public deployment is always a deliberate go-live.
- Every site carries its own instructions for agents (`AGENTS.md`, a `site` skill), so later changes go through a branch and a preview.

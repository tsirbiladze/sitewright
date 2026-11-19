# sitewright: specification

The name is `sitewright`: the repository `tsirbiladze/sitewright` and the command `/sitewright`. The owner chose it on 2026-11-17.

## What it is

An agent skill that gives a person their own site, like https://tsirbiladze.com: the person runs the skill in their coding agent, answers a few questions, and the agent builds the site from this repository's template, fills it with the person's own content, and takes it live on Vercel under the person's domain. Every site it makes carries its own instructions, so the person keeps changing it by talking to an agent.

Open source (MIT). The skill and the template live in this one repository and share one version.

## Who runs it, and what they need

A person who works with a coding agent (Claude Code, Codex, Cursor and the others that read the open Agent Skills format). They need Node.js 24, pnpm, git, the GitHub CLI signed in, a Vercel account with the CLI signed in, and, for a domain of their own, access to its DNS at any registrar.

## What the person gets

A static Next.js site (App Router) with the design of tsirbiladze.com ("Saperavi": a field of one deep colour with the name standing on its edge, one call to action a page):

| Section | What it holds | Can be left out |
|---|---|---|
| Home | the name from margin to margin, a lede, the newest projects, the call to action | no |
| Projects | a list and a page per project. A project is either an agent skill whose page text is fetched from its own repository (as tsirbiladze.com does) or a plain project written in the site | yes |
| Work | what the person offers, a price, how it goes, a call to action by email | yes |
| About | who they are and a CV: roles, stack, languages, links, a PDF | yes |
| Blog | posts in Markdown, a feed | yes |

Also: one or two languages; share images; `sitemap.xml`, `robots.txt`; the agent formats (`llms.txt`, Markdown twins); 404 pages with "Did you mean"; security headers; accessibility and layout checks.

What changes from person to person: the name, every text, the languages, which sections exist, the projects, and the colours (a tested preset, or a colour of their own that passes the contrast check). The layout and typography stay.

## Limits of version 1

- Hosting: Vercel only.
- Scripts: Latin-script languages and Georgian. No right-to-left languages.
- One person per site, not a company site with several authors.
- DNS: the skill shows the exact records and checks them; the person enters them at their registrar.

## Repository layout

```
skills/sitewright/      the skill as people install it: SKILL.md, references, scripts
template/               the site template: a complete project that builds and passes its own checks as it is
docs/sitewright.md      page text for tsirbiladze.com (English), docs/sitewright.ka.md (Georgian)
tests/                  tests of the skill's scripts, and of a site scaffolded from the template
CHANGELOG.md  README.md  AGENTS.md  LICENSE  SPEC.md
```

tsirbiladze.com shows a skill from `docs/<slug>.md`, `docs/<slug>.ka.md`, `skills/<slug>/SKILL.md` and `CHANGELOG.md` at a release tag, so those paths are fixed.

What that site reads from each, so the release has to provide it:

| File | What the site takes |
|---|---|
| `skills/sitewright/SKILL.md` | frontmatter `license` and `metadata.version` (the version the page shows; it is also the one place the skill's own scripts read their version from), `metadata.homepage` (`https://tsirbiladze.com/skills/sitewright`) |
| `docs/sitewright.md`, `docs/sitewright.ka.md` | frontmatter `title`, `summary`, `category`, `status` (`stable`, `beta` or `experimental`), `source` (the link to `SKILL.md`); the body is the page, its sections starting at `##`, the first one "What it does". Pictures are linked by their raw GitHub address and the site hosts copies |
| `CHANGELOG.md` | one `## <version> — <YYYY-MM-DD>` entry per release, newest first; the page shows them and takes the "updated" date from the entry of the current version |

The install box and the small picture beside the skill's name are drawn by the site (`lib/skills.ts`, `lib/specimens.ts` there), not written in the docs.

## The template

Source: the owner's own site, https://tsirbiladze.com. The template is that site with the person taken out and put into data.

1. **Content is data.** No sentence of the person's lives in a component. Everything a person can change is in `content/`: plain JSON and Markdown that an agent can edit without touching TSX, and that a test validates (a missing field, an unknown section, a second language without its texts: each fails with a message that names the file and the field).
2. **Languages come from the content.** One primary language at `/`, and at most one second language under `/<code>/`. A page exists in a language when that language has its text; the primary language has every section that is on. Interface words (navigation, labels, the 404) are a file per language: English and Georgian ship with the template, and a new language is one more file. A blog post written in both languages has the same file name in both, and its two pages link to each other.
3. **Sections are switches.** With a section off, its pages, its navigation entry, its sitemap entries, its share image and its lines in the agent formats are all gone, and nothing links to them. A section's address is fixed (`/projects`, `/work`, `/about`, `/blog`); its name comes from the content.
4. **The name fits any name.** The masthead runs from margin to margin for a name of 6 to 30 characters, in Latin and in Georgian, at every width from 320 to 1280 px, with no horizontal overflow. tsirbiladze.com sizes it with ratios found by hand for one name; the template has to compute them.
5. **Colours are tokens.** A small set of presets (the original wine among them), and a custom colour pair that the build refuses with a clear message when text on it falls under WCAG AA.
6. **A fact the person has not given is a visible placeholder**, `[[what is missing]]`, drawn as the dashed box of tsirbiladze.com. The demo content the template ships with is fictional and says so.
7. **The site is ready for agents.** It ships `AGENTS.md`, `CLAUDE.md` importing it, the `site` skill under `.agents/skills/site/` linked from `.claude/skills/`, and the Claude Code hook that refuses production commands without the owner's mark. All of them read the owner's name, language and domain from the content, not from the text of tsirbiladze.com.
8. **Three commands carry the dangerous steps**, each tested with stand-ins for pnpm and the Vercel CLI, each proving its result:
   - `pnpm preview`: checks, build, a Vercel preview, proof that its target is preview (exists in the source site).
   - `pnpm go-live`: the same checks, a production deployment, proof that its target is production, then the pages answer on the production address.
   - `pnpm domain`: adds the site's domain and its `www` name to the Vercel project, makes `www` redirect to the bare domain, prints the DNS records Vercel recommends as a table, and with `--check` says whether DNS and the certificate are in place.
9. **A person's site passes its own tests.** The unit tests run on a copy of the demo kept in `tests/fixtures/`, never on the live `content/`, so `pnpm test` stays green after every sentence of the content has changed. What is checked on the live content is what must hold for any person: it is valid, every page renders, a page has one call to action, every internal link leads somewhere.
10. **It keeps the source site's standards.** Dependencies pinned to exact versions published at least 14 days ago, with `minimumReleaseAge` in `pnpm-workspace.yaml` and no exclusions; the unit tests, `pnpm typecheck`, `pnpm build` and `pnpm qa --strict` all pass on the demo content; no real person's data anywhere.

## The skill

Steps, each with a condition that says it is done. The person's word is needed where marked.

1. **Ask.** The name, what they do, the languages, the sections, the projects, the colours, the domain if any. Ask in the person's language, few questions at a time, with ready answers. Done when every field of the answers file has been asked about; what the person did not answer becomes a placeholder.
2. **Scaffold.** A script copies the template at the skill's own version into a new folder and writes the content from the answers. Done when `pnpm check`, `pnpm typecheck` and `pnpm test` pass there.
3. **Write.** The texts, in each language, from what the person said. Nothing invented: a missing fact is a placeholder. Done when the person has read the site on their own machine and has nothing left to change.
4. **Repository.** A GitHub repository, private unless they ask otherwise. *Their yes.*
5. **Live.** The Vercel project and the first `pnpm go-live`. The first deployment of a new Vercel project can become its production, so there is no preview before it: the person reads the site on their own machine first, and the first public thing is a deliberate one. *Their yes.*
6. **Domain.** `pnpm domain`, the records shown as a table, the person enters them at the registrar, the skill checks until the domain answers over HTTPS. *Their yes*, and their hands for the DNS.
7. **Hand over.** What was made, where it is, and how to change it from now on (the site's own `site` skill, with a preview before every later change).

Rules of the skill: no secrets in files, commits or messages; nothing public without the person's yes; nothing invented about the person; stop and say so when a tool is missing or not signed in, with the one command that fixes it.

## Proof that it works

- The template's own checks pass on the demo content, in every supported shape: two languages, one language, a second language other than Georgian, each section off.
- A fresh agent, given only "make me a site" and a fictional person's answers, gets from an empty folder to a site taken live against stand-ins for GitHub and Vercel, in Claude Code and in Codex (`tests/rehearsal/`).
- One real run before the first release: a throwaway private GitHub repository and a throwaway Vercel project in the owner's accounts, with the fictional person's site, checked and then both deleted. The owner said yes to this on 2026-11-17; his domains are not touched.

## Release

The skill is published in its own public repository, `tsirbiladze/sitewright`, and as its own skill page on tsirbiladze.com. A release is the owner's step: no agent working here publishes anything on its own. The skill's version is `metadata.version` in `skills/sitewright/SKILL.md`; the tag `v<version>` is what the scaffold fetches the template from, so the two are released together, with a `CHANGELOG.md` entry. The root `package.json` repeats the version (`tests/pages.test.mjs` holds it to `SKILL.md` and the changelog).

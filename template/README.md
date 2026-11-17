# This site

A personal site in the "Saperavi" design: a field of one deep colour with the owner's name standing on
its edge, one call to action a page. A static Next.js 16 site (App Router), pnpm, Node 24.

Everything that is the owner's is in `content/`, as JSON and Markdown: the name, every text, the
languages, which sections exist, the projects, the posts, the colours. No component holds a sentence of
the owner's: their name is `name` in `content/<lang>/site.json`, for each language of `languages` in
`content/site.json` (the first is the main one).

```bash
pnpm install
pnpm dev          # fetches agent skills' page text (if any), then next dev
pnpm build        # the same, then next build
pnpm start        # serves the build
pnpm check        # reads and checks content/ like the build does; lists the pages and every [[placeholder]]
pnpm typecheck    # next typegen, then tsc; no build needed
pnpm test         # unit tests (node --test): no network, no build
pnpm shapes       # builds the site in every shape (below) and checks what each build prerendered
pnpm qa --strict  # with the site running on port 4317: accessibility, overflow, keyboard, fonts, links…
pnpm fit          # with the site running: the name and the price drawn and measured at 320–1280 px
pnpm preview      # checks, builds, deploys a Vercel preview and proves it is one
pnpm go-live      # the same checks, a production deployment, and proof (needs the owner's mark)
pnpm domain       # puts the domain on the Vercel project, prints the DNS records (needs the mark)
pnpm domain --check  # changes nothing: DNS and HTTPS for each name
```

After changing the languages or the sections in `content/site.json`, restart `pnpm dev`: Next reads
them when it starts (`next.config.ts`).

## The content model

Two kinds of file: language-neutral facts at the top of `content/`, and texts in a folder per language,
`content/<lang>/`, with the same names. A section's page is `<section>.json`; its items are in a folder
of the same name (`blog.json` and `blog/`, `projects.json` and `projects/`).

| File | What it holds | Read by |
|---|---|---|
| `content/site.json` | `domain`; `languages` (the first is the main one, at `/`; an optional second lives under `/<code>/`); `sections` (`projects`, `work`, `about`, `blog`: `true` or `false`); `email`; `links` (profiles: `label`, `url`, optional `text`); `photo` (`null` until there is one); `year` (the footer's ©); `colours` (a preset's name or a pair, below; the wine when it is left out) | every page, `next.config.ts`, `scripts/fetch-skills.mjs` |
| `content/ui/<lang>.json` | Interface words of a language, the same for every site: the language's own name, the Open Graph locale, how dates are written and the months, reading speed, navigation labels, the project and install box labels, the 404, the words of `/llms.txt` | every page |
| `content/<lang>/site.json` | The owner in that language: `name` (the masthead sets it from margin to margin, below), `jobTitle`, `description` (the home's description, share image and `/llms.txt`), `contact` (the call to action when there is no Work page) | layouts, home, 404, agent formats |
| `content/<lang>/home.json` | `lede`: the paragraph under the name | `components/Home.tsx` |
| `content/<lang>/projects.json` | The projects section: its `title` (the section's name everywhere: navigation, page, home; "Skills", "Projects", "Work samples"…), `description`, `lede`, `intro`, `all`, `count` (plural forms), the headings over the calls to action | home, projects index and pages, 404, agent formats |
| `content/<lang>/work.json` | The offer: `title`, `description`, `lede`, `price` (with its currency, as the language writes it: `"1,500 ₾"`, `"1 500 ₾"`), `package`, `amount` (`"From {price}"`), `priceNote`, an optional `example` (a project with a picture and its caption), `get`, `how`, optional `who`, `contact` (the email's heading, text, button, subject and body), `teaser` (how other pages lead here; its button usually says `{price}`) | Work page, home, every page's call to action |
| `content/<lang>/about.json` | `title` (navigation; the page's heading is the name), `description`, `lede`, `facts` (label/value), `contact`, an optional `cv` (the PDF in `public/`; without it the page has no CV link), `sections` (the CV's parts, each with entries: `when`, optional `date`, `title`, optional `href`, `where`, `text`, optional `stack`), `stack`, `teaser` | About page, home |
| `content/<lang>/blog.json` | The blog: `title`, `description`, `lede`, `empty` (before the first post), the call-to-action headings, `teaser` | blog pages, feed, home |
| `content/<lang>/blog/<slug>.md` | A post: frontmatter `title`, `date` (YYYY-MM-DD), optional `summary`, `draft: true` to keep it out. `template.md` is a draft showing every part a post can have. Posts with the same slug in both languages are each other’s twin (hreflang, the language link) | `lib/blog.ts` |
| `content/projects/<slug>.json` | A project; the file name is its address. `"kind": "skill"`: an agent skill whose page text is fetched from GitHub (`repo`, `ref`, optional `install` tabs and `specimen`). `"kind": "plain"`: a project written here (`date`, YYYY-MM-DD or a `[[placeholder]]` until it is known, the project then listed last; optional `link`, optional `install` tabs and `image`) | `lib/content.ts`, `lib/projects.ts`, the fetch |
| `content/<lang>/projects/<slug>.md` | A plain project's text in that language: frontmatter `title`, `summary`, optional `category`, `status` (`stable`, `beta`, `experimental`), `imageAlt`, `imageCaption`. Text under the frontmatter makes a page; without it the project links to its `link` | `lib/content.ts`, `lib/projects.ts` |
| `public/` | Files the content points at: the CV PDF, project pictures (`public/projects/<slug>/…`), blog images, a photo | the pages |

Texts in JSON are plain strings. A few fill tokens: `{price}` in `work.json`, `{count}` and `{n}` in
counts, `{project}` in Work's example caption, and the interface files' own (`{d}`, `{month}`, `{y}`,
`{file}`, `{full}`…). A text with a token it cannot fill fails the check. Install tabs and a skill's
specimen caption hold their few words per language inside the project file (`{ "en": "…", "ka": "…" }`),
as does a profile link whose name is a word rather than a name.

**A fact the owner has not given** is written as `[[what is missing]]`, anywhere in a text or as a
link's address, and the page draws it as a dashed box; nothing links to it. While `email` is one, the
calls to action that would write an email show their words in the dashed box. A CV entry whose every
field is a placeholder is drawn as one dashed block. `"photo": null` draws the photo's slot. `pnpm check`
lists them all.

### The rules the content follows

- **A page exists in a language when that language has its file.** The main language must have every
  section that is on; the second may leave one out, and that page then exists in the main language only
  (its language link goes to the other home). A project appears in a language when it has text in it.
- **Sections are switches.** With a section off its pages, navigation entry, sitemap entries, share
  images, feed and lines in the agent formats are gone, and a link to it in a text keeps its words and
  loses the link. Its files may stay in `content/`.
- **Every problem fails the build and the tests with one line** naming the file and the field:
  `content/ka/work.json: "price" is missing (the price with its currency, …)`. A misspelt field names
  the field it was probably meant to be. A Latin-script language with Georgian letters, or any other
  script, fails too.
- One call to action a page; Georgian is never letter-spaced or uppercased.

### The name on the horizon

The masthead (the homes and About, in each language) sets the name from the left margin to the right one
at every width, and the Work page sets its amount (`amount` with `price` in it) the same way below
1000 px. Nothing is to be done for it: the build measures the name in the fonts the page draws it with
and sizes it to its column (`lib/fit.ts`), whatever the name.

- **A name of 6 to 30 characters**, Latin or Georgian, runs from margin to margin on its widest line,
  never past it. It takes one, two or three lines, breaking at a space or after a hyphen: the fewest
  lines at which it is still large (80 px in Latin, 64 px in Georgian), or else the most it can. A
  no-break space (U+00A0) between two words keeps them on one line.
- **Shorter** than 6 characters, it is drawn as large as a 6-character name would be, so it stops
  short of the right margin. **Longer** than 30, it still runs from margin to margin, only smaller.
  `pnpm check` says so for such a name, and names any letter the fonts do not have.
- **The amount** takes one line. Below 1000 px it runs from margin to margin; from 1000 px it stands at
  the right end of the field's edge, at most 60% of the column wide.
- **The share images** set the name as large as their field holds (`lib/og.tsx`).

How: `lib/type-metrics.ts` reads each glyph's advance and kerning from the WOFF2 files in
`assets/fonts/web/` (the files Google Fonts serves for `next/font`) at the axis values the masthead
uses; `lib/fit.ts` finds the widest line for one, two and three lines and puts five custom properties on
the page; `app/styles/home.css` turns them into a size with `min()` and `max()`, with no media query and
no script, so the page stays static and nothing moves. `pnpm fit` proves it in a browser: it draws the
site's own name and amount, and a set of fictional names and prices (`tests/fit-cases.mjs`), at
320, 360, 390, 414, 600, 768, 1024 and 1280 px, and measures each line against its column; `pnpm qa`
runs it too. `tests/fit.test.ts` checks the same without a browser, and that the widths it reads are the
ones Chromium 156 drew.

### Colours

`colours` in `content/site.json` is one of these presets, or a pair of the owner's own. The field is
the deep colour every page stands on; the accent fills the one call to action, the focus ring on the
light ground and selected text.

| Preset | Field | Accent |
|---|---|---|
| `"wine"` (the default) | `#470b2d` | `#d21d79` |
| `"ink"` | `#172554` | `#c2410c` |
| `"pine"` | `#123d2e` | `#c42b1c` |
| `"sea"` | `#0b3a4a` | `#a35a00` |
| `"walnut"` | `#3b2314` | `#0f766e` |
| `"slate"` | `#262b33` | `#6741d9` |

A pair is written `{ "field": "#1d3557", "accent": "#c1121f" }`. The rest of the palette comes from it
(`lib/colours.ts`): the field's deeper steps for the footer and the install box, the light text on the
field, a quieter one for labels, the pressed accent. The ground, the ink and the lines stay the same in
every palette. A pair is refused (by `pnpm check`, the build and the tests) when any text on the site
would fall under WCAG AA, 4.5:1 for text and 3:1 for large text and for what a control must show, in
one line that names the two colours, where they meet and the ratio:

```
content/site.json: "colours": the field #1d3557 and the accent #ffb703 fail WCAG AA: white (#ffffff, the design’s) on the accent #ffb703, in the call to action’s words, and selected text, is 1.75:1, under the 4.5:1 it needs (2 more places fall short too)
```

Everything coloured follows it: the pages (custom properties on `<html>`; `app/styles/base.css`
holds the wine as its defaults), the share images, the icons (`app/icon.tsx`, `app/apple-icon.tsx`),
the browser's theme colour, the placeholder's dashed box, selection and the focus rings. A colour
changes no layout. `tests/colours.test.ts` computes the contrast of every place two colours meet
(`MEETINGS` in `lib/colours.ts`) for every preset, and keeps the styles to the palette's tokens.

### Adding a language

1. Add its code to `languages` in `content/site.json` (at most two: the main one first).
2. Copy `content/ui/en.json` to `content/ui/<code>.json` and translate it (`tests/fixtures/ui-de.json`
   is a German one).
3. Create `content/<code>/` with at least `site.json` and `home.json`, and each section's file the
   language should have. Translate the plain projects' `.md` files into `content/<code>/projects/`.
4. Add the language's words to every install tab and per-language link label (`pnpm check` names each one).
5. `pnpm check`, then `pnpm test`.

Scripts: Latin-script languages and Georgian (`ka`). The fonts, line heights and the letter-spacing
follow the script (`lib/content.ts` `scriptOf`).

## How the site is put together

| What | Where |
|---|---|
| Reading and checking the content | `lib/content.ts` (the files' shapes, written once with `lib/schema.ts`, which also gives their types) |
| Every page in each language | `lib/routes.ts`: the sitemap, hreflang, the language link, the 404's suggestions and the tests all use it |
| Routes | The main language in `app/(primary)/`, the second in `app/(second)/[lang]/` (its pages come from `generateStaticParams`, so a page missing in that language is never built). A section's route handlers carry its name (`route.blog.ts`, `app/(primary)/about/share.png/route.about.tsx`, `app/projects.md/route.projects.ts`) and `next.config.ts` lists only the sections that are on in `pageExtensions`, so with a section off they do not exist. Pages stay `page.tsx` (Next finds a page's font preloads by its name less one extension): with a section off, its main-language page is a 404 and `next.config.ts` rewrites its address to the 404 before any page |
| Share images | `share.png/route*.tsx` beside each page draws it at build time with `lib/og.tsx` from the fonts in `assets/fonts` (no network); the page's metadata points at it (`lib/pages.ts`). Not `opengraph-image.tsx`: Turbopack does not take it with a section's name |
| The name's fit | `lib/fit.ts` and `lib/type-metrics.ts`, from `assets/fonts/web/` (above, "The name on the horizon") |
| Fonts | Each root layout imports `site-fonts/primary` or `site-fonts/second`; `next.config.ts` points them at `lib/fonts/latin.ts` or `lib/fonts/georgian.ts` by the language's script, so each layout preloads only what its pages draw first. Project pages get the reading face (`lib/fonts/reading.ts`) in a Latin-script language only |
| Projects | `lib/projects.ts`. An agent skill's text comes from its repo at `ref`: `scripts/fetch-skills.mjs` fetches `docs/<slug>.md` (English) or `docs/<slug>.<lang>.md` for each language, `skills/<slug>/SKILL.md`, `CHANGELOG.md` and `CHANGELOG.<lang>.md` into `.content/skills/` (git-ignored, cached in `.next/cache/skills/` for a build without GitHub), self-hosts the repo's images and cuts the specimen's crops. A site with no skill fetches nothing |
| Agent formats | `/llms.txt`, `/llms-full.txt`, `/projects.md` and a Markdown twin of every project page (`/projects/<slug>.md`), from `lib/agent-md.ts` |
| 404s | `app/global-not-found.tsx` in the main language; anything under `/<code>/` is rewritten to the second language's prebuilt 404. Both suggest the nearest address (`lib/suggest.ts`) |
| Security headers, CSP, rewrites | `next.config.ts` |

## Preview, live, domain

Three commands carry the steps that put the site in front of people, each with the pinned
`vercel@65.8.0` run through `npx -y`, and each proving its result before it says so. What they share is
in `scripts/lib/vercel.mjs`; each script's head comment says exactly what it runs.

| Command | What it does | Ends with |
|---|---|---|
| `pnpm preview` | `pnpm typecheck`, `pnpm test`, `pnpm build` (one more build after Next's one-time upgrade notice, `SecurityFatalError`), `vercel deploy --environment preview`, then `vercel inspect`: target `preview`, READY | `Preview ready: <address>` |
| `pnpm go-live` | the same checks and build, `vercel deploy --prod`, `vercel inspect`: target `production`, READY; then every page of the build's sitemap (`.next/server/app/sitemap.xml.body`) and `/sitemap.xml` asked of the production address Vercel names (`productionUrl`), 200 each, and production's sitemap the same as the build's | `Live: <address> (…)` |
| `pnpm domain` | adds the domain and, for an apex domain, `www.<domain>` to the project; makes `www` redirect to the domain with 308; reads the project's domains back as proof; prints the records `vercel domains verify` recommends as a table (type, name, value). A second run changes nothing already so | the table, or that DNS already points at Vercel |
| `pnpm domain --check` | changes nothing: per name, whether DNS points at Vercel (read from DNS as well as asked of Vercel, which lags for minutes after a change) and whether `https://<name>/` answers with a valid certificate: the domain 200, `www` 308 to the domain | `Ready: …`, or `not yet: …` (exit 1) |

**The first public thing is deliberate.** A new Vercel project's first deployment can become its
production deployment although a preview was asked for (it happened on 2026-11-14). So `pnpm preview`
refuses while the project has no READY production deployment (`vercel list --environment production
--status READY --format json --limit 1`), in one line that names `pnpm go-live`. The first public
deployment of a site is therefore its first `pnpm go-live`, on the owner's yes; previews work from then on.

**The owner's yes is a mark.** `pnpm go-live` and `pnpm domain` run only when the environment carries
`SITE_GO_LIVE=<domain>`, the domain being `domain` in `content/site.json`; the refusal says what the
mark means. The scripts check it themselves, so the rule holds in every agent. In Claude Code the hook
`scripts/no-production.mjs` (`.claude/settings.json`) refuses one step earlier the same two commands
without the mark, and the raw Vercel CLI commands that reach production, an alias, a domain, DNS or the
Git connection (`--prod`, production as the target, `promote`, `rollback`, `redeploy`, `alias`,
`domains`, `dns`, `git`, `api`). `pnpm domain --check` and `vercel list` pass.

**Each stops early, in one line that names the fix**, before anything is built: the domain still a
`[[placeholder]]`; the folder not linked to a Vercel project (`.vercel/project.json`): link it once with
`npx -y vercel@65.8.0 project create <name>` when the project is new, then
`npx -y vercel@65.8.0 link --yes --project <name>` (the commands never link or create a project themselves:
the account and the name are the owner's choices; linking also writes `.env.local`, which git ignores);
the CLI not signed in (asked with `CI=1`, so a missing login fails instead of opening a browser login and
waiting): `npx -y vercel@65.8.0 login`. A wrong option is refused too.

**Exit codes**: 0 done and proven; 2 refused before anything changed; 1 a step failed; 3 a deployment
went out with the wrong target (tell the owner at once); 4 the deployment is live but its pages were not
proven to answer.

**Domains.** An apex domain (`example.com`) gets its `www` twin, redirecting to it. A subdomain
(`me.example.org`) is added alone: it has no `www` twin and nothing redirects to it. Which one it is
comes from Vercel (the project domain's `apexName`), so `example.co.uk` counts as an apex; without that
field, two labels make an apex. A site with no domain of its own yet writes the Vercel project's
`<name>.vercel.app` address as its domain: `pnpm domain` then says there is nothing to add.

**Every Vercel call** runs `--non-interactive`, so the CLI answers with JSON and never prompts, whether a
person or an agent runs the command; the domain calls carry `--scope` with the linked project's team.
`VERCEL_GLOBAL_CONFIG` names the CLI's config folder (`--global-config`) when the login lives elsewhere.
`go-live` and `domain` run with `--use-env-proxy`.

## The agent setup

The site carries its own instructions, written for whoever owns it: no name, language or domain is
written in them; they say where the content holds each.

| File | What it is |
|---|---|
| `AGENTS.md` | The rules of the work (it ends at a preview; the public steps wait for the owner's yes and carry the mark; facts are the owner's) and the pointer to the skill. It ends with the block `next dev` writes, as Next writes it |
| `CLAUDE.md` | `@AGENTS.md`: Claude Code reads the same file |
| `.agents/skills/site/` | The `site` skill (open Agent Skills format): branch, edit, preview, hand over, finish on the owner's answer; a page each for a blog post, a project, page text, sections and languages, and going live with the domain. `.claude/skills/site` is a relative link to it |
| `.claude/settings.json` | Runs `scripts/no-production.mjs` before every Bash command in Claude Code |
| `.vercelignore` | What a deployment does not upload: the agent setup, what the build fetches, local files |
| `vercel.json` | Tells Vercel the site is a Next.js one. A project made with `vercel project create` has no framework set, and its first build then fails looking for a `public` output folder (seen on 2026-11-17) |

`tests/agent-docs.test.ts` holds them to the repo: every file and `pnpm` command they name exists, the
skill's pages link to each other, no raw production command is written in them, and they name no person.

## Tests and QA

**The tests do not depend on the owner's content**, so they pass after every sentence of `content/` has
changed. They run on a fictional demo kept in `tests/fixtures/site/` (its `content/` and `public/`),
never on the live `content/`: each test works on a throwaway copy of it (`tests/helpers.ts`). A test that
fails after a change to `content/` is a real failure: its message names the page and the problem.

| Command | What it checks |
|---|---|
| `pnpm test` | `tests/*.test.ts` with Node's test runner (`tests/register.mjs` resolves the `@/` alias, compiles `.tsx`, and stands in for the `site-fonts/*` modules). No network, no build. On the live content, `tests/live-content.test.ts` checks what must hold for any owner: it is valid (or each problem on its line), every page renders in each language it has, exactly one call to action a page, every internal link leads to a page or a file, nothing links to a `[[placeholder]]`, the navigation and the sitemap list what exists. An agent skill's page text, which the build fetches, is stood in for by the fixture skill's (`tests/helpers.ts` `standInSkill`) |
| `pnpm shapes` | Builds the demo with Next in each shape a site can take (`scripts/lib/shapes.mjs`: two languages, one, a second language other than Georgian, each section off in turn), compares what each build prerendered with what it must, exactly, and asks a server of the build for every page (200, in its language) and everything of a section that is off (404). Then a build with an agent skill fetched from a local stand-in for GitHub, and a build that a missing field stops with its one-line message. Each build's sitemap must list exactly its pages, since `pnpm go-live` reads it. `pnpm shapes en no-blog` builds only those |
| `pnpm qa --strict` | With the site running (`pnpm build && pnpm start -p 4317`): every page in the sitemap and a 404 per language: axe at three widths, overflow from 320 to 1280 px, the keyboard path, fonts (each face once, every page preloading what its home does), one call to action, a clean console, the JavaScript budget, the install tabs, "Copy as Markdown", "On this page", the phone pictures, the 404's "Did you mean", the feeds, every link in the agent formats, and the name's fit (`pnpm fit`) |

`tests/shapes.test.ts` checks every shape without building. The agent-skill kind is tested against
fixtures and a local stand-in for GitHub; the three commands against stand-ins for pnpm, the Vercel CLI
(`tests/stand-ins/vercel.mjs`, answering as 65.8.0 did), DNS and HTTPS (a local server with a
certificate openssl makes for the test).

The browser scripts (`pnpm qa`, `pnpm fit`, `pnpm shot` for screenshots, `pnpm axe`, `pnpm lighthouse`) drive the
first Chrome, Chromium, Edge or Brave they find where it is usually installed on macOS, Linux or Windows
(`scripts/lib/browser.mjs`); `CHROMIUM=/path/to/the/browser` names another.

Fonts: Archivo, Noto Sans Georgian and IBM Plex Mono under the SIL Open Font License (`assets/fonts`).

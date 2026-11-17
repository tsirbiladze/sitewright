# The answers file

The scaffold (step 2) makes the person's site folder from one JSON file that you write from what the person
told you in step 1. It holds only facts the person gave: a field they did not answer is left out, and the
scaffold writes a visible `[[placeholder]]` in its place. Never fill a field with a guess.

```bash
node <this skill>/scripts/scaffold.mjs --answers answers.json --out <new folder>
```

Keep `answers.json` outside the new folder. The new folder must not exist yet, or be empty.

## The fields

| Field | Required | What it holds |
|---|---|---|
| `languages` | yes | The site's languages, the main one first: `["en"]`, `["en", "ka"]`, `["ka", "en"]`, `["en", "de"]`. One or two codes. The main language is at `/`, the second under `/<code>/`. |
| `sections` | yes | The sections that are on, any of `"projects"`, `"work"`, `"about"`, `"blog"`. `[]` makes a home page only. The home is always there. |
| `name` | yes | The person's name, as each language of the site writes it (a text, see below). |
| `jobTitle` | no | What the person does, in a few words: `"Illustrator"`. |
| `email` | no | The address every call to action writes to: `"nino@example.net"`. |
| `domain` | no | The site's own domain, bare: `"nimushadze.example"`. `null` or left out when there is none yet. |
| `colours` | no | The site's palette, by name: `"wine"` (the default: deep wine, a pink button), `"ink"` (navy, orange), `"pine"` (dark green, red), `"sea"` (deep teal, amber), `"walnut"` (brown, teal) or `"slate"` (charcoal, violet). Or two colours of the owner's own, `{ "field": "#rrggbb", "accent": "#rrggbb" }`: the deep colour the name stands on, and the colour of the one button a page has. `pnpm check` refuses a pair on which some text would be hard to read, and says where: then the owner chooses again. |
| `links` | no | Profiles elsewhere, shown in the footer and on About: `[{ "label": "GitHub", "url": "https://github.com/…" }]`. A link whose address the person does not know yet leaves out `url`. |
| `projects` | no | The projects the person named, newest or oldest first (the site sorts them). Two kinds, below. Needs `"projects"` in `sections`. |

What the sections are, for asking the person:

| Section | Page | What it holds |
|---|---|---|
| `projects` | `/projects` | A list of projects and a page for each |
| `work` | `/work` | What the person offers, a price, how it goes, an email button |
| `about` | `/about` | Who they are, and a CV: roles, tools, links, a PDF |
| `blog` | `/blog` | Posts in Markdown, and a feed |

### Texts in one or two languages

A text (`name`, `jobTitle`, a link's `label`, a project's `title` and `summary`) is either:

- one string, the same in every language of the site: `"name": "Anna Beispiel"` on an English and German
  site, or a product name like `"title": "Sketch a Day"`; or
- an object with a value per language: `"name": { "ka": "ნინო ნიმუშაძე", "en": "Nino Nimushadze" }`.

Use the object whenever the languages write it differently. A language left out of an object becomes a
placeholder in that language, except for `name`, which every language of the site must have.

Scripts: Latin letters in a Latin-script language, and Georgian or Latin letters in Georgian (`ka`). A
Georgian letter in an English text is refused, as is any other script (Cyrillic, Greek, Arabic…).

### Projects

An **agent skill** whose page text the site fetches from its GitHub repository at build time:

```json
{ "kind": "skill", "repo": "owner/name", "ref": "v1.2.0" }
```

| Field | Required | What it holds |
|---|---|---|
| `kind` | yes | `"skill"` |
| `repo` | yes | The public GitHub repository, `"owner/name"` (not an address) |
| `ref` | yes | The release tag (or branch) the page text is fetched from |
| `slug` | no | The skill's folder name under `skills/` in the repository, which is also its page address. Defaults to the repository's name; give it when they differ |

The repository must have `docs/<slug>.md` (and `docs/<slug>.<lang>.md` for another language, where it has
one) and `skills/<slug>/SKILL.md` at that ref. The site writes nothing about a skill itself.

A **plain project**, written in the site:

```json
{ "kind": "plain", "title": "Sketch a Day", "date": "2026-03-01", "link": "https://…" }
```

| Field | Required | What it holds |
|---|---|---|
| `kind` | yes | `"plain"` |
| `title` | yes | The project's name (a text), at least in the main language |
| `date` | no | When it was made or last changed, `YYYY-MM-DD`. Projects are listed newest first; one whose date the owner does not remember gets a placeholder and is listed after the dated ones |
| `summary` | no | One sentence: what it is (a text) |
| `link` | no | The project's own address, `https://…`. With a link, the project's row leads there; without one it gets a page of its own to write in step 3 |
| `slug` | no | Its page address, the same in every language. Defaults to the English title when there is one, else the title in the main language, in Latin letters (`"Sketch a Day"` → `sketch-a-day`) |

Fields beginning with `$` (`"$comment"`) are ignored anywhere, for your notes.

## What the scaffold writes

- **Placeholders** for every text the answers do not give: the description, the home's paragraph, the
  Work page's offer and price, the About page's facts and CV, each section's lines. They are written in
  the language of their file (English and Georgian; English for another language, saying which language
  the text is for). `pnpm check` lists every one, and `pnpm dev` draws each as a dashed box. Filling them
  with the person is step 3.
- **Plain interface words** (section names, headings like "Experience", button labels like "Email me") in
  English and Georgian. In any other language these are placeholders too.
- **A language other than English and Georgian** gets `content/ui/<code>.json`, a copy of the English
  interface words with the language's own name, locale and months set: translate the rest.
- **No domain yet**: the site still needs an address for its sitemap and absolute links. The scaffold
  writes `<package>.vercel.app`, the address a Vercel project named after the package would get, and says
  so in `content/site.json`'s `"$comment"`. Name the Vercel project after the package, and after the first
  deployment write the address Vercel gives it (or the person's own domain) in `content/site.json`
  `"domain"`.
- **The package name** (`package.json` `"name"`) is the domain, or without one the person's name in Latin
  letters: `nino-nimushadze`.
- **Git**: the folder becomes a repository on `main` with a first commit, when git has a name and email
  set. Without them, every file is staged and the output gives the commands; `--no-git` skips git.
- Nothing invented: no sentence about the person, no price, no employer, no date.

## What it refuses

Each problem is one line naming the field, and nothing is made. Fix the answers and run it again.

| Problem | Example of the line |
|---|---|
| A field it does not know | `answers.json: "emial" is not a field here (did you mean "email"?)` |
| A third language | `answers.json: "languages" lists 3 languages: a site has one main language and at most one more …` |
| A language in another script | `answers.json: "languages[1]" is Russian, written in Cyrillic: the template takes Latin-script languages and Georgian ("ka")` |
| A country code for a language | `answers.json: "languages[0]" is "ge", the country code of Georgia; its language Georgian is "ka"` |
| A name missing in a language | `answers.json: "name.ka" is missing: the site is in Georgian too, so it needs the person’s name as Georgian writes it …` |
| A malformed email, domain or repository | `answers.json: "domain" must be the bare domain, without https://: "nimushadze.example"` |
| A date not written out, a skill without a ref | `answers.json: "projects[2].date" is "2025-08", which is not a date written YYYY-MM-DD` |
| A palette that does not exist | `answers.json: "colours" is "ocean", which is not a palette: choose one of wine, ink, pine, sea, walnut, slate, or give two colours …` |
| Projects with the projects section off | `answers.json: "projects" lists 2 projects, but "sections" leaves the projects section out …` |
| A folder that exists and is not empty | `--out site: exists and is not empty: give a new folder` |

Exit codes: `0` made; `1` the answers are refused; `2` anything else (the flags, the folder, the
template).

## A complete example

A fictional person, Nino Nimushadze ("nimushi" is Georgian for a sample), whose site is Georgian first
and English second, with no domain yet, no Work page, an agent skill, a book with its own address, and a
project with no address and no summary:

```json
{
  "$comment": "Nino Nimushadze is fictional: an example of the answers file.",
  "languages": ["ka", "en"],
  "sections": ["projects", "about", "blog"],
  "name": { "ka": "ნინო ნიმუშაძე", "en": "Nino Nimushadze" },
  "jobTitle": { "ka": "ილუსტრატორი", "en": "Illustrator" },
  "email": "nino@nimushadze.example",
  "domain": null,
  "links": [
    { "label": "GitHub", "url": "https://github.com/nimushadze-example" },
    { "label": { "ka": "პორტფოლიო", "en": "Portfolio" } }
  ],
  "projects": [
    { "kind": "skill", "repo": "nimushadze-example/palette-check", "ref": "v1.2.0" },
    {
      "kind": "plain",
      "title": { "ka": "ზღაპრების წიგნი", "en": "A book of fairy tales" },
      "summary": { "en": "Forty illustrations for a children’s book." },
      "link": "https://books.example.org/fairy-tales",
      "date": "2025-10-14"
    },
    { "kind": "plain", "title": "Sketch a Day", "date": "2026-03-01" }
  ]
}
```

What the scaffold prints for it (`--out nino-site`; the folder, the placeholders and the git line vary):

```text
Made /home/you/nino-site from the sitewright template 1.0.1 (https://github.com/tsirbiladze/sitewright at v1.0.1).
Languages: ka (main, at /), en (at /en/).
Sections: home, projects, about, blog; off: work.
Domain: nino-nimushadze.vercel.app, provisional (no domain yet): name the Vercel project nino-nimushadze, and after the first deployment write the address Vercel gives it in content/site.json "domain". Package: nino-nimushadze.
Projects: palette-check (agent skill, nimushadze-example/palette-check at v1.2.0), a-book-of-fairy-tales (plain), sketch-a-day (plain).
Agent skills: the build fetches each one’s page text from GitHub (docs/<slug>.md at its ref, and skills/<slug>/SKILL.md), so each repository must be public and have them.
Placeholders: 57 in 14 files, each a fact still to write (pnpm check lists them):
  content/en/about.json: 13
  content/en/blog.json: 5
  …
  content/ka/projects/sketch-a-day.md: 1
  content/ka/site.json: 1
  content/site.json: 2
Git: a repository on main with its first commit.
Next: cd /home/you/nino-site && pnpm install && pnpm fetch-skills && pnpm check; then write the texts with the person (pnpm dev shows every [[…]] as a dashed box).
```

## Running it

| Flag | What it does |
|---|---|
| `--answers <file>` | The answers file (required) |
| `--out <folder>` | The new site's folder (required): new, or empty |
| `--template <folder>` | A local copy of the template instead of the release on GitHub (offline, tests) |
| `--no-git` | Leaves the folder without a repository |
| `--version` | Prints the skill's version |

By default the template comes from `https://github.com/tsirbiladze/sitewright` at the tag `v<version>`,
the version in this skill's `SKILL.md` (`metadata.version`), fetched with git. The environment variable
`SITEWRIGHT_TEMPLATE` does what `--template` does; `SITEWRIGHT_REPO` replaces the repository's address.

After it: `pnpm install`, then `pnpm fetch-skills` when there is an agent skill (`pnpm check` needs its
page text), then `pnpm check`. The output's last line has these commands with the folder filled in.

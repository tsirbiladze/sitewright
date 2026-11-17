# A project

A project is a file `content/projects/<slug>.json`; its name is the project's address, `/projects/<slug>` (lowercase letters, digits and hyphens, unchanged once live). `"kind"` says which of two kinds it is. The projects section must be on (`sections.projects` in `content/site.json`); `content/<lang>/projects.json` holds the section's own name and texts. `README.md`, "The content model", lists every field.

## A plain project: `"kind": "plain"`

Written in the site. The demo's `tests/fixtures/site/content/projects/menu-cards.json` and `tests/fixtures/site/content/en/projects/menu-cards.md` show a complete one.

- **The file**: `date` (YYYY-MM-DD; the newest project comes first), `link` (its own address; needed when the project has no page here), and optionally `image` (`src` under `public/projects/<slug>/`, `width`, `height`, and a narrower `phone` picture) and `install` tabs.
- **Its text, in each language**: `content/<lang>/projects/<slug>.md` with frontmatter `title`, `summary` (one sentence) and optionally `category`, `status` (`stable`, `beta` or `experimental`), `imageAlt`, `imageCaption`. Text under the frontmatter makes the project a page of its own; without it the project links to its `link`. The main language must have the file; a language without it does not show the project.

## An agent skill: `"kind": "skill"`

Its page text is not written here: it comes from the skill's own GitHub repository at a release tag, fetched by every `pnpm dev` and `pnpm build` (`pnpm fetch-skills` alone) into `.content/skills/<slug>/`. `scripts/fetch-skills.mjs` says exactly what it fetches.

- **The file**: `repo` (the repository, as owner/name), `ref` (the release tag), and optionally `install` tabs and a `specimen`: an image the skill's docs show (`image`, its address exactly as the docs write it), pixel boxes cut from it (`crops.wide` and an optional `crops.phone`, each `x`, `y`, `w`, `h`), and a `caption` in each language.
- **The repository, at the tag**: `docs/<slug>.md` (the English page), `docs/<slug>.<lang>.md` for another language, `skills/<slug>/SKILL.md`, and `CHANGELOG.md` for the versions. The docs' frontmatter gives the page its title, summary, category and status.
- **A new release**: check that the tag has a release (`gh release view <tag> -R <owner/name>`), set `ref` to it, run `pnpm fetch-skills`, and read `.content/skills/<slug>/`: the docs and the changelog are the new ones. When the docs' image changed, the specimen's boxes may frame the wrong part: look at the crops in `public/skills/<slug>/`.

## Install tabs, either kind

Each tab has an `id`, a `label` and a `note` with a text for every language of the site (`{ "en": "…", "ka": "…" }`), and either `commands` (a list; `{repo}` becomes a skill's repository) or a `download` (`href`, or a skill's release `asset`, and a `label` for every language). Give a tab only for a way the project is really installed: every command one you ran or read in the project's own docs.

The Work page may show a project with a picture as its example: `example.project` in `content/<lang>/work.json`.

Done when `pnpm check` and `pnpm test` pass, and the build shows the project on `/projects` and on its own page (or as its link) in each language it has text in.

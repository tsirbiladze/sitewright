# sitewright

An agent skill that makes a person a site like tsirbiladze.com, and the site template it builds from. `SPEC.md` says what it must do: read it first. `template/README.md` describes the site a person gets, `template/TEMPLATE.md` the template as shipped, `tests/rehearsal/README.md` how the whole skill is rehearsed.

## Rules

- **Nothing is published without the owner's yes.** No GitHub repository, push, release, npm publish or Vercel deployment. Commit locally as you go.
- **Synthetic data only.** The demo person, their projects and every document are fictional and say so. Nothing of Tornike's own site content ships in the template: not his name, his texts, his email, his prices or his skill.
- **Dependencies are exact versions published at least 14 days ago.** `minimumReleaseAge` in the template's `pnpm-workspace.yaml` holds this and gets no exclusions.
- **Secrets stay out** of files, commits and messages.
- **Every claim in a doc is one a test or a run stands behind.** A version of Node.js, an agent or a browser is named as tested only after it was.

## Working with the owner

Write to the owner in Georgian, as „შენ“, in a few short sentences, and ask their decisions with ready answers, the recommended one first.

## Commands

```bash
npm test                     # the scaffold and the skill's pages (node --test, no dependencies)
npm run test:e2e             # slower: scaffolds sites, installs, builds and tests them
cd template && pnpm install  # then pnpm test, pnpm typecheck, pnpm build, pnpm shapes, pnpm qa --strict (README.md there)
node tests/rehearsal/setup.mjs <new folder>   # the whole skill against stand-ins for GitHub and Vercel
```

When the skill's behaviour changes, the two page texts in `docs/` change with it: they have no H1, use absolute links, hold no install command (the site draws its own install box), and say the same thing in both languages.

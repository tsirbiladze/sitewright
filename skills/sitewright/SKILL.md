---
name: sitewright
description: Build a person their own site from a few answers and take it live on Vercel under their domain. The site has a home, projects, a work page, a CV and a blog, in one or two languages. Use when someone asks for a personal site, a portfolio or a CV site of their own.
license: MIT
metadata:
  version: "1.0.1"
  homepage: "https://tsirbiladze.com/skills/sitewright"
---

# Sitewright

You are making **the owner** a site of their own: a home with their name across it, and whichever of projects, a work page, an About page with a CV, and a blog they want, in one or two languages. It is a static Next.js site made from this skill's template and hosted on Vercel, and every fact on it is one the owner gave you.

Write to the owner in their language, in short messages, with ready answers where a question has them. They may never have put a site online: say in a sentence what a step does before you ask for it.

## Three rules

- **The owner's yes.** Steps 4, 5 and 6 put something where other people can reach it. Each waits for a yes the owner gives for that step, in this conversation. A yes to one step is not a yes to the next.
- **Their facts.** A name, a date, a client, a price, a sentence about them: each comes from the owner, or from a file they hand you. What they have not given is written `[[what is missing]]`, and the site draws it as a dashed box.
- **Their logins.** Signing in to GitHub or Vercel happens in the owner's own browser. Tokens and passwords stay out of files, commits and messages.

## Steps

1. **Ask.** [answers.md](answers.md) lists what the site needs to know: read it, then ask the owner for each field, a few questions at a time. Ask too where on their machine the site's folder should go (name it after their domain, or after them), and whether they have a CV or a profile they can hand you: it answers much of step 3. Tell them once that whatever goes on the site is public, their email included. Done when you have asked about every field of the answers file. What the owner could not answer, or wants left for later, stays out of the file and becomes a placeholder on the site.

2. **Scaffold.** Check the tools first: `node --version` says 24, and `pnpm --version` and `git --version` answer. For one that is missing, give the owner the one command that installs it on their system and wait. Then write the answers file beside the new folder, not in it, and run:

   ```bash
   node <this skill's folder>/scripts/scaffold.mjs --answers answers.json --out <the site's folder>
   ```

   It prints what it made, every file that still holds a placeholder, and the next commands: run those. Done when `pnpm check`, `pnpm typecheck` and `pnpm test` pass in the site's folder. Every later command runs there, and its `README.md` says where each thing is. The folder's `AGENTS.md` and its own `site` skill, with a branch and a preview for every change, are for the site's life after step 7: until then you work on `main` and commit as you go.

3. **Write.** Fill the site with the owner's words, section by section: [writing.md](writing.md) says how. Done when `pnpm check` lists only placeholders the owner has chosen to leave, and the owner has read every page in each language on their own machine (`pnpm build`, then `pnpm start`) and has nothing left to change.

4. **Repository.** *The owner's yes.* The site's code goes to a GitHub repository of theirs: private unless they ask for public. `gh auth status` names the account the GitHub CLI is signed in to: tell the owner the name and go on when they say it is theirs. Signed in to none, the owner runs `gh auth login`. Then, `<name>` being `name` in `package.json`:

   ```bash
   gh repo create <name> --private --source . --remote origin --push
   ```

   Done when `git status -sb` shows `main...origin/main` with nothing ahead.

5. **Live.** *The owner's yes.* The site becomes public on Vercel, at an address ending in `vercel.app`: follow [live.md](live.md). Done when `pnpm go-live` ends with `Live: <address>` and the owner has opened that address.

6. **Domain.** *The owner's yes, and their hands for the DNS.* For an owner with a domain of their own; otherwise go to step 7. The same [live.md](live.md), "The domain". Done when `pnpm domain --check` ends with `Ready:`.

7. **Hand over.** One message: the site's address, the repository, the folder on their machine, each placeholder still open and where it shows, and how the site changes from now on: they open their agent in the site's folder and ask in plain words. The folder's `AGENTS.md` and its own `site` skill carry on from there: a post, a project, a changed text, a preview before anything goes live.

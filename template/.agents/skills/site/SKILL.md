---
name: site
description: Change what this site says and show the result. Use when the owner asks for a blog post, a project, a change to page text or the CV, a section switched on or off, a language added, a preview, or the site taken live or given its domain.
---

# Site

Every change to what the site says goes the same way: a **branch**, the edit, a **preview**, and the owner's word. `main` holds only what they have approved.

Asked only for a preview of what is already there: go to step 3 and stop after step 4's address. Asked to take the site live or to put a domain on it: follow [live.md](live.md).

## Steps

1. **Branch.** From `main`, start `content/<short-name>`; if this change already has a branch, continue on it. Done when you are on the branch and `git status --short --untracked-files=no` prints nothing. A tracked file changed by someone else is the owner's work in progress: tell them and wait.
2. **Edit**, following the page for the kind of change:
   - a blog post: [post.md](post.md)
   - a project, of either kind: [project.md](project.md)
   - page text, the CV, contact details, the photo: [page-text.md](page-text.md)
   - a section switched on or off, a language added or removed: [sections.md](sections.md)

   Done when `pnpm check` reports no problem, and the placeholders it lists are the ones you mean to leave.
3. **Preview.** Commit, then run `pnpm preview`. It typechecks, tests, builds, deploys a Vercel preview and proves that it is one. It needs the network (GitHub for agent skills' docs, Vercel for the deploy): in a sandbox, ask for that access. Done when it prints `Preview ready: <address>`. A check that fails is yours to fix before the next run; a refusal is one line that names its fix. "No production deployment yet" means the site has never been live, and a first deployment can become the live one: tell the owner, and take it live only on their yes ([live.md](live.md)). The preview opens only with the owner's Vercel login, so look at your own work in the build the command just made (`pnpm start -p 4317`) and keep the address for them.
4. **Hand over.** Tell the owner in a few short sentences what changed, give the changed page's address on the preview, and name every `[[placeholder]]` you left because the fact is theirs to give. Ask one question with three answers: keep it, change something, or drop it. Put first the one you recommend: change while a placeholder of yours is open, keep otherwise.
5. **Finish on their answer.**
   - Keep: `git switch main`, `git merge --ff-only <branch>`, delete the branch, and `git push` when the repository has a remote. The live site changes only when it is taken live again ([live.md](live.md)); ask the owner whether to.
   - Change: edit on the same branch and return to step 3.
   - Drop: `git switch main`, then `git branch -D <branch>`.

The work ends at the preview. What the public sees changes on the owner's yes.

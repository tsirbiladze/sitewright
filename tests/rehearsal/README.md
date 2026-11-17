# Rehearsing the skill

A rehearsal runs the whole skill, from the first question to the domain's DNS table, without GitHub or
Vercel: an agent follows `skills/sitewright/SKILL.md` for a fictional owner while two stand-ins answer in
their place.

```bash
node tests/rehearsal/setup.mjs /tmp/rehearsal-1     # add --signed-out to start with no logins
```

It makes a folder holding the skill and the template as the last commit has them, and an `env.sh`. A
shell command that starts with `source <folder>/env.sh &&` then meets:

- `gh` (`bin/gh`): "GitHub" is a folder of bare repositories, so `gh repo create … --push` really pushes.
- `npx -y vercel@… …` (`bin/npx`): answered by the template's own Vercel stand-in
  (`template/tests/stand-ins/vercel.mjs`), with what a first run adds: `whoami`, `login`,
  `project create`, `link`, and a production address that serves the real build from a local
  `next start`, so `pnpm go-live` proves its pages. Every other `npx` call is the real one.
- the scaffold takes the template from the folder (`SITEWRIGHT_TEMPLATE`), as the release is not out.

`calls.log` in the folder lists every question put to the two stand-ins, in order.

What a rehearsal cannot show: how the real GitHub and Vercel answer. One real run before each release
does that.

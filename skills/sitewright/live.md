# Going live

The site is hosted on Vercel and deployed by commands of its own: `pnpm go-live`, `pnpm domain` and `pnpm preview`. The site's `README.md`, "Preview, live, domain", says what each runs. Each proves its result before it says so, and when something is not ready it stops with one line that names the fix: do what that line says.

## Before the first deployment

Tell the owner what a first-timer does not know, then ask for their yes:

- Going live makes the site public at an address ending in `vercel.app`. Nobody is told that address, but anyone who has it can open the site. Their own domain is a separate step after this one.
- It needs a Vercel account, which is free to open. Vercel's free plan (Hobby) is for personal, non-commercial use, and a site that offers paid work may count as commercial in Vercel's terms (https://vercel.com/legal/terms). Which plan they use is the owner's choice: say it once, and go on with what they choose.
- From then on the site changes only when this command runs again. A push to GitHub publishes nothing.

## Sign in and link

1. `CI=1 npx -y vercel@65.8.0 whoami` shows whether the Vercel CLI is signed in (`CI=1` makes it answer when nobody is, where it would otherwise open a login and wait). If it is not, the owner runs `npx -y vercel@65.8.0 login` and finishes in their browser. Signed in, it prints the account's name: tell the owner the name and go on when they say it is theirs.
2. Give the site a Vercel project and link the folder to it, once. The project's name is `name` in `package.json`:

   ```bash
   npx -y vercel@65.8.0 project create <name>
   npx -y vercel@65.8.0 link --yes --project <name>
   ```

   Done when `.vercel/project.json` exists. Linking also writes `.env.local`, which git ignores: leave it. The project stays unconnected to GitHub: connected, every push would publish without anyone's yes.

## The first go-live

```bash
SITE_GO_LIVE=<domain> pnpm go-live
```

`<domain>` is `domain` in `content/site.json`. `SITE_GO_LIVE` is the owner's yes written down: put it in front only after they have said yes to this step, in this conversation.

The command checks the site, builds it, deploys it to production, and asks the new address for every page. It ends with `Live: <address>`. How it can end otherwise:

| It ends with | What happened | What you do |
|---|---|---|
| exit 2 and one line | It refused before anything changed | What the line says |
| exit 1 | A check, the build or the deploy failed; nothing new is live | Fix what it printed, run it again |
| exit 3 | A deployment went out with the wrong target | Tell the owner at once, with the address it printed |
| exit 4 | The site is live, but its pages were not proven to answer | Open the address, tell the owner what you see, run it again |

**An owner with no domain of their own.** The scaffold wrote a guess, `<name>.vercel.app`, as the site's address. Compare it with the address after `Live:`. When Vercel gave the project another one, write that one into `content/site.json` `domain` as the host name alone (`nino-nimushadze-x1.vercel.app`, without `https://`), run `pnpm check`, commit, push, and go live once more with the new address as the mark: the sitemap, the feeds and the share images carry the address the content names.

**An owner with a domain.** The site now answers at the `vercel.app` address; their domain is the next step.

## The domain

The owner's yes again, for this step. Then:

```bash
SITE_GO_LIVE=<domain> pnpm domain
```

It adds the domain to the Vercel project (and `www.<domain>`, redirecting to the domain, unless the domain is itself a subdomain) and prints a table of DNS records: type, name, value. Give the owner that table as it is, and tell them:

- The records are entered where the domain's DNS is managed. That is usually the control panel of the company the domain was bought from; a domain whose nameservers were moved elsewhere is managed there.
- A record already there with the same type and name is **replaced**: a parked domain usually has an `A` record for `@` and a `CNAME` for `www`, and those are the ones. When the table has two `A` records for `@`, both go in.
- Every other record stays as it is: mail (`MX`, `TXT`) and other subdomains are not this site's.

Entering the records is the owner's hand. Do it for them only if they open that control panel to you and ask.

Then check, as often as you like: it changes nothing.

```bash
pnpm domain --check
```

It answers `Ready:` when each name points at Vercel and answers over HTTPS with a valid certificate, or `not yet:` with what is missing. A DNS change takes from a minute to a few hours to reach everyone, and the certificate follows a little after. Check when the owner says the records are in, again a few minutes later, and if it is still `not yet`, tell the owner what is missing and that they can ask you to check again later.

## After

`pnpm preview` works from the first go-live on: a private address for a change that is not live yet. That is how the site's own `site` skill shows the owner every later change.

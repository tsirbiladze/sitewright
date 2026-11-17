# Live, and the domain

Two commands change what the public sees, and each runs only with the owner's mark: `SITE_GO_LIVE=<domain>` in front of it, `<domain>` being `domain` in `content/site.json`. Ask the owner first, with ready answers; write the mark only after their yes in this conversation, for the command they said yes to. Without it, each command refuses in one line and changes nothing.

Every refusal names its own fix: the domain still a `[[placeholder]]` (it must be the owner's domain, or the project's `<name>.vercel.app` address until they have one), the folder not linked to a Vercel project (once: `npx -y vercel@65.8.0 project create <name>` when the project is new, then `npx -y vercel@65.8.0 link --yes --project <name>`), or the Vercel CLI not signed in. Linking and signing in are the owner's choices of account: ask before you run them.

## Taking the site live

From `main`, with what the owner approved committed: `SITE_GO_LIVE=<domain> pnpm go-live`. It runs the same checks and build as `pnpm preview`, makes a production deployment, proves that its target is production and that it is ready, then asks the production address for every page of the build's sitemap. It needs the network, like `pnpm preview`. Done when it prints `Live: <address> (…)`; give the owner that address.

It exits 3 when a deployment went out with the wrong target, and 4 when the deployment is live but a page did not answer: tell the owner at once, in both cases, with the line it printed.

The first go-live of a new project is the site's first public deployment: previews work from then on.

## The domain

After the first go-live, on the owner's yes: `SITE_GO_LIVE=<domain> pnpm domain`. It puts the domain on the Vercel project; a domain like `example.com` gets `www.example.com` too, redirecting to it with 308, and a subdomain like `me.example.org` is added alone. Running it again changes nothing that is already so. It ends with a table of DNS records (type, name, value): give the owner that table as it is printed, with the registrar step it names. The records are theirs to enter; you cannot do it for them.

Then `pnpm domain --check`, which changes nothing and needs no mark: for each name it says whether DNS points at Vercel and whether it answers over HTTPS with a valid certificate. DNS takes minutes to hours; check again when the owner says the records are in, not in a loop. Done when it prints `Ready: …`.

When the domain changes later, it changes in `content/site.json` first; then go live again and run `pnpm domain` for the new one.

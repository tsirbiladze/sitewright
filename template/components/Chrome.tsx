import Link from 'next/link';
import { fill, getContent, has, href, L, linkLabel, other, type Lang, type Section } from '@/lib/content';
import { bareUrl, mailto, mainCta } from '@/lib/site';
import { projectHref, projectsIn } from '@/lib/projects';
import { routes, twin } from '@/lib/routes';
import { guessScript } from '@/lib/suggest';
import { isPlaceholder, rich } from './Text';
import { masthead } from '@/lib/fit';

/** The sections in the navigation, in this order, each with its page's name from the content. */
function navItems(lang: Lang): { key: Section; href: string; label: string }[] {
  const l = L(lang);
  const items: { key: Section; href: string; label: string }[] = [];
  if (l.projects) items.push({ key: 'projects', href: href(lang, '/projects'), label: l.projects.title });
  if (l.work) items.push({ key: 'work', href: href(lang, '/work'), label: l.work.title });
  if (l.about) items.push({ key: 'about', href: href(lang, '/about'), label: l.about.title });
  if (l.blog) items.push({ key: 'blog', href: href(lang, '/blog'), label: l.blog.title });
  return items;
}

/**
 * The bar on top of every page. `page` is the page's key in lib/routes.ts ('/work'): the language
 * link goes to the same page in the other language when it exists, and says so („ქართულად“);
 * otherwise it goes to the other language's home and says the language's name („ქართული“). With one
 * language there is no language link.
 * `prefetch={false}` is for the two 404s. From the global one every link is a full page load (it sits
 * outside both root layouts), so a prefetch only downloads the next page's preloaded font and images;
 * the second language's 404 does the same, so neither downloads pages the reader never opens.
 * `masthead` is for the homes: from 760 px the wordmark is not drawn there, because the name stands
 * right under it at full size and the wordmark would link to the page you are on. On phones it stays,
 * with the language link beside it. About also opens with the name at full size, but keeps the
 * wordmark: it is that page's link home, and the name itself stays plain text, so a reader can select
 * and copy it from the CV.
 */
export function Header({ lang, current, page, prefetch, masthead = false }: { lang: Lang; current?: Section; page?: string; prefetch?: false; masthead?: boolean }) {
  const s = L(lang).ui.chrome;
  const alt = other(lang);
  const twinHref = alt && page ? twin(page, alt) : undefined;
  return (
    <>
      <a className="skip" href="#main">{s.skip}</a>
      <header className={masthead ? 'site-header site-header--masthead' : 'site-header'}>
        <div className="wrap bar">
          <Link className="wordmark" href={href(lang, '/')} prefetch={prefetch}>{L(lang).site.name}</Link>
          <nav className="nav" aria-label={s.nav}>
            <ul>
              {navItems(lang).map((item) => (
                <li key={item.key}>
                  <Link href={item.href} prefetch={prefetch} aria-current={current === item.key ? 'page' : undefined}>{item.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
          {alt && (
            <a className="lang" href={twinHref ?? href(alt, '/')} lang={alt} hrefLang={alt}>
              {twinHref ? L(alt).ui.language.inThisLanguage : L(alt).ui.language.name}
            </a>
          )}
        </div>
      </header>
    </>
  );
}

/** A profile link from content/site.json: the link, or its placeholder while the address is `[[…]]`. */
function ProfileLink({ url, text }: { url: string; text?: string }) {
  if (isPlaceholder(url)) return <Placeholder>{url}</Placeholder>;
  return <a href={url}>{text ?? bareUrl(url)}</a>;
}

/**
 * Contact and agent links as label/value pairs (the project header's meta strip, on the footer's
 * deep wine), then the copyright line.
 */
export function Footer({ lang }: { lang: Lang }) {
  const c = getContent();
  const s = L(lang).ui.chrome;
  return (
    <footer className="site-footer">
      <div className="wrap foot">
        <dl className="foot__links">
          <div className="foot__email">
            <dt>{s.email}</dt>
            <dd><Email /></dd>
          </div>
          {c.site.links.map((link) => (
            <div key={link.url}>
              <dt>{linkLabel(link, lang)}</dt>
              <dd><ProfileLink url={link.url} text={link.text} /></dd>
            </div>
          ))}
          <div>
            <dt>{s.forAgents}</dt>
            <dd>
              <a href="/llms.txt">/llms.txt</a>
              {lang === c.primary && has(lang, 'projects') && <a href="/projects.md">/projects.md</a>}
            </dd>
          </div>
        </dl>
        <p className="foot__copy">© {c.site.year} {L(lang).site.name}</p>
      </div>
    </footer>
  );
}

/** Something only the person can fill. Dashed borders mean exactly this on the site. */
export function Placeholder({ children, block = false }: { children: React.ReactNode; block?: boolean }) {
  return block ? <div className="ph ph--block">{children}</div> : <span className="ph">{children}</span>;
}

/**
 * The email address as a link, or its placeholder while it is `[[…]]`. `split` lets the address break
 * before the @, and only where one line can't hold it (About, at 320 px).
 */
export function Email({ subject, className, split = false }: { subject?: string; className?: string; split?: boolean }) {
  const { email } = getContent().site;
  const target = mailto(subject);
  if (!target) return <Placeholder>{email}</Placeholder>;
  const [user, domain] = email.split('@');
  return <a className={className} href={target}>{split ? <>{user}<wbr />@{domain}</> : email}</a>;
}

/**
 * The one call to action of a page: a link to a page of the site, or an email. While the email address
 * is a placeholder, the button's words stand in a dashed box that links nowhere.
 */
export function Cta({ href, children, prefetch }: { href: string | null; children: React.ReactNode; prefetch?: false }) {
  if (!href) return <span className="cta cta--ph">{children}</span>;
  return href.startsWith('/') ? <Link className="cta" href={href} prefetch={prefetch}>{children}</Link> : <a className="cta" href={href}>{children}</a>;
}

export function PhotoSlot({ lang }: { lang: Lang }) {
  const { photo } = getContent().site;
  const s = L(lang).ui.chrome.photo;
  if (photo)
    return (
      <figure className="photo-slot photo-slot--filled">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo.src} width={photo.width} height={photo.height} alt={L(lang).site.name} />
      </figure>
    );
  return (
    <figure className="photo-slot" aria-label={s.label}>
      <strong>{s.title}</strong>
      <figcaption>{s.note}</figcaption>
    </figure>
  );
}

/**
 * Page header. The wine field holds the breadcrumb and the h1, and the h1 stands on the field's bottom
 * edge (the horizon), as the name does on the home page. Whatever dips below the baseline (a comma, a
 * g, most Georgian words) is drawn in wine below the edge. The lede and the children follow on mist.
 *
 * `field` keeps the lede and the children inside the field instead, for a page whose key element is
 * not its title: on Work the price stands on the edge.
 * `text` sets a sentence-length title (a blog post) a step smaller.
 * `name` is for a page whose title is the person's name (About): it is the home's masthead, sized
 * from its column by the same rule, so the name is one object on the site. It is plain text, not a link.
 */
export function PageHead({ title, lede, crumbs, lang, children, field = false, text = false, name = false }: { title: string; lede?: React.ReactNode; crumbs?: { href?: string; label: string }[]; lang: Lang; children?: React.ReactNode; field?: boolean; text?: boolean; name?: boolean }) {
  const trail = crumbs && (
    <nav className="crumbs" aria-label={L(lang).ui.chrome.breadcrumb}>
      <ol>
        {crumbs.map((c) => (
          <li key={c.label}>{c.href ? <Link href={c.href}>{c.label}</Link> : <span aria-current="page">{c.label}</span>}</li>
        ))}
      </ol>
    </nav>
  );
  if (field)
    return (
      <div className="page-head page-head--field">
        <div className="wrap">
          {trail}
          <h1 className="title">{title}</h1>
          {lede && <p className="summary">{lede}</p>}
          {children}
        </div>
      </div>
    );
  // Georgian words nearly always have descenders; in Latin only some letters and the comma do.
  const dips = L(lang).script === 'georgian' || /[gjpqyçşţ,;]/.test(title);
  // The name, like the home's masthead, runs from margin to margin (lib/fit.ts); what follows it clears
  // what dips below the edge.
  const fit = name ? masthead(title, L(lang).script) : null;
  const intro = fit ? ['wrap page-intro fit-after', fit.dip && 'fit-after--dip'].filter(Boolean).join(' ') : dips ? 'wrap page-intro page-intro--dip' : 'wrap page-intro';
  return (
    <div className={text ? 'head head--text' : 'head'} style={fit?.style}>
      {fit ? (
        <div className="hero">
          <div className="wrap">
            <h1 className={fit.dip ? 'name name--dip' : 'name'}>{title}</h1>
          </div>
        </div>
      ) : (
        <div className="page-head page-head--edge">
          <div className="wrap">
            {trail}
            <h1 className="title title--edge">{rich(title)}</h1>
          </div>
        </div>
      )}
      {(lede || children) && (
        <div className={intro}>
          {lede && <p className="summary">{lede}</p>}
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * The 404's body, in each language: the nearest real address for a typo, the one call to action
 * (home), what is on the site in this language, and a way to report the broken link. The main
 * language's is app/global-not-found.tsx (any unmatched address); the second language's is
 * app/(second)/[lang]/not-found.tsx (anything under /<code>/).
 */
export function NotFoundBody({ lang }: { lang: Lang }) {
  const c = getContent();
  const l = L(lang);
  const words = l.ui.notFound;
  // No prefetch from either 404 (see Header): the reader picks one of these links, and prefetching
  // all of them would download every page and its scripts to open one.
  const prefetch = false;
  const all = routes();
  const own = all.filter((r) => r.lang === lang).map((r) => r.path);
  const rest = all.filter((r) => r.lang !== lang).map((r) => r.path);
  const sections: { href: string; label: string; text: string }[] = [];
  if (l.work) sections.push({ href: href(lang, '/work'), label: l.work.title, text: fill(l.work.description, { price: l.work.price }) });
  if (l.about) sections.push({ href: href(lang, '/about'), label: l.about.title, text: l.about.description });
  if (l.blog) sections.push({ href: href(lang, '/blog'), label: l.blog.title, text: l.blog.description });
  const projects = l.projects ? projectsIn(lang) : [];
  return (
    <>
      <PageHead lang={lang} title={words.title} lede={words.lede} />
      <div className="wrap page-body nf">
        {/* "Did you mean …?", filled in the browser by lib/suggest.ts; React leaves its contents alone. */}
        <p id="nf-guess" className="nf__guess" hidden suppressHydrationWarning dangerouslySetInnerHTML={{ __html: '' }} />
        <script dangerouslySetInnerHTML={{ __html: guessScript([...own, ...rest], words.guess, words.guessEnd) }} />
        <p className="nf__home"><Link className="cta" href={href(lang, '/')} prefetch={prefetch}>{words.home}</Link></p>

        <h2 className="nf__h">{words.heading}</h2>
        <ul className="nf__list">
          {l.projects && (
            <li>
              <Link href={href(lang, '/projects')} prefetch={prefetch}>{l.projects.title}</Link>
              <p>{rich(l.projects.description)}</p>
              <ul className="nf__sub">
                {projects.map((p) => (
                  <li key={p.slug}>
                    <Link href={projectHref(p, lang)} prefetch={prefetch}>{p.docs[lang]!.name}</Link>
                    <p>{rich(p.docs[lang]!.summary)}</p>
                  </li>
                ))}
              </ul>
            </li>
          )}
          {sections.map((m) => (
            <li key={m.href}>
              <Link href={m.href} prefetch={prefetch}>{m.label}</Link>
              <p>{rich(m.text)}</p>
            </li>
          ))}
          <li>
            <a href="/llms.txt">/llms.txt</a>
            <p>{words.agents.split('{full}').flatMap((part, i) => (i ? [<a key={i} className="nf__inline" href="/llms-full.txt">/llms-full.txt</a>, part] : [part]))}</p>
          </li>
        </ul>

        <p className="nf__report">
          {words.report} <Email subject={words.reportSubject} />.
        </p>
      </div>
    </>
  );
}

/** The call-to-action block most pages end with: a heading, an optional line, and the one button. */
export function CtaBlock({ lang, heading, text }: { lang: Lang; heading: string; text?: string }) {
  const cta = mainCta(lang);
  return (
    <section className="cta-block" aria-labelledby="cta-h">
      <h2 id="cta-h">{rich(heading)}</h2>
      {text && <p>{rich(text)}</p>}
      <Cta href={cta.href}>{rich(cta.label)}</Cta>
    </section>
  );
}

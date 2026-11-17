import Link from 'next/link';
import { Cta, Header, Footer, PhotoSlot } from './Chrome';
import { ProjectRow } from './ProjectRow';
import { fill, formatDate, href, L, plural, type Lang } from '@/lib/content';
import { projectsIn, type Project } from '@/lib/projects';
import { getPosts, postPath } from '@/lib/blog';
import { mainCta } from '@/lib/site';
import { rich } from './Text';
import { masthead } from '@/lib/fit';

/** The home shows the newest projects; the rest live on the projects page. */
const HOME_PROJECTS = 3;

/**
 * A language's home: the name from margin to margin, the lede, the newest projects, the work and its
 * call to action, then About and the blog beside them, each only where this language has it.
 */
export function Home({ lang }: { lang: Lang }) {
  const l = L(lang);
  const all = l.projects ? projectsIn(lang) : [];
  const shown = all.slice(0, HOME_PROJECTS);
  const latest = l.blog ? getPosts(lang)[0] : undefined;
  // Each skill's current release, newest first: name, version and date from its changelog, so the
  // project page has a changelog section to land on. With one project the list would repeat the row
  // beside it, so it starts with the second.
  const releases = all.length > 1 ? all.filter((p) => p.kind === 'skill' && p.updated && p.version).slice(0, HOME_PROJECTS) : [];
  const releaseHref = (p: Project) => `${href(lang, `/projects/${p.slug}`)}#changelog`;
  const cta = mainCta(lang);
  // The name runs from margin to margin: its fit is computed from the name and the fonts (lib/fit.ts).
  const fit = masthead(l.site.name, l.script);
  const body = ['wrap home-body', l.script === 'georgian' && 'home-body--ka', 'fit-after', fit.dip && 'fit-after--dip'].filter(Boolean).join(' ');
  return (
    <>
      <Header lang={lang} page="/" masthead />
      <main id="main" style={fit.style}>
        <section className="hero" aria-labelledby="name">
          <div className="wrap">
            <h1 className={fit.dip ? 'name name--dip' : 'name'} id="name">{l.site.name}</h1>
          </div>
        </section>

        <div className={body}>
          <PhotoSlot lang={lang} />
          <p className="lede">{rich(l.home.lede)}</p>

          {l.projects && (
            <section className="skills" id="projects" aria-labelledby="projects-h">
              <h2 id="projects-h">{l.projects.title}</h2>
              <p className="section-intro">{rich(l.projects.intro)}</p>
              <ul className="skill-list">
                {shown.map((p, i) => <ProjectRow key={p.slug} project={p} lang={lang} variant={i === 0 ? 'feature' : 'compact'} />)}
              </ul>
              <Link className="more" href={href(lang, '/projects')}>{fill(l.projects.all, { count: all.length })}</Link>
            </section>
          )}

          {/* The one call to action: the work and its packages, or, without a Work page, an email. */}
          <section className="work" aria-labelledby="work-h">
            <h2 id="work-h">{l.work ? l.work.title : l.site.contact.button}</h2>
            {l.work && <p>{rich(l.work.teaser.text)}</p>}
            <Cta href={cta.href}>{rich(cta.label)}</Cta>
          </section>

          {(l.about || l.blog) && (
            <div className="home-side">
              {l.about && (
                <section className="hiring" aria-labelledby="hiring-h">
                  <h2 id="hiring-h">{l.about.teaser.heading}</h2>
                  <p>{rich(l.about.teaser.text)}</p>
                  <p><Link href={href(lang, '/about')}>{l.about.teaser.link}</Link></p>
                </section>
              )}
              {l.blog && (
                <section className="blog" aria-labelledby="blog-h">
                  <h2 id="blog-h">{l.blog.title}</h2>
                  <p>{rich(l.blog.teaser.text)}</p>
                  {latest ? (
                    <p><Link href={postPath(lang, latest.slug)}>{latest.title}</Link> <span className="post-date">{formatDate(latest.date, lang)}</span></p>
                  ) : (
                    <p><Link href={href(lang, '/blog')}>{l.blog.teaser.link}</Link></p>
                  )}
                </section>
              )}
            </div>
          )}

          {releases.length > 0 && (
            <section className="latest" aria-labelledby="latest-h">
              <h2 id="latest-h">{plural(lang, l.ui.releases, releases.length)}</h2>
              <ul className="release-list">
                {releases.map((p) => (
                  <li key={p.slug}>
                    <Link href={releaseHref(p)}>
                      <span><span className="release-list__name">/{p.slug}</span> <span className="release-list__version">v{p.version}</span></span>
                      <time dateTime={p.updated!}>{formatDate(p.updated!, lang)}</time>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </main>
      <Footer lang={lang} />
    </>
  );
}

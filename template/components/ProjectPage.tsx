import Link from 'next/link';
import { Header, Footer, CtaBlock } from './Chrome';
import { InstallBox } from './InstallBox';
import { Toc } from './Toc';
import { hasDate, ProjectDate } from './ProjectRow';
import { rich } from './Text';
import { fill, formatDate, href, L, type Lang } from '@/lib/content';
import { bareUrl } from '@/lib/site';
import { projectPath, statusLabel, type ChangelogEntry, type Project } from '@/lib/projects';
import { projectJsonLd } from '@/lib/project-seo';

/** Versions a page can list from the English changelog: released ones, with a number. */
const released = (entries: ChangelogEntry[]) => entries.filter((c) => /^\d/.test(c.version));

/**
 * A project's page. The header holds the title, the summary and the facts; an agent skill's install
 * box (or a plain project's, when it has install tabs) straddles the header's edge, with the links
 * under it; then the article with "On this page", a skill's changelog, and the call to action.
 * `readingClass` is the reading face's CSS-variable class, for Latin-script pages (lib/fonts/reading.ts).
 */
export function ProjectPage({ project, lang, readingClass }: { project: Project; lang: Lang; readingClass?: string }) {
  const doc = project.docs[lang]!;
  const l = L(lang);
  const s = l.ui.project;
  const path = projectPath(project.slug, lang);
  // Each page shows the changelog in its own language. Without one in this language, a page in
  // another language than English lists the released versions and their dates, and links to the
  // English file for what changed.
  const own = lang === 'en' ? project.changelog : project.changelogs[lang] ?? [];
  const versionsOnly = !own.length && lang !== 'en' ? released(project.changelog) : [];
  const hasChangelog = own.length > 0 || versionsOnly.length > 0;
  const toc = [...doc.toc, ...(hasChangelog ? [{ id: 'changelog', text: s.changelog }] : [])];
  const jsonLd = JSON.stringify(projectJsonLd(project, lang)).replace(/</g, '\\u003c');
  const withBox = project.install.length > 0;

  return (
    <>
      <Header lang={lang} current="projects" page={`/projects/${project.slug}`} />
      <main id="main">
        <div className={withBox ? 'page-head page-head--install' : 'page-head page-head--project'}>
          <div className="wrap">
            <nav className="crumbs" aria-label={l.ui.chrome.breadcrumb}>
              <ol>
                <li><Link href={href(lang, '/projects')}>{l.projects!.title}</Link></li>
                <li><span aria-current="page">{project.kind === 'skill' ? project.slug : doc.title}</span></li>
              </ol>
            </nav>
            <h1 className="title">{rich(doc.title)}</h1>
            <p className="summary">{rich(doc.summary)}</p>
            <dl className="meta">
              {doc.category && <div><dt>{s.category}</dt><dd>{doc.category}</dd></div>}
              {doc.status && <div><dt>{s.status}</dt><dd>{statusLabel(doc.status, lang)}</dd></div>}
              {project.version && <div><dt>{s.version}</dt><dd>v{project.version}</dd></div>}
              {project.license && <div><dt>{s.license}</dt><dd>{project.license}</dd></div>}
              {hasDate(project) && <div><dt>{s.updated}</dt><dd><ProjectDate project={project} lang={lang} /></dd></div>}
              {project.link && <div><dt>{s.link}</dt><dd><a href={project.link}>{bareUrl(project.link)}</a></dd></div>}
            </dl>
          </div>
        </div>

        <InstallBox
          tabs={project.install}
          lang={lang}
          fullHref={doc.source || undefined}
          sourceHref={project.repoUrl}
          sourceLabel={project.repo}
          markdownHref={`${path}.md`}
        />

        <div className={['wrap', 'article-layout', readingClass && `reading ${readingClass}`].filter(Boolean).join(' ')}>
          <Toc items={toc} title={s.onThisPage} />

          <article className="prose" dangerouslySetInnerHTML={{ __html: doc.html }} />

          {hasChangelog && (
            <section className="prose changelog" aria-labelledby="changelog">
              <h2 id="changelog"><a className="h-anchor" href="#changelog">{s.changelog}</a></h2>
              {own.length > 0 ? (
                <ol className="releases">
                  {own.map((c) => (
                    <li key={c.version} className="release">
                      <div className="release__head">
                        <h3 id={`v${c.version}`}>{c.version}</h3>
                        {c.date && <p className="release__date"><time dateTime={c.date}>{formatDate(c.date, lang)}</time></p>}
                      </div>
                      <div className="release__body" dangerouslySetInnerHTML={{ __html: c.html }} />
                    </li>
                  ))}
                </ol>
              ) : (
                <>
                  <ol className="releases releases--dates">
                    {versionsOnly.map((c) => (
                      <li key={c.version} className="release">
                        <h3 id={`v${c.version}`}>{c.version}</h3>
                        {c.date && <p className="release__date"><time dateTime={c.date}>{formatDate(c.date, lang)}</time></p>}
                      </li>
                    ))}
                  </ol>
                  <p className="releases__more">
                    {s.changelogElsewhere.split('{file}').flatMap((part, i) => (i ? [<a key={i} href={project.changelogUrl} hrefLang="en">CHANGELOG.md</a>, part] : [part]))}
                  </p>
                </>
              )}
            </section>
          )}

          <CtaBlock lang={lang} heading={fill(l.projects!.projectCtaHeading, {})} />
        </div>
      </main>
      <Footer lang={lang} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
    </>
  );
}

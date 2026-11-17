import { Header, Footer, PageHead, CtaBlock } from './Chrome';
import { ProjectRow } from './ProjectRow';
import { rich } from './Text';
import { fill, formatDate, getContent, L, plural, type Lang } from '@/lib/content';
import { projectsIn, type Project } from '@/lib/projects';

const catId = (cat: string) => `cat-${cat.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-')}`;

/** The projects index: every project with text in this language, newest first, grouped by category when there are several. */
export function ProjectsIndex({ lang }: { lang: Lang }) {
  const l = L(lang);
  const p = l.projects!;
  const words = l.ui.projectsIndex;
  const projects = projectsIn(lang);
  // Categories in order of their newest project, so the newest project always opens the list.
  const groups = new Map<string, Project[]>();
  for (const project of projects) {
    const cat = project.docs[lang]?.category ?? '';
    groups.set(cat, [...(groups.get(cat) ?? []), project]);
  }
  const grouped = groups.size > 1;
  const newest = projects[0];
  // The newest project keeps its picture and full facts; every other row is compact.
  const row = (project: Project) => (
    <ProjectRow key={project.slug} project={project} lang={lang} variant={project === newest ? 'index' : 'index-compact'} heading={grouped ? 'h3' : 'h2'} />
  );
  const primary = lang === getContent().primary;
  const [before, after] = words.agents.split('{link}');

  return (
    <>
      <Header lang={lang} current="projects" page="/projects" />
      <main id="main">
        <PageHead lang={lang} title={p.title} lede={rich(p.lede)}>
          {/* With one project these facts would repeat the row right under them (its category, its
              date), so they appear from the second project on. */}
          {projects.length > 1 && (
            <dl className="meta">
              <div><dt>{words.published}</dt><dd>{plural(lang, p.count, projects.length)}</dd></div>
              {/* More than one category: each one links to its group, so twenty projects are one jump away. */}
              <div>
                <dt>{grouped ? words.categories : words.category}</dt>
                <dd>
                  {grouped ? (
                    <ul className="cat-jump">
                      {[...groups].map(([cat, list]) => (
                        <li key={cat}><a href={`#${catId(cat)}`}>{cat} <span className="cat-jump__n">{list.length}</span></a></li>
                      ))}
                    </ul>
                  ) : (
                    [...groups.keys()][0]
                  )}
                </dd>
              </div>
              {newest?.updated && <div><dt>{words.latest}</dt><dd><time dateTime={newest.updated}>{formatDate(newest.updated, lang)}</time></dd></div>}
            </dl>
          )}
        </PageHead>
        <div className="wrap page-body skill-index-page">
          {grouped ? (
            [...groups].map(([cat, list]) => (
              <section key={cat} className="skill-group" aria-labelledby={catId(cat)}>
                <h2 className="skill-group__h" id={catId(cat)}>
                  {cat} <span className="skill-group__n">{plural(lang, p.count, list.length)}</span>
                </h2>
                <ul className="skill-index">{list.map(row)}</ul>
              </section>
            ))
          ) : (
            <ul className="skill-index">{projects.map(row)}</ul>
          )}
          {/* The Markdown index is the main language's, at /projects.md. */}
          {primary && <p className="skill-index__note">{before}<a href="/projects.md">/projects.md</a>{after}</p>}
          <CtaBlock lang={lang} heading={fill(p.ctaHeading, {})} />
        </div>
      </main>
      <Footer lang={lang} />
    </>
  );
}

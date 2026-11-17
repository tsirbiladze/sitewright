import Link from 'next/link';
import { Command } from './InstallBox';
import { Specimen } from './Specimen';
import { rich } from './Text';
import { formatDate, L, type Lang } from '@/lib/content';
import { hasPage, projectHref, statusLabel, type Project } from '@/lib/projects';

export type ProjectRowVariant = 'feature' | 'compact' | 'index' | 'index-compact';

/** A project's date, or its dashed box while it is still a `[[placeholder]]`; null when it has neither. */
export function ProjectDate({ project, lang }: { project: Project; lang: Lang }) {
  if (project.updated) return <time dateTime={project.updated}>{formatDate(project.updated, lang)}</time>;
  return project.datePlaceholder ? <span className="ph">{project.datePlaceholder}</span> : null;
}
export const hasDate = (p: Project) => Boolean(p.updated || p.datePlaceholder);

/**
 * One project in a list.
 * - `feature`: the home's newest project: name, job, a picture of what it does, facts, the install line.
 * - `compact`: further projects on the home: the same without the picture.
 * - `index`: the newest project on the index page: name, job, picture, install line, and a facts
 *   column (status, version, updated, category, license, formats).
 * - `index-compact`: every further row of the index: no picture, and only the facts that differ from
 *   project to project (status, version, updated) on one line, so twenty rows still scan. The status
 *   and version speak for themselves there (a disc and its word, a "v"), so their labels are for
 *   screen readers only.
 * A skill is named "/slug", the way agents call it; a plain project by its title. A plain project
 * without a page of its own links straight to its address.
 */
export function ProjectRow({ project, lang, variant = 'feature', heading }: { project: Project; lang: Lang; variant?: ProjectRowVariant; heading?: 'h2' | 'h3' }) {
  const doc = project.docs[lang]!;
  const target = projectHref(project, lang);
  const first = project.install.find((tab) => 'commands' in tab);
  const index = variant === 'index' || variant === 'index-compact';
  const H = heading ?? (index ? 'h2' : 'h3');
  const sp = variant === 'feature' || variant === 'index' ? project.specimen : undefined;
  const statusKey = doc.status?.toLowerCase();
  const s = L(lang).ui.project;
  const quiet = variant === 'index-compact' ? 'sr-only' : undefined;
  const internal = hasPage(project, lang);
  const link = (children: React.ReactNode, extra?: { tabIndex: number }) =>
    internal ? <Link href={target} {...extra}>{children}</Link> : <a href={target} {...extra}>{children}</a>;

  return (
    <li className={`skill-row skill-row--${variant}`}>
      <H className="skill-row__name">{link(doc.name)}</H>
      <p className="summary-line">{rich(doc.summary)}</p>
      {sp && (
        <figure className="specimen-fig">
          {/* The picture opens the project too. The name above is the link a keyboard stops at. */}
          {link(<Specimen specimen={sp} lang={lang} priority={variant === 'index'} />, { tabIndex: -1 })}
          {sp.caption?.[lang] && <figcaption>{rich(sp.caption[lang])}</figcaption>}
        </figure>
      )}
      <dl className="skill-facts">
        {doc.status && <div><dt className={quiet}>{s.status}</dt><dd><span className={`status status--${statusKey}`}>{statusLabel(doc.status, lang)}</span></dd></div>}
        {project.version && <div><dt className={quiet}>{s.version}</dt><dd>v{project.version}</dd></div>}
        {index && hasDate(project) && <div><dt>{s.updated}</dt><dd><ProjectDate project={project} lang={lang} /></dd></div>}
        {variant !== 'index-compact' && doc.category && <div><dt>{s.category}</dt><dd>{doc.category}</dd></div>}
        {variant !== 'index-compact' && project.license && <div><dt>{s.license}</dt><dd>{project.license}</dd></div>}
        {variant === 'index' && project.install.length > 1 && <div className="skill-facts__wide"><dt>{s.formats}</dt><dd>{project.install.map((tab) => tab.label[lang]).join(', ')}</dd></div>}
      </dl>
      {first && 'commands' in first && first.language !== 'json' && <Command text={first.commands[0]} lang={lang} light wrap />}
    </li>
  );
}

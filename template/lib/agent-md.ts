// Plain-Markdown versions of the site for agents: /llms.txt (llmstxt.org), /llms-full.txt,
// /projects.md, and a Markdown twin of every project page (/projects/<slug>.md, /<code>/projects/<slug>.md).
// Every link in them is absolute. A section that is off has no lines here.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fill, formatDate, getContent, href, L, languageName, linkLabel, type Lang } from './content';
import { hasEmail, realLinks } from './site';
import { fetchedDir, getProjects, hasPage, projectPath, projectsIn, statusLabel, type Project } from './projects';
import { blogPath, feedPath, getPosts, postPath } from './blog';

const abs = (path: string) => `${getContent().url}${path}`;

/** Site-relative links and images (`](/…)`, `[ref]: /…`, `src="/…"`) become absolute URLs. */
export const absolutize = (md: string) => {
  const url = getContent().url;
  return md
    .replace(/\]\(\/(?!\/)/g, `](${url}/`)
    .replace(/^(\s{0,3}\[[^\]]+\]:\s*)\/(?!\/)/gm, `$1${url}/`)
    .replace(/\b(src|href)="\/(?!\/)/g, `$1="${url}/`);
};

/** Where a project is read as Markdown: its page's twin, or a plain project's own address. */
const markdownOf = (p: Project, lang: Lang) => (hasPage(p, lang) ? abs(`${projectPath(p.slug, lang)}.md`) : p.link ?? abs(href(lang, '/projects')));

/**
 * A skill's changelog as the repo wrote it (CHANGELOG.md or CHANGELOG.<lang>.md, fetched with the
 * docs), one `###` section per release. Rebuilding it from the rendered HTML would drop inline code,
 * links and paragraphs.
 */
function changelogSections(project: Project, lang: Lang, own: boolean): string[] {
  const name = own && lang !== 'en' ? `CHANGELOG.${lang}.md` : 'CHANGELOG.md';
  const file = join(fetchedDir(project.slug), name);
  const raw = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const sections = raw.split(/^## /m).slice(1);
  const entries = own && lang !== 'en' ? project.changelogs[lang] ?? [] : project.changelog;
  return entries.map((c, i) => {
    const body = (sections[i] ?? '').split('\n').slice(1).join('\n').trim().replace(/^(#{3,5}) /gm, '#$1 ');
    return `### ${c.version}${c.date ? ` (${formatDate(c.date, lang)})` : ''}${body ? `\n\n${absolutize(body)}` : ''}`;
  });
}

/** The same changelog the page shows: its own language, or the released versions and a link to the English file. */
function changelogPart(project: Project, lang: Lang): string[] {
  const words = L(lang).ui.project;
  if (lang === 'en') return project.changelog.length ? [`## ${words.changelog}`, ...changelogSections(project, lang, true)] : [];
  if (project.changelogs[lang]?.length) return [`## ${words.changelog}`, ...changelogSections(project, lang, true)];
  const released = project.changelog.filter((c) => /^\d/.test(c.version));
  if (!released.length) return [];
  return [
    `## ${words.changelog}`,
    released.map((c) => `- ${c.version}${c.date ? ` (${formatDate(c.date, lang)})` : ''}`).join('\n'),
    fill(words.changelogElsewhere, { file: `[CHANGELOG.md](${project.changelogUrl})` }),
  ];
}

/** A project page as Markdown: its header, facts, install box and text, and a skill's changelog. */
export function projectMarkdown(project: Project, lang: Lang): string {
  const doc = project.docs[lang]!;
  const ui = L(lang).ui;
  const t = { ...ui.project, ...ui.agents };
  const otherLang = getContent().languages.find((l) => l !== lang && hasPage(project, l));
  const meta = [
    doc.category ? `- ${t.category}: ${doc.category}` : null,
    doc.status ? `- ${t.status}: ${statusLabel(doc.status, lang)}` : null,
    project.version ? `- ${t.version}: ${project.version}` : null,
    project.license ? `- ${t.license}: ${project.license}` : null,
    project.updated || project.datePlaceholder ? `- ${t.updated}: ${project.updated ? formatDate(project.updated, lang) : project.datePlaceholder}` : null,
    project.repoUrl ? `- ${t.source}: ${project.repoUrl}` : null,
    doc.source ? `- ${t.full}: ${doc.source}` : null,
    project.link ? `- ${t.link}: ${project.link}` : null,
    `- ${t.page}: ${abs(projectPath(project.slug, lang))}`,
    otherLang ? `- ${fill(t.twin, { language: languageName(otherLang, lang) })}: ${abs(`${projectPath(project.slug, otherLang)}.md`)}` : null,
  ].filter(Boolean);
  const install = project.install.map((tab) => {
    const lines = [`### ${tab.label[lang]}`, ''];
    if ('commands' in tab) for (const c of tab.commands) lines.push('```' + (tab.language ?? 'bash'), c, '```', '');
    else lines.push(`${tab.download.label[lang]}: ${tab.download.href}`, '');
    lines.push(tab.note[lang]);
    return lines.join('\n');
  });
  const parts = [`# ${doc.title}`, `> ${doc.summary}`, meta.join('\n'), ...(install.length ? [`## ${t.install}`, ...install] : []), absolutize(doc.markdown)];
  // The twin carries the same changelog as its page (components/ProjectPage.tsx).
  parts.push(...changelogPart(project, lang));
  return parts.filter(Boolean).join('\n\n') + '\n';
}

/** /projects.md: every project of the main language with its facts and first install line. */
export function projectsIndexMarkdown(): string {
  const { primary } = getContent();
  const l = L(primary);
  const t = { ...l.ui.project, ...l.ui.agents };
  const items = projectsIn(primary).map((p) => {
    const doc = p.docs[primary]!;
    const first = p.install.find((tab) => 'commands' in tab && tab.language !== 'json');
    const cmd = first && 'commands' in first ? first.commands[0] : '';
    return [
      `## ${doc.title}`,
      '',
      doc.summary,
      '',
      ...(doc.category ? [`- ${t.category}: ${doc.category}`] : []),
      ...(doc.status ? [`- ${t.status}: ${statusLabel(doc.status, primary)}`] : []),
      ...(p.version ? [`- ${t.version}: ${p.version}${p.license ? ` (${p.license})` : ''}`] : []),
      ...(p.updated || p.datePlaceholder ? [`- ${t.updated}: ${p.updated ? formatDate(p.updated, primary) : p.datePlaceholder}`] : []),
      ...(hasPage(p, primary) ? [`- ${t.markdown}: ${abs(`${projectPath(p.slug, primary)}.md`)}`, `- ${t.page}: ${abs(projectPath(p.slug, primary))}`] : []),
      ...(p.link ? [`- ${t.link}: ${p.link}`] : []),
      ...(p.repoUrl ? [`- ${t.source}: ${p.repoUrl}`] : []),
      ...(cmd ? ['', '```bash', cmd, '```'] : []),
    ].join('\n');
  });
  const work = l.work;
  return [
    `# ${l.projects!.title} – ${l.site.name}`,
    `> ${l.projects!.description}`,
    ...items,
    ...(work ? [`${work.teaser.text} ${fill(work.teaser.button, { price: work.price })}: ${abs(href(primary, '/work'))}`] : []),
  ].join('\n\n') + '\n';
}

/** The lines /llms.txt gives one language: its projects, its pages, its blog and posts. */
function languageLines(lang: Lang, { home }: { home: boolean }): { projects: string[]; pages: string[] } {
  // The main language's projects index is the Markdown one, listed first under its own heading.
  const l = L(lang);
  const projects = l.projects ? projectsIn(lang).map((p) => `- [${p.docs[lang]!.title}](${markdownOf(p, lang)}): ${p.docs[lang]!.summary}`) : [];
  const pages = [
    ...(home ? [`- [${l.ui.agents.home}](${abs(href(lang, '/'))})`] : []),
    ...(l.projects && home ? [`- [${l.projects.title}](${abs(href(lang, '/projects'))}): ${l.projects.description}`] : []),
    ...(l.work ? [`- [${l.work.title}](${abs(href(lang, '/work'))}): ${fill(l.work.description, { price: l.work.price })}`] : []),
    ...(l.about ? [`- [${l.about.title}](${abs(href(lang, '/about'))}): ${l.about.description}`] : []),
    ...(l.blog
      ? [
          `- [${l.blog.title}](${abs(blogPath(lang))}): ${l.blog.description}`,
          `- [RSS](${abs(feedPath(lang))}): ${l.ui.agents.feed}`,
          ...getPosts(lang).map((p) => `- [${p.title}](${abs(postPath(lang, p.slug))})${p.summary ? `: ${p.summary}` : ''}`),
        ]
      : []),
  ];
  return { projects, pages };
}

export function llmsTxt(): string {
  const c = getContent();
  const { primary, second } = c;
  const l = L(primary);
  const words = l.ui.agents;
  const main = languageLines(primary, { home: false });
  const withPages = getProjects().some((p) => hasPage(p, primary));
  const intro = [
    second ? fill(words.languages, { main: languageName(primary, primary), other: languageName(second, primary), prefix: `/${second}/` }) : '',
    withPages ? fill(words.twins, { full: abs('/llms-full.txt') }) : '',
  ].filter(Boolean).join(' ');
  const list = (heading: string, items: string[]) => (items.length ? [`## ${heading}\n\n${items.join('\n')}`] : []);
  const contact = [...(hasEmail() ? [`- [${l.ui.chrome.email}](mailto:${c.site.email}): ${c.site.email}`] : []), ...realLinks().map((x) => `- [${linkLabel(x, primary)}](${x.url})`)];
  const secondLines = second ? languageLines(second, { home: true }) : null;
  return [
    `# ${l.site.name}`,
    `> ${l.site.description}`,
    ...(intro ? [intro] : []),
    ...(l.projects ? list(l.projects.title, [`- [${words.allProjects}](${abs('/projects.md')}): ${l.projects.description}`, ...main.projects]) : []),
    ...list(words.pages, main.pages),
    ...list(words.contact, contact),
    ...(second && secondLines ? list(languageName(second, primary), [...secondLines.pages.slice(0, 1), ...secondLines.projects, ...secondLines.pages.slice(1)]) : []),
  ].join('\n\n') + '\n';
}

/** llms.txt followed by every project page of the main language in full, for agents that want one fetch. */
export function llmsFullTxt(): string {
  const { primary } = getContent();
  return [llmsTxt(), ...getProjects().filter((p) => hasPage(p, primary)).map((p) => projectMarkdown(p, primary))].join('\n---\n\n');
}

export const markdownResponse = (body: string, type = 'text/markdown', status = 200) =>
  new Response(body, { status, headers: { 'content-type': `${type}; charset=utf-8`, 'x-robots-tag': 'noindex' } });

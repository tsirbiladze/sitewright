// A project page's share image, in the page's own language: what the page shows, handed to
// lib/og.tsx, which draws it with the committed fonts (no network at build time).
import { getContent, type Lang } from './content';
import { bareUrl } from './site';
import { projectPath, statusLabel, type Project } from './projects';
import { ogSize, projectShareImage } from './og';

export { ogSize };

export function projectOgImage(project: Project, lang: Lang) {
  const doc = project.docs[lang]!;
  const first = project.install.find((t) => 'commands' in t && t.language !== 'json');
  // The box on the horizon holds the first install command; without one, where the project lives.
  const command = first && 'commands' in first ? first.commands[0] : project.repo ? `github.com/${project.repo}` : bareUrl(project.link ?? `${getContent().url}${projectPath(project.slug, lang)}`);
  return projectShareImage({
    lang,
    title: doc.title,
    summary: doc.summary,
    command,
    meta: [doc.category, doc.status && statusLabel(doc.status, lang), project.version && `v${project.version}`, project.license].filter(Boolean),
    address: `${getContent().site.domain}${projectPath(project.slug, lang)}`,
  });
}

// The projects, of two kinds (content/projects/<slug>.json):
// - an agent skill, whose page text is fetched from its own GitHub repository at build time
//   (scripts/fetch-skills.mjs writes .content/skills/<slug>/), with its version, licence and changelog;
// - a plain project, written in the site's own content (content/<lang>/projects/<slug>.md): a title, a
//   summary, a link, and optionally a page of Markdown.
// Both are shown the same way: a row in the lists, and a page with an optional install box.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Marked, type Tokens } from 'marked';
import { ContentError, fill, getContent, href, L, liveHref, type InstallTabFile, type Lang, type Picture, type ProjectFile } from './content';
import { fmNested, fmString, frontmatter, type Frontmatter } from './frontmatter';
import { isPlaceholder } from './schema';

export type { Picture } from './content';

/**
 * A tab of the install box. `short` is the end of the label, shown alone on the narrowest phones
 * when the whole row would not fit; the full label stays the tab's accessible name.
 */
interface TabBase { id: string; label: Record<Lang, string>; short?: Partial<Record<Lang, string>>; note: Record<Lang, string> }
export type InstallTab =
  | (TabBase & { commands: string[]; language?: 'json' | 'text' | 'bash' })
  | (TabBase & { download: { href: string; label: Record<Lang, string> } });

/** A file attached to the release tagged `ref`, or the latest release's page when `ref` is a branch. */
const releaseAsset = (repo: string, ref: string, file: string) =>
  /^v?\d+(\.\d+)*$/.test(ref) ? `https://github.com/${repo}/releases/download/${ref}/${file}` : `https://github.com/${repo}/releases/latest`;

/** An image the site serves, with a lighter WebP twin when the fetch made one. */
export type FetchedPicture = Picture & { webp?: string };

/**
 * What the project does, shown: a skill's crops of one of its docs' images, or a plain project's
 * picture. On the home, the projects index and Work. `wide` from 700 px up, `phone` below.
 */
export interface Specimen { alt: Record<Lang, string>; wide: Picture; phone?: Picture; /** What the picture shows, for a row. */ caption?: Record<Lang, string> }

export interface TocItem { id: string; text: string }
export interface ProjectDoc {
  lang: Lang;
  /** How lists name it: "/slug" for a skill (the way agents call it), the title for a plain project. */
  name: string;
  title: string;
  summary: string;
  category: string;
  status: string;
  /** A skill's full SKILL.md in its repo; '' for a plain project. */
  source: string;
  /** Markdown body without frontmatter, image URLs rewritten to the site. '' when there is no page. */
  markdown: string;
  html: string;
  toc: TocItem[];
}
export interface ChangelogEntry { version: string; date: string | null; html: string }
export interface Project {
  slug: string;
  kind: 'skill' | 'plain';
  /** The project in each language it has text in. */
  docs: Partial<Record<Lang, ProjectDoc>>;
  /** Skills only: the repository, the ref the text was fetched from, and what SKILL.md says. */
  repo?: string;
  ref?: string;
  repoUrl?: string;
  version: string;
  license: string;
  /** The current release's date (a skill) or the project's date (plain): lists are newest first. */
  updated: string | null;
  /** A plain project's date while it is still a `[[placeholder]]`: drawn as one, and listed after the dated projects. */
  datePlaceholder?: string;
  /** A plain project's own address. */
  link?: string;
  /** CHANGELOG.md, in English. */
  changelog: ChangelogEntry[];
  /** CHANGELOG.<lang>.md for each other language the repo has one in. */
  changelogs: Partial<Record<Lang, ChangelogEntry[]>>;
  /** CHANGELOG.md in the repo, at `ref`. */
  changelogUrl?: string;
  install: InstallTab[];
  specimen?: Specimen;
}

/** Whether the project has a page in a language (a plain project without a body is a link). */
export const hasPage = (p: Project, lang: Lang) => Boolean(p.docs[lang] && (p.kind === 'skill' || p.docs[lang]!.markdown));
export const projectPath = (slug: string, lang: Lang) => href(lang, `/projects/${slug}`);
/** Where a row links: the project's page, or a plain project's own address. */
export const projectHref = (p: Project, lang: Lang) => (hasPage(p, lang) ? projectPath(p.slug, lang) : p.link ?? projectPath(p.slug, lang));
/** A status as the language says it ("stable" → "Stable"); an unknown one as written. */
export const statusLabel = (status: string, lang: Lang) => (L(lang).ui.project.statuses as Record<string, string>)[status.toLowerCase()] ?? status;

/**
 * Links into the skill's own repo at `main` point at the ref the page text was fetched from
 * (content/projects/<slug>.json `ref`), so the page and the file it links to are the same version.
 * Any other link, including a `source` elsewhere, stays as written.
 */
export function pinToRef(text: string, repo: string, ref: string): string {
  const repoPath = repo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`https://github\\.com/${repoPath}/(blob|tree|raw)/main(?=[/)\\s"#?]|$)`, 'g'), `https://github.com/${repo}/$1/${ref}`);
}

const decode = (s: string) =>
  s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

const slugify = (s: string) =>
  s.toLowerCase().replace(/<[^>]+>/g, '').replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-');

/**
 * Typographic quotes for English prose: shipment’s, “check the documents”. Runs on text tokens only,
 * so code spans, URLs and the Markdown twin keep their straight quotes. Other languages are left as
 * written (Georgian and German use „…“ of their own).
 */
export function smartQuotes(s: string, before = '', after = ''): string {
  // `before` and `after` are the characters around this run of text (e.g. the end of inline code),
  // so a quote next to code or a link turns the right way. Each rule swaps one character for one.
  const b = before.slice(-1), a = after.slice(0, 1);
  const out = (b + s + a)
    .replace(/(?<=[\p{L}\p{N}])'(?=[\p{L}\p{N}])/gu, '’')
    .replace(/(^|[\s([{—–])'(?=\d\d(?:s\b|\b))/gu, '$1’') // elision: ’90s
    .replace(/(^|[\s([{—–])"(?=\S)/gu, '$1“')
    .replace(/"/g, '”')
    .replace(/(^|[\s([{—–])'(?=\S)/gu, '$1‘')
    .replace(/'/g, '’');
  return out.slice(b.length, out.length - a.length);
}
// Curly quotes in prose: each plain text run is read with the characters around it, from its
// neighbours in the same line (inline code, links, emphasis), so `check`'s and "`npx`" come out right.
const smartened = new WeakSet<object>();
const edgeText = (t: Tokens.Generic | undefined) => (t && typeof t.text === 'string' ? t.text : '');
export const smartenText = (token: Tokens.Generic) => {
  const kids = token.tokens as Tokens.Generic[] | undefined;
  if (kids) {
    kids.forEach((kid, i) => {
      if (kid.type !== 'text' || kid.tokens || typeof kid.text !== 'string' || smartened.has(kid)) return;
      kid.text = smartQuotes(kid.text, edgeText(kids[i - 1]).slice(-1), edgeText(kids[i + 1]).slice(0, 1));
      smartened.add(kid);
    });
  } else if (token.type === 'text' && typeof token.text === 'string' && !smartened.has(token)) {
    token.text = smartQuotes(token.text);
    smartened.add(token);
  }
};

const zoomIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function render(markdown: string, lang: Lang, images: Record<string, FetchedPicture>, pin: (href: string) => string = (h) => h) {
  const toc: TocItem[] = [];
  const words = L(lang).ui.project;
  // Ids the page itself uses, and ids already given: a repeated heading gets "-2", "-3"…
  const used = new Set(['main', 'changelog', 'toc-h', 'cta-h']);
  const marked = new Marked({
    gfm: true,
    ...(lang === 'en' ? { walkTokens: smartenText } : {}),
    renderer: {
      heading({ tokens, depth }: Tokens.Heading) {
        const inner = this.parser.parseInline(tokens);
        const text = decode(inner.replace(/<[^>]+>/g, ''));
        const base = slugify(text) || 'section';
        let id = base;
        for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
        used.add(id);
        if (depth === 2) toc.push({ id, text });
        // The heading links to its own section, so a reader can copy a link to it.
        const body = inner.includes('<a ') ? inner : `<a class="h-anchor" href="#${id}">${inner}</a>`;
        return `<h${depth} id="${id}">${body}</h${depth}>\n`;
      },
      image({ href, text }: Tokens.Image) {
        const img = images[href];
        const src = img?.src ?? href;
        const size = img?.width ? ` width="${img.width}" height="${img.height}"` : '';
        const tag = `<img src="${src}" alt="${text.replace(/"/g, '&quot;')}"${size} loading="lazy" decoding="async">`;
        // The page shows the lossless WebP twin; the original stays the fallback and the full-size link.
        return img?.webp ? `<picture><source srcset="${img.webp}" type="image/webp">${tag}</picture>` : tag;
      },
      link({ href, tokens, text }: Tokens.Link) {
        const pinned = pin(href);
        // A bare URL shows its own address, so it shows the pinned one too.
        const inner = text === href && pinned !== href ? pinned : this.parser.parseInline(tokens);
        // A link into a section that is off has nowhere to go: its words stay, the link goes.
        const live = liveHref(pinned);
        return live === null ? inner : `<a href="${live}">${inner}</a>`;
      },
    },
  });
  let html = marked.parse(markdown, { async: false }) as string;
  // A paragraph holding only an image becomes a figure. On a phone the image is too small to read,
  // so the whole figure links to the full-size file.
  html = html.replace(/<p>(<picture>.*?<\/picture>|<img [^>]+>)<\/p>/g, (_, img: string) => {
    const src = img.match(/<img [^>]*?src="([^"]+)"/)?.[1];
    if (!src) return `<figure>${img}</figure>`;
    return `<figure><a class="zoom" href="${src}">${img}<span class="zoom__label">${zoomIcon}${words.fullSize}</span></a></figure>`;
  });
  // Wide tables scroll inside their own box.
  // Each table is labelled by the section heading above it.
  let section = '';
  html = html
    .replace(/<h2 id="([^"]+)"|<table>/g, (m, id) => {
      if (id) { section = id; return m; }
      return `<div class="table-wrap" role="region" ${section ? `aria-labelledby="${section}"` : `aria-label="${words.table}"`} tabindex="0"><table>`;
    })
    .replace(/<\/table>/g, '</table></div>')
    .replace(/<th(?=[\s>])/g, '<th scope="col"')
    // On a phone a two-column table is drawn as stacked rows (article.css). The explicit roles keep
    // it a table for assistive technology when its display changes.
    .replace(/<table>/g, '<table role="table">')
    .replace(/<(thead|tbody)>/g, '<$1 role="rowgroup">')
    .replace(/<tr>/g, '<tr role="row">')
    .replace(/<th scope="col"/g, '<th role="columnheader" scope="col"')
    .replace(/<td(?=[\s>])/g, '<td role="cell"');
  return { html, toc };
}

/** A link whose text is a URL may break after a slash (example.com/projects/ x), not mid-word. */
const breakUrls = (html: string) =>
  html.replace(/(<a [^>]*>)(https?:\/\/[^<]+)(<\/a>)/g, (_, open: string, url: string, close: string) =>
    open + url.replace(/(?<=[^/]\/)(?=[^/])/g, '<wbr>') + close);

function readChangelog(src: string, lang: Lang = 'en'): ChangelogEntry[] {
  const marked = new Marked({ gfm: true, ...(lang === 'en' ? { walkTokens: smartenText } : {}) });
  return src
    .split(/^## /m)
    .slice(1)
    .map((section) => {
      const [head, ...rest] = section.split('\n');
      const m = head.match(/^\[?v?([\d.]+[\w.-]*)\]?\s*(?:[—–-]\s*(\d{4}-\d{2}-\d{2}))?/);
      return { version: m?.[1] ?? head.trim(), date: m?.[2] ?? null, html: breakUrls(marked.parse(rest.join('\n').trim(), { async: false }) as string) };
    });
}

/** An install tab from the content, with a skill's repo and release filled in. */
function installTab(tab: InstallTabFile, repo?: string, ref?: string): InstallTab {
  const base: TabBase = { id: tab.id, label: tab.label, note: tab.note, ...(tab.short ? { short: tab.short as Partial<Record<Lang, string>> } : {}) };
  if (tab.commands) return { ...base, commands: tab.commands.map((c) => fill(c, { repo: repo ?? '' })), ...(tab.language ? { language: tab.language } : {}) };
  const download = tab.download as { asset?: string; href?: string; label: Record<Lang, string> };
  const target = download.asset && repo && ref ? releaseAsset(repo, ref, download.asset) : download.href ?? '';
  return { ...base, download: { href: target, label: download.label } };
}

/** The folder the fetch writes a skill to. */
export const fetchedDir = (slug: string) => join(process.cwd(), '.content/skills', slug);

function skillProject(file: Extract<ProjectFile, { kind: 'skill' }>, languages: Lang[]): Project {
  const { slug, repo, ref } = file;
  const dir = fetchedDir(slug);
  // Read before the fetch (`pnpm check` right after a skill is added): one line that names the command.
  if (!existsSync(dir))
    throw new ContentError([`.content/skills/${slug} is missing: run pnpm fetch-skills (the agent skill’s page text comes from ${repo}; pnpm dev and pnpm build fetch it first)`]);
  const read = (f: string) => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8') : null);
  const images: Record<string, FetchedPicture> = JSON.parse(read('images.json') ?? '{}');
  const pin = (text: string) => pinToRef(text, repo, ref);
  const skillMd = frontmatter<Frontmatter>(read('SKILL.md') ?? '').data;
  const changelog = readChangelog(read('CHANGELOG.md') ?? '');
  const docs: Partial<Record<Lang, ProjectDoc>> = {};
  for (const lang of languages) {
    const src = read(`${lang}.md`);
    if (!src) continue;
    const { data, body } = frontmatter<Frontmatter>(src);
    let markdown = body.trim();
    for (const [url, img] of Object.entries(images)) markdown = markdown.split(url).join(img.src);
    const { html, toc } = render(body.trim(), lang, images, pin);
    docs[lang] = {
      lang, name: `/${slug}`,
      title: fmString(data.title), summary: fmString(data.summary), category: fmString(data.category), status: fmString(data.status),
      source: pin(fmString(data.source)), markdown: pin(markdown), html, toc,
    };
  }
  const version = fmNested(skillMd.metadata, 'version') ?? changelog[0]?.version ?? '';
  // The crops the fetch cut (none when the skill has no specimen or its image is gone).
  const cut: ({ image: string } & Omit<Specimen, 'alt'>) | null = JSON.parse(read('specimen.json') ?? 'null');
  // The specimen's alt text is the docs' own alt text for that image, in each language.
  const altFor = (url: string) => Object.fromEntries(languages.map((lang) => [lang, [...(read(`${lang}.md`) ?? '').matchAll(/!\[([^\]]*)\]\(([^)\s]+)/g)].find((m) => m[2] === url)?.[1] ?? '']));
  const changelogs: Partial<Record<Lang, ChangelogEntry[]>> = {};
  for (const lang of languages) if (lang !== 'en') { const src = read(`CHANGELOG.${lang}.md`); if (src) changelogs[lang] = readChangelog(src, lang); }
  return {
    slug, kind: 'skill', repo, ref, repoUrl: `https://github.com/${repo}`,
    docs, version, license: fmString(skillMd.license),
    updated: changelog.find((c) => c.version === version)?.date ?? changelog[0]?.date ?? null,
    changelog, changelogs,
    changelogUrl: `https://github.com/${repo}/blob/${ref}/CHANGELOG.md`,
    install: file.install.map((tab) => installTab(tab, repo, ref)),
    specimen: cut ? { alt: altFor(cut.image), wide: cut.wide, ...(cut.phone && { phone: cut.phone }), ...(file.specimen?.caption && { caption: file.specimen.caption }) } : undefined,
  };
}

function plainProject(file: Extract<ProjectFile, { kind: 'plain' }>): Project {
  const docs: Partial<Record<Lang, ProjectDoc>> = {};
  for (const [lang, t] of Object.entries(file.texts)) {
    const { html, toc } = t.body ? render(t.body, lang, {}) : { html: '', toc: [] };
    docs[lang] = { lang, name: t.title, title: t.title, summary: t.summary, category: t.category, status: t.status, source: '', markdown: t.body, html, toc };
  }
  const captions = Object.fromEntries(Object.entries(file.texts).filter(([, t]) => t.imageCaption).map(([lang, t]) => [lang, t.imageCaption]));
  return {
    slug: file.slug, kind: 'plain', docs, version: '', license: '', link: file.link,
    ...(isPlaceholder(file.date) ? { updated: null, datePlaceholder: file.date } : { updated: file.date }),
    changelog: [], changelogs: {}, install: file.install.map((tab) => installTab(tab)),
    specimen: file.image
      ? {
          alt: Object.fromEntries(Object.entries(file.texts).map(([lang, t]) => [lang, t.imageAlt])),
          wide: { src: file.image.src, width: file.image.width, height: file.image.height },
          ...(file.image.phone ? { phone: file.image.phone } : {}),
          ...(Object.keys(captions).length ? { caption: captions } : {}),
        }
      : undefined,
  };
}

let cache: Project[] | null = null;

/** Every project, newest first, those without a date yet last. Built once for a production build; read again on every call otherwise. */
export function getProjects(): Project[] {
  if (cache && process.env.NODE_ENV === 'production') return cache;
  const { projects, languages } = getContent();
  cache = projects
    .map((p) => (p.kind === 'skill' ? skillProject(p, languages) : plainProject(p)))
    .sort((a, b) => Number(!a.updated) - Number(!b.updated) || (b.updated ?? '').localeCompare(a.updated ?? '') || a.slug.localeCompare(b.slug));
  return cache;
}

export const getProject = (slug: string) => getProjects().find((p) => p.slug === slug);

/** The projects shown in a language: those with text in it. */
export const projectsIn = (lang: Lang) => getProjects().filter((p) => p.docs[lang]);

/** The Markdown render on its own, for tests. */
export const renderMarkdownForTest = (markdown: string, lang: Lang, images: Record<string, FetchedPicture> = {}) => render(markdown, lang, images);

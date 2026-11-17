// Everything that differs from person to person, read from content/ and checked. Pages and
// components read the site through getContent(); none of them holds a sentence of the person's.
//
// content/site.json               the site: domain, languages, sections, email, links, photo
// content/ui/<lang>.json          interface words of a language (navigation, labels, the 404, dates)
// content/<lang>/site.json        the person in that language: name, job title, description
// content/<lang>/home.json        the home page
// content/<lang>/<section>.json   a section's page in that language: projects, work, about, blog
// content/<lang>/projects/<slug>.md   a plain project's text in that language
// content/<lang>/blog/<slug>.md   a blog post (read by lib/blog.ts)
// content/projects/<slug>.json    a project: an agent skill fetched from its repo, or a plain project
//
// A page exists in a language when that language has its file. Every problem fails the build and the
// tests with one line naming the file and the field (lib/schema.ts). README.md describes every field.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { frontmatter } from './frontmatter';
import { DEFAULT_PRESET, isHex, palette, PRESETS, refusal, type Colours, type Palette } from './colours';
import { editDistance } from './suggest';
import {
  bool, date, int, link, list, nullable, object, oneOf, optional, perLanguage, plural as pluralForms, slug, text, textOrEmpty, textOrPerLanguage,
  type Ctx, type Infer, type Schema,
} from './schema';

export type Lang = string;
export const SECTIONS = ['projects', 'work', 'about', 'blog'] as const;
export type Section = (typeof SECTIONS)[number];
export type Script = 'latin' | 'georgian';

/** Georgian is the one non-Latin script the design supports (fonts, line height, no letter-spacing). */
export const scriptOf = (lang: Lang): Script => (lang === 'ka' ? 'georgian' : 'latin');

export class ContentError extends Error {
  problems: string[];
  constructor(problems: string[]) {
    super(problems.join('\n'));
    this.name = 'ContentError';
    this.problems = problems;
  }
}

// ───────────── The files ─────────────

/** `colours`: a preset's name, or a pair { field, accent } that passes WCAG AA wherever the site uses it (lib/colours.ts). */
const coloursSchema: Schema<Colours | undefined> = {
  optional: true,
  what: 'the colours',
  parse(value, at, ctx) {
    const presets = Object.keys(PRESETS);
    const how = `a preset (${presets.map((p) => `"${p}"`).join(', ')}) or a pair { "field": "#rrggbb", "accent": "#rrggbb" }`;
    if (typeof value === 'string') {
      if (value in PRESETS) return value as Colours;
      const near = presets.map((p) => [p, editDistance(value, p)] as const).sort((a, b) => a[1] - b[1])[0];
      ctx.problems.push(`${ctx.file}: "${at}" is "${value}", which is not a preset${near[1] <= 2 ? ` (did you mean "${near[0]}"?)` : ''}: write ${how}`);
      return undefined;
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      ctx.problems.push(`${ctx.file}: "${at}" must be ${how}`);
      return undefined;
    }
    const pair = value as Record<string, unknown>;
    let ok = true;
    for (const key of ['field', 'accent']) {
      if (isHex(pair[key])) continue;
      ok = false;
      ctx.problems.push(`${ctx.file}: "${at}.${key}" ${pair[key] === undefined ? 'is missing' : 'must be a colour as #rrggbb'} (${key === 'field' ? 'the deep colour every page stands on' : 'the colour of the one call to action'})`);
    }
    for (const key of Object.keys(pair)) if (!['field', 'accent', '$comment'].includes(key)) { ok = false; ctx.problems.push(`${ctx.file}: "${at}.${key}" is not a field here (a pair has "field" and "accent")`); }
    if (!ok) return undefined;
    const colours = { field: (pair.field as string).toLowerCase(), accent: (pair.accent as string).toLowerCase() } as Colours & object;
    const refused = refusal(colours);
    if (refused) ctx.problems.push(`${ctx.file}: "${at}": ${refused}`);
    return colours;
  },
};

const siteSchema = object({
  domain: text('the site’s domain, like "example.com"', { pattern: [/^(?!https?:)[a-z0-9-]+(\.[a-z0-9-]+)+$/, 'must be a bare domain like "example.com", without https://'] }),
  languages: list(text('a language code', { pattern: [/^[a-z]{2,3}$/, 'must be a language code like "en" or "ka"'] }), 'the first is the main language at /, an optional second lives under /<code>/', { min: 1 }),
  sections: object(
    { projects: bool('the projects section'), work: bool('the Work page'), about: bool('the About page and CV'), blog: bool('the blog') },
    'which sections are on',
    (key) => `is not a section: the sections are ${SECTIONS.join(', ')}`,
  ),
  email: text('the email address every page offers', { pattern: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'must be an email address'] }),
  links: list(object({
    label: textOrPerLanguage('the link’s name: a name like "GitHub", or a word per language like { "en": "Code", "ka": "კოდი" }'),
    url: link('where it goes'),
    text: optional(text('what the link shows instead of its address')),
  }), 'profiles elsewhere: shown in the footer, on About and in the structured data'),
  photo: nullable(object({ src: link('the photo’s file in public/'), width: int('its width in pixels'), height: int('its height in pixels') })),
  year: int('the year in the footer’s ©'),
  colours: coloursSchema,
});

const plainSchema = (hint: string) => text(hint);

function uiSchema() {
  return object({
    language: object({ name: text('the language’s own name, e.g. "Deutsch"'), inThisLanguage: text('a link to the same page in this language, e.g. "Auf Deutsch"') }),
    locale: text('the Open Graph locale, e.g. "en_US"', { pattern: [/^[a-z]{2,3}_[A-Z]{2}$/, 'must look like "en_US"'] }),
    date: object({
      format: text('how a date is written', { tokens: ['d', 'month', 'y'] }),
      months: list(plainSchema('a month’s name'), 'the twelve months', { min: 12 }),
    }),
    wordsPerMinute: int('reading speed for the blog’s reading time'),
    chrome: object({
      skip: plainSchema('the skip link'),
      nav: plainSchema('the main navigation’s accessible name'),
      breadcrumb: plainSchema('the breadcrumb’s accessible name'),
      email: plainSchema('the label of the email address'),
      forAgents: plainSchema('the footer label for /llms.txt'),
      photo: object({ label: plainSchema('the photo placeholder’s accessible name'), title: plainSchema('the photo placeholder’s text'), note: plainSchema('the line under it') }),
    }),
    project: object({
      category: plainSchema('label'), status: plainSchema('label'), version: plainSchema('label'), license: plainSchema('label'),
      updated: plainSchema('label'), changelog: plainSchema('heading'), onThisPage: plainSchema('heading of the table of contents'),
      formats: plainSchema('label for the ways a project installs'), link: plainSchema('label for a project’s address'),
      statuses: object({ stable: plainSchema('status'), beta: plainSchema('status'), experimental: plainSchema('status') }),
      changelogElsewhere: text('the line under a version list when the changelog is only in English', { tokens: ['file'] }),
      table: plainSchema('a table’s accessible name'),
      fullSize: plainSchema('the link to an image at full size'),
    }),
    install: object({
      heading: plainSchema('the install box’s heading'), copy: plainSchema('button'), copied: plainSchema('button after copying'),
      full: plainSchema('link to a skill’s SKILL.md'), source: plainSchema('label of the repository link'),
      config: plainSchema('accessible name of a JSON config'), markdownView: plainSchema('link'), markdownCopy: plainSchema('button'), markdownFailed: plainSchema('message'),
    }),
    projectsIndex: object({
      published: plainSchema('label'), category: plainSchema('label'), categories: plainSchema('label'), latest: plainSchema('label'),
      agents: text('the line about the Markdown index', { tokens: ['link'] }),
    }),
    releases: pluralForms('the home’s heading over the latest releases'),
    blog: object({
      minutes: pluralForms('reading time'),
      draft: plainSchema('the mark on a draft in a local preview'),
      all: plainSchema('the link back to every post'),
      feed: plainSchema('the line before the feed’s address'),
    }),
    notFound: object({
      title: plainSchema('the 404’s title'), lede: plainSchema('the 404’s first line'),
      guess: plainSchema('before the suggested address'), guessEnd: textOrEmpty('after it ("?" in English)'),
      heading: plainSchema('heading over the list of sections'),
      agents: text('the line about /llms.txt', { tokens: ['full'] }),
      report: plainSchema('the line asking where a broken link was'), reportSubject: plainSchema('the email subject for it'),
      home: plainSchema('the call to action'),
    }),
    agents: object({
      languages: text('llms.txt: which language is where', { tokens: ['main', 'other', 'prefix'] }),
      twins: text('llms.txt: the Markdown twins', { tokens: ['full'] }),
      allProjects: text('llms.txt: the Markdown index', { tokens: [] }),
      pages: plainSchema('llms.txt heading'), contact: plainSchema('llms.txt heading'), home: plainSchema('llms.txt: the home in this language'),
      feed: plainSchema('llms.txt: the blog feed'),
      install: plainSchema('Markdown twin heading'), source: plainSchema('Markdown twin label'), full: plainSchema('Markdown twin label'),
      page: plainSchema('Markdown twin label'), twin: text('Markdown twin label', { tokens: ['language'] }), markdown: plainSchema('Markdown index label'),
    }),
  }, 'the interface words');
}

const langSiteSchema = object({
  name: text('the person’s name in this language; the masthead breaks it at the first space'),
  jobTitle: text('what the person does, in a few words (structured data)'),
  description: text('one or two sentences about the person: the home’s description, share image and /llms.txt'),
  contact: object({ button: text('the call to action when there is no Work page'), subject: text('its email subject') }),
});

const homeSchema = object({ lede: text('the paragraph under the name') });

const projectsSchema = object({
  title: text('the section’s name: navigation, page title, the home’s heading'),
  description: text('one sentence: the index page’s description, the 404 and /llms.txt'),
  lede: text('the index page’s line under the title'),
  intro: text('the line under the home’s heading'),
  all: text('the home’s link to the index', { tokens: ['count'] }),
  count: pluralForms('how many projects, for the index page'),
  ctaHeading: text('the heading over the index page’s call to action'),
  projectCtaHeading: text('the heading over each project page’s call to action'),
});

const workSchema = object({
  title: text('the page’s name: navigation, title, the home’s heading'),
  description: text('one sentence: description, share image, the 404 and /llms.txt', { tokens: ['price'] }),
  lede: text('the sentence under the title'),
  price: text('the price with its currency, as written in this language, e.g. "1,500 ₾"'),
  package: text('the package’s name beside the price'),
  amount: text('the price line on the field’s edge', { tokens: ['price'] }),
  priceNote: text('the terms under the package’s name'),
  example: optional(object({
    project: slug('a project with a picture'),
    caption: text('the line under the picture', { tokens: ['project'] }),
  })),
  get: object({ heading: text('heading'), items: list(object({ term: text('what you get'), text: text('what it means') }), 'what the client gets', { min: 1 }) }),
  how: object({ heading: text('heading'), steps: list(text('a step'), 'the steps, in order', { min: 1 }) }),
  who: optional(object({ heading: text('heading'), text: text('who it is for') })),
  contact: object({
    heading: text('the call to action’s heading'), text: text('the line under it'), button: text('the button'),
    subject: text('the email’s subject'), body: optional(text('the email’s first lines')),
  }),
  teaser: object({ text: text('the home’s line about the work'), button: text('the button that leads here from other pages', { tokens: ['price'] }) }),
});

const aboutSchema = object({
  title: text('the page’s name in the navigation (its heading is the person’s name)'),
  description: text('one sentence: description, share image, the 404 and /llms.txt'),
  lede: text('the line under the name'),
  facts: list(object({ label: text('label'), value: text('value') }), 'short facts under the lede: where, how long, open to what'),
  contact: object({ heading: text('heading'), text: text('the line under it'), button: text('the button'), subject: text('the email’s subject') }),
  cv: optional(object({ label: text('label, e.g. "CV"'), href: link('the PDF in public/, e.g. "/cv.pdf"'), text: text('the link’s text, e.g. "Download (PDF, 1 page)"') })),
  sections: list(object({
    heading: text('heading, e.g. "Experience"'),
    entries: list(object({
      when: text('when, as it reads: "2023 – now"'),
      date: optional(text('the start as a date for machines: YYYY or YYYY-MM', { pattern: [/^\d{4}(-\d{2}){0,2}$/, 'must be YYYY, YYYY-MM or YYYY-MM-DD'] })),
      title: text('the role or the project'),
      href: optional(link('where the title links')),
      where: text('the company and place, or what kind of project'),
      text: text('one or two lines'),
      stack: optional(text('the tools used')),
    }), 'the entries, newest first', { min: 1 }),
  }), 'the CV’s parts', { min: 1 }),
  stack: object({ heading: text('heading'), groups: list(object({ group: text('a group, e.g. "Front end"'), items: text('what is in it') }), 'the groups', { min: 1 }) }),
  teaser: object({ heading: text('the home’s heading'), text: text('the home’s line'), link: text('the home’s link to this page') }),
});

const blogSchema = object({
  title: text('the blog’s name: navigation, page title, the feed'),
  description: text('one sentence: the index page, the feed, the 404 and /llms.txt'),
  lede: text('the index page’s line under the title'),
  empty: text('what the index says before the first post'),
  ctaHeading: text('the heading over the index page’s call to action'),
  ctaText: optional(text('a line under it')),
  postCtaHeading: text('the heading over each post’s call to action'),
  teaser: object({ text: text('the home’s line about the blog'), link: text('the home’s link to the blog before the first post') }),
});

function installTab(languages: readonly string[], kind: 'skill' | 'plain') {
  const each = (hint: string) => perLanguage(text(hint), languages, hint);
  const tokens = kind === 'skill' ? ['repo'] : [];
  return object({
    id: slug('a short name for the tab, e.g. "cli"'),
    label: each('the tab’s name'),
    short: optional(object(Object.fromEntries(languages.map((l) => [l, optional(text('a shorter name for narrow phones'))])) as Record<string, Schema<string | undefined>>)),
    commands: optional(list(text('a command', { tokens }), 'the commands, each copied on its own', { min: 1 })),
    language: optional(oneOf(['bash', 'text', 'json'] as const, 'how the commands are highlighted')),
    download: optional(object({
      ...(kind === 'skill' ? { asset: optional(text('a file attached to the release, e.g. "x-skill.zip"')) } : {}),
      href: optional(link('a file to download')),
      label: each('the download button'),
    })),
    note: each('the line under the commands'),
  });
}

const crop = object({ x: int('left edge'), y: int('top edge'), w: int('width'), h: int('height') });
const picture = object({ src: link('a file in public/'), width: int('width in pixels'), height: int('height in pixels') });

function projectSchema(languages: readonly string[], kind: 'skill' | 'plain') {
  if (kind === 'skill')
    return object({
      kind: oneOf(['skill', 'plain'] as const, 'what kind of project'),
      repo: text('the GitHub repository, "owner/name"', { pattern: [/^[\w.-]+\/[\w.-]+$/, 'must be "owner/name"'] }),
      ref: text('the tag (or branch) the page text is fetched from, e.g. "v1.0.0"'),
      install: optional(list(installTab(languages, 'skill'), 'the install box’s tabs')),
      specimen: optional(object({
        image: link('an image the skill’s docs show, its URL exactly as the docs write it'),
        crops: object({ wide: crop, phone: optional(crop) }),
        caption: optional(perLanguage(text('what the picture shows'), languages, 'caption')),
      })),
    });
  return object({
    kind: oneOf(['skill', 'plain'] as const, 'what kind of project'),
    date: date('when it was made or last changed, or a [[placeholder]] until it is known; projects are listed newest first, those without a date last'),
    link: optional(link('the project’s own address')),
    install: optional(list(installTab(languages, 'plain'), 'the install box’s tabs')),
    image: optional(object({ src: link('a file in public/'), width: int('width'), height: int('height'), phone: optional(picture) })),
  });
}

export type SiteFile = Infer<typeof siteSchema>;
export type Ui = Infer<ReturnType<typeof uiSchema>>;
export type LangSite = Infer<typeof langSiteSchema>;
export type HomeText = Infer<typeof homeSchema>;
export type ProjectsText = Infer<typeof projectsSchema>;
export type WorkText = Infer<typeof workSchema>;
export type AboutText = Infer<typeof aboutSchema>;
export type BlogText = Infer<typeof blogSchema>;
export type InstallTabFile = Infer<ReturnType<typeof installTab>>;
type SkillFile = Infer<ReturnType<typeof projectSchema>> & { kind: 'skill' };

export interface Crop { x: number; y: number; w: number; h: number }
export interface Picture { src: string; width: number; height: number }

export interface SkillProject {
  slug: string; kind: 'skill'; repo: string; ref: string;
  install: InstallTabFile[];
  specimen?: { image: string; crops: { wide: Crop; phone?: Crop }; caption?: Record<Lang, string> };
}
export interface PlainText { title: string; summary: string; category: string; status: string; imageAlt: string; imageCaption: string; body: string; file: string }
export interface PlainProject {
  slug: string; kind: 'plain'; date: string; link?: string;
  install: InstallTabFile[];
  image?: Picture & { phone?: Picture };
  /** The project's text in each language that has one. */
  texts: Record<Lang, PlainText>;
}
export type ProjectFile = SkillProject | PlainProject;

export interface Language {
  code: Lang;
  script: Script;
  ui: Ui;
  site: LangSite;
  home: HomeText;
  /** A section's texts, present when the section is on and this language has its file. */
  projects?: ProjectsText;
  work?: WorkText;
  about?: AboutText;
  blog?: BlogText;
}

export interface Content {
  /** Where the files are: <cwd>/content. */
  dir: string;
  site: SiteFile;
  /** https:// and the domain, no trailing slash. */
  url: string;
  languages: Lang[];
  primary: Lang;
  second: Lang | undefined;
  sections: Record<Section, boolean>;
  lang: Record<Lang, Language>;
  /** Every project, in the order of their files' names; lib/projects.ts sorts them by date. */
  projects: ProjectFile[];
  /** The colours every page, share image and icon is drawn in (content/site.json "colours", wine by default). */
  palette: Palette;
}

// ───────────── Reading ─────────────

const exists = (dir: string, file: string) => existsSync(join(dir, file));

/** Reads a JSON file of the content folder; a syntax error is a problem with its line, not a crash. */
function readJson(dir: string, file: string, problems: string[]): unknown {
  try {
    return JSON.parse(readFileSync(join(dir, file), 'utf8'));
  } catch (err) {
    const message = (err as Error).message.replace(/^JSON\.parse: |^Unexpected/, (m) => (m.startsWith('Unexpected') ? 'unexpected' : ''));
    problems.push(`content/${file}: is not valid JSON (${message})`);
    return undefined;
  }
}

function parseFile<T>(dir: string, file: string, schema: Schema<T>, problems: string[]): T | undefined {
  const raw = readJson(dir, file, problems);
  if (raw === undefined) return undefined;
  const ctx: Ctx = { file: `content/${file}`, problems };
  return schema.parse(raw, '', ctx);
}

/** Letters a language's texts may not contain: Georgian in a Latin-script language, and any other script anywhere. */
function checkScript(lang: Lang, file: string, value: unknown, problems: string[], at = '') {
  if (typeof value === 'string') {
    const georgian = /[Ⴀ-ჿᲐ-Ჿⴀ-⴯]/u;
    // Letters of a script the design has no font for (Cyrillic, Greek, Arabic, Han…).
    const other = /(?![\p{Script=Latin}\p{Script=Georgian}])\p{L}/u;
    const bad = value.match(other)?.[0] ?? (scriptOf(lang) === 'latin' ? value.match(georgian)?.[0] : undefined);
    if (bad) problems.push(`content/${file}: "${at}" has "${bad}", a letter of another script: ${scriptOf(lang) === 'latin' ? 'this language’s pages are Latin-script' : 'Georgian pages may use Georgian and Latin letters'} only`);
    return;
  }
  if (Array.isArray(value)) value.forEach((v, i) => checkScript(lang, file, v, problems, `${at}[${i}]`));
  else if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) if (k !== '$comment') checkScript(lang, file, v, problems, at ? `${at}.${k}` : k);
}

/** A plain project's text in one language: content/<lang>/projects/<slug>.md. */
function readPlainText(dir: string, file: string, problems: string[]): PlainText {
  const { data, body } = frontmatter(readFileSync(join(dir, file), 'utf8'));
  const known = ['title', 'summary', 'category', 'status', 'imageAlt', 'imageCaption'];
  for (const key of ['title', 'summary']) if (!data[key]?.trim()) problems.push(`content/${file}: "${key}" is missing from the frontmatter (${key === 'title' ? 'the project’s name' : 'one sentence: what it is'})`);
  for (const key of Object.keys(data)) if (!known.includes(key)) problems.push(`content/${file}: "${key}" is not a field of a project’s frontmatter (${known.join(', ')})`);
  return {
    title: data.title ?? '', summary: data.summary ?? '', category: data.category ?? '', status: data.status ?? '',
    imageAlt: data.imageAlt ?? '', imageCaption: data.imageCaption ?? '', body: body.trim(), file: `content/${file}`,
  };
}

/** Reads and checks everything under `dir`. Throws a ContentError listing every problem, one per line. */
export function loadContent(dir = join(process.cwd(), 'content')): Content {
  const problems: string[] = [];
  if (!existsSync(join(dir, 'site.json'))) throw new ContentError(['content/site.json is missing: it names the site’s domain, languages and sections']);
  const site = parseFile(dir, 'site.json', siteSchema, problems);
  if (!site) throw new ContentError(problems);

  const languages = site.languages;
  if (languages.length > 2) problems.push('content/site.json: "languages" lists more than two: one main language and at most one more');
  if (new Set(languages).size !== languages.length) problems.push('content/site.json: "languages" lists a language twice');
  const [primary, second] = languages;
  const sections = site.sections as Record<Section, boolean>;
  site.links.forEach((l, i) => {
    if (typeof l.label === 'string') return;
    for (const code of languages) if (!l.label[code]) problems.push(`content/site.json: "links[${i}].label.${code}" is missing (the link’s name in that language)`);
    for (const key of Object.keys(l.label)) if (!languages.includes(key)) problems.push(`content/site.json: "links[${i}].label.${key}" is not a language of this site (${languages.join(', ')})`);
  });

  const lang: Record<Lang, Language> = {};
  for (const code of languages) {
    const need = (file: string, why: string) => {
      if (exists(dir, file)) return true;
      problems.push(`content/${file} is missing: ${why}`);
      return false;
    };
    const uiFile = `ui/${code}.json`;
    const ui = need(uiFile, `every language needs its interface words (copy content/ui/${primary === code ? 'en' : primary}.json and translate it)`) ? parseFile(dir, uiFile, uiSchema(), problems) : undefined;
    const langSite = need(`${code}/site.json`, 'every language needs the person’s name and description') ? parseFile(dir, `${code}/site.json`, langSiteSchema, problems) : undefined;
    const home = need(`${code}/home.json`, 'every language has a home page') ? parseFile(dir, `${code}/home.json`, homeSchema, problems) : undefined;
    const language: Language = { code, script: scriptOf(code), ui: ui!, site: langSite!, home: home! };
    const sectionSchemas = { projects: projectsSchema, work: workSchema, about: aboutSchema, blog: blogSchema } as const;
    for (const section of SECTIONS) {
      if (!sections[section]) continue;
      const file = `${code}/${section}.json`;
      if (!exists(dir, file)) {
        if (code === primary) problems.push(`content/${file} is missing: the ${section} section is on (content/site.json "sections.${section}"), so the main language needs its page`);
        continue;
      }
      (language as unknown as Record<string, unknown>)[section] = parseFile(dir, file, sectionSchemas[section] as Schema<unknown>, problems);
    }
    for (const file of [uiFile, `${code}/site.json`, `${code}/home.json`, ...SECTIONS.map((s) => `${code}/${s}.json`)])
      if (exists(dir, file)) checkScript(code, file, readJson(dir, file, []), problems);
    lang[code] = language;
  }

  // Projects: content/projects/<slug>.json, and for a plain one its text in each language.
  const projects: ProjectFile[] = [];
  const projectDir = join(dir, 'projects');
  const files = existsSync(projectDir) ? readdirSync(projectDir).filter((f) => f.endsWith('.json')).sort() : [];
  for (const file of files) {
    const slugName = file.replace(/\.json$/, '');
    const where = `projects/${file}`;
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slugName)) { problems.push(`content/${where}: the file name is the project’s address, so it must be lower-case letters, digits and single hyphens`); continue; }
    const raw = readJson(dir, where, problems) as { kind?: unknown } | undefined;
    if (raw === undefined) continue;
    const kind = raw.kind === 'skill' ? 'skill' : 'plain';
    const parsed = projectSchema(languages, kind).parse(raw, '', { file: `content/${where}`, problems }) as Record<string, unknown>;
    const texts: Record<Lang, PlainText> = {};
    for (const code of languages) {
      const md = `${code}/projects/${slugName}.md`;
      if (!exists(dir, md)) continue;
      if (kind === 'skill') { problems.push(`content/${md}: ${slugName} is an agent skill (content/${where}); its text comes from its repository, so delete this file`); continue; }
      texts[code] = readPlainText(dir, md, problems);
      checkScript(code, md, texts[code], problems);
    }
    if (kind === 'skill') {
      projects.push({ slug: slugName, ...(parsed as SkillFile), install: (parsed.install as InstallTabFile[] | undefined) ?? [] } as SkillProject);
      continue;
    }
    if (!texts[primary]) problems.push(`content/${primary}/projects/${slugName}.md is missing: a plain project needs its title and summary in the main language`);
    const page = Object.values(texts).some((t) => t.body);
    if (!parsed.link && !page) problems.push(`content/${where}: "link" is missing: a plain project needs a link, or a page (text under the frontmatter of content/${primary}/projects/${slugName}.md)`);
    const image = parsed.image as PlainProject['image'];
    if (image) {
      for (const [at, pic] of [['image.src', image], ['image.phone.src', image.phone]] as const)
        if (pic && !existsSync(join(dir, '..', 'public', pic.src))) problems.push(`content/${where}: "${at}" is ${pic.src}, but public${pic.src} does not exist`);
      for (const [code, t] of Object.entries(texts)) if (!t.imageAlt) problems.push(`${t.file}: "imageAlt" is missing from the frontmatter (what the project’s picture shows, for people who cannot see it)`);
    }
    projects.push({ slug: slugName, kind: 'plain', date: parsed.date as string, link: parsed.link as string | undefined, install: (parsed.install as InstallTabFile[] | undefined) ?? [], image, texts });
  }

  // An install tab runs commands or offers a download, one of the two.
  for (const p of projects)
    p.install.forEach((tab, i) => {
      if (Boolean(tab.commands) === Boolean(tab.download)) problems.push(`content/projects/${p.slug}.json: "install[${i}]" needs either "commands" or "download"`);
      const d = tab.download as { asset?: string; href?: string } | undefined;
      if (d && Boolean(d.asset) === Boolean(d.href)) problems.push(`content/projects/${p.slug}.json: "install[${i}].download" needs either "href" or (for a skill) "asset"`);
    });

  // Cross-file checks.
  for (const code of languages) {
    const work = lang[code].work;
    if (work?.example) {
      const p = projects.find((x) => x.slug === work.example!.project);
      if (!p) problems.push(`content/${code}/work.json: "example.project" is "${work.example.project}", but content/projects/${work.example.project}.json does not exist`);
      else if (!(p.kind === 'skill' ? p.specimen : p.image)) problems.push(`content/${code}/work.json: "example.project" is "${p.slug}", which has no picture (a skill's "specimen" or a plain project's "image")`);
    }
  }

  if (problems.length) throw new ContentError(problems);
  return {
    dir, site, url: `https://${site.domain}`, languages, primary, second,
    sections, lang, projects: sections.projects ? projects : [],
    palette: palette(site.colours ?? DEFAULT_PRESET),
  };
}

let cache: Content | null = null;

/**
 * The site's content. Read once for a production build; in `next dev` and the tests every call reads
 * the folder again, so an edit shows on reload.
 */
export function getContent(): Content {
  if (cache && process.env.NODE_ENV === 'production') return cache;
  cache = loadContent();
  return cache;
}

// ───────────── Helpers the pages use ─────────────

/** A profile link's name in a language. */
export const linkLabel = (link: SiteFile['links'][number], lang: Lang) => (typeof link.label === 'string' ? link.label : link.label[lang] ?? '');

/** A page's address in a language: the main language at /, the second under /<code>. */
export function href(lang: Lang, path = '/'): string {
  const c = getContent();
  if (lang === c.primary) return path;
  return path === '/' ? `/${lang}` : `/${lang}${path}`;
}

/** Whether a section has its page in a language. */
export const has = (lang: Lang, section: Section) => Boolean(getContent().lang[lang]?.[section]);

/** The language's texts. */
export const L = (lang: Lang) => getContent().lang[lang];

/** The other language of the site, if there is one. */
export function other(lang: Lang): Lang | undefined {
  const { languages } = getContent();
  return languages.find((l) => l !== lang);
}

/**
 * Where an internal link may go. A link into a section that is off, or that the link's language does
 * not have, has nowhere to go: null, and the page keeps the link's words without the link. Anything
 * else is returned as it is (tests/links.test.ts checks every remaining link reaches a page).
 */
export function liveHref(target: string): string | null {
  if (!target.startsWith('/') || target.startsWith('//')) return target;
  const c = getContent();
  const segments = target.split(/[?#]/)[0].split('/').filter(Boolean);
  let lang = c.primary;
  if (c.second && segments[0] === c.second) { lang = c.second; segments.shift(); }
  const section = segments[0] as Section;
  if ((SECTIONS as readonly string[]).includes(section) && !has(lang, section)) return null;
  return target;
}

/** Fills `{name}` tokens: fill('From {price}', { price: '1,500 ₾' }). */
export const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (m, key: string) => (key in values ? String(values[key]) : m));

/** The plural form of `forms` for `n` in a language (Intl.PluralRules), with {n} filled. */
export function plural(lang: Lang, forms: Record<string, string | undefined>, n: number) {
  const form = forms[new Intl.PluralRules(lang).select(n)] ?? forms.other ?? '';
  return fill(form, { n });
}

/**
 * A language's name in another language: "Georgian", "ინგლისური". A Latin name is capitalised;
 * Georgian is never uppercased (its capitals, Mtavruli, are not for running text).
 */
export function languageName(code: Lang, inLang: Lang) {
  const name = new Intl.DisplayNames([inLang], { type: 'language' }).of(code) ?? code;
  return /^\p{Script=Latin}/u.test(name) ? name.charAt(0).toLocaleUpperCase(inLang) + name.slice(1) : name;
}

/** "14 Nov 2026" / "14 ნოემბერი 2026", from an ISO date and the language's interface words. */
export function formatDate(iso: string, lang: Lang) {
  const [y, m, d] = iso.split('-').map(Number);
  const { format, months } = L(lang).ui.date;
  return fill(format, { d, month: months[m - 1], y });
}

/** Every `[[…]]` in the content: what the person has not given yet. */
export function placeholders(content = getContent()): { file: string; text: string }[] {
  const found: { file: string; text: string }[] = [];
  const walk = (file: string, value: unknown) => {
    if (typeof value === 'string') for (const m of value.matchAll(/\[\[[^\]]+\]\]/g)) found.push({ file, text: m[0] });
    else if (Array.isArray(value)) value.forEach((v) => walk(file, v));
    else if (value && typeof value === 'object') Object.values(value).forEach((v) => walk(file, v));
  };
  walk('content/site.json', content.site);
  if (!content.site.photo) found.push({ file: 'content/site.json', text: '[[photo]] ("photo" is null)' });
  for (const code of content.languages) {
    const l = content.lang[code];
    for (const key of ['site', 'home', ...SECTIONS] as const) walk(`content/${code}/${key}.json`, l[key]);
  }
  for (const p of content.projects) {
    const { texts, ...own } = p as PlainProject;
    walk(`content/projects/${p.slug}.json`, own);
    if (p.kind === 'plain') for (const t of Object.values(texts)) walk(t.file, t);
  }
  return found;
}

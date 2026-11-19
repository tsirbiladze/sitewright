#!/usr/bin/env node
// sitewright scaffold: makes a person's site folder from the site template and their answers.
//
//   node scaffold.mjs --answers <answers.json> --out <new-folder> [--template <folder>] [--no-git]
//
// 1. Gets the template at this skill's version (`metadata.version` in ../SKILL.md, the one place the
//    skill reads it from): the folder template/ of https://github.com/tsirbiladze/sitewright at the tag
//    v<version>, cloned with git. `--template <folder>` or SITEWRIGHT_TEMPLATE takes a local template
//    folder instead (tests, offline); SITEWRIGHT_REPO replaces the GitHub address (tests use a local
//    repository standing in for it).
// 2. Takes the demo person out: their texts, projects, posts, pictures and CV, and their name wherever
//    else the template mentions it (its README, two comments). The template's tests/ stay as they are.
// 3. Writes the person's content from the answers (../answers.md says what they hold). Every required
//    field the answers leave open is a [[placeholder]] in the language of its file; nothing is invented.
// 4. Makes the folder a git repository with a first commit, when git has a name and email (--no-git: no).
// 5. Prints what it made: languages, sections, every file that holds a placeholder and how many, any
//    interface file still to translate, and the next commands.
//
// Exit codes: 0 made; 1 the answers are refused (one line per problem, naming the field); 2 anything
// else refused or failed: the flags, the folder, the template (one line naming it). Nothing is left
// behind on a refusal. Node 24, no dependencies: the skill is installed by copying its folder.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL_DIR = fileURLToPath(new URL('..', import.meta.url));
const REPOSITORY = 'https://github.com/tsirbiladze/sitewright';
const SECTIONS = ['projects', 'work', 'about', 'blog'];
const USAGE = 'usage: node scaffold.mjs --answers <answers.json> --out <new-folder> [--template <folder>] [--no-git]';

class Refusal extends Error {
  constructor(code, lines) {
    super(lines.join('\n'));
    this.code = code;
    this.lines = lines;
  }
}
const refuse = (code, ...lines) => { throw new Refusal(code, lines); };

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const lastLine = (text) => (text ?? '').trim().split('\n').filter(Boolean).pop()?.replace(/^(fatal|error): /, '') ?? 'no message';
const shellQuote = (s) => (/^[\w/.,:@%+=-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`);
const EN_NAMES = new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' });
const languageName = (code) => EN_NAMES.of(code) ?? code;

// ───────────── Flags ─────────────

function parseArgs(argv) {
  const opts = { git: true };
  const takes = { '--answers': 'answers', '--out': 'out', '--template': 'template' };
  const flags = [...Object.keys(takes), '--no-git', '--help', '--version'];
  for (let i = 0; i < argv.length; i++) {
    let arg = argv[i];
    let value;
    if (arg.startsWith('--') && arg.includes('=')) [arg, value] = [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)];
    if (arg === '--help' || arg === '-h') { opts.help = true; continue; }
    if (arg === '--version') { opts.version = true; continue; }
    if (arg === '--no-git') { opts.git = false; continue; }
    if (takes[arg]) {
      value ??= argv[++i];
      if (!value || value.startsWith('--')) refuse(2, `${arg} needs a value. ${USAGE}`);
      opts[takes[arg]] = value;
      continue;
    }
    const guess = nearest(arg.replace(/^-*/, '--'), flags);
    refuse(2, `${arg} is not an option${guess ? ` (did you mean ${guess}?)` : ''}. ${USAGE}`);
  }
  if (!opts.help && !opts.version) for (const flag of ['answers', 'out']) if (!opts[flag]) refuse(2, `--${flag} is missing. ${USAGE}`);
  return opts;
}

// ───────────── Small helpers ─────────────

/** Edit distance with transpositions: "emial" is one step from "email". */
function distance(a, b) {
  a = a.toLowerCase(); b = b.toLowerCase();
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  return d[a.length][b.length];
}

/** The known word `word` was probably meant to be, if one is close enough. */
function nearest(word, known) {
  const [best] = known.map((k) => [k, distance(word, k)]).sort((x, y) => x[1] - y[1]);
  return best && best[1] <= (word.length <= 5 ? 2 : 3) ? best[0] : undefined;
}

const GEORGIAN_LATIN = {
  ა: 'a', ბ: 'b', გ: 'g', დ: 'd', ე: 'e', ვ: 'v', ზ: 'z', თ: 't', ი: 'i', კ: 'k', ლ: 'l', მ: 'm', ნ: 'n', ო: 'o', პ: 'p', ჟ: 'zh',
  რ: 'r', ს: 's', ტ: 't', უ: 'u', ფ: 'p', ქ: 'k', ღ: 'gh', ყ: 'q', შ: 'sh', ჩ: 'ch', ც: 'ts', ძ: 'dz', წ: 'ts', ჭ: 'ch', ხ: 'kh', ჯ: 'j', ჰ: 'h',
};

/** An address-safe slug from any Latin or Georgian text: "Nino Nimushadze" → "nino-nimushadze". */
function slugify(text) {
  return [...text.toLowerCase()].map((ch) => GEORGIAN_LATIN[ch] ?? ch).join('')
    .replace(/ß/g, 'ss').replace(/æ/g, 'ae').replace(/œ/g, 'oe').replace(/ø/g, 'o').replace(/ł/g, 'l').replace(/đ/g, 'd').replace(/þ/g, 'th')
    .normalize('NFKD').replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50).replace(/-+$/, '');
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const PLACEHOLDER = /\[\[[^\]]+\]\]/g;
const isPlaceholder = (v) => /^\[\[[^\]]+\]\]$/.test(v.trim());
const GEORGIAN_LETTER = /[Ⴀ-ჿᲐ-Ჿⴀ-⴯]/u;
const OTHER_SCRIPT_LETTER = /(?![\p{Script=Latin}\p{Script=Georgian}])\p{L}/u;

// ───────────── The answers ─────────────

const TOP_FIELDS = ['languages', 'sections', 'name', 'jobTitle', 'email', 'domain', 'colours', 'links', 'projects'];
/** The template's colour presets (its lib/colours.ts; a test keeps the two lists the same). The first is the default. */
const PRESETS = ['wine', 'ink', 'pine', 'sea', 'walnut', 'slate'];
const TOP_ALIASES = {
  language: 'languages', lang: 'languages', langs: 'languages', section: 'sections', fullName: 'name', fullname: 'name',
  job: 'jobTitle', jobtitle: 'jobTitle', title: 'jobTitle', role: 'jobTitle', does: 'jobTitle', occupation: 'jobTitle', profession: 'jobTitle',
  mail: 'email', 'e-mail': 'email', colors: 'colours', color: 'colours', colour: 'colours', palette: 'colours', theme: 'colours', address: 'domain', site: 'domain', url: 'domain', website: 'domain',
  link: 'links', profiles: 'links', socials: 'links', project: 'projects',
};
const LINK_FIELDS = ['label', 'url'];
const LINK_ALIASES = { name: 'label', title: 'label', text: 'label', href: 'url', link: 'url', address: 'url' };
const SKILL_FIELDS = ['kind', 'repo', 'ref', 'slug'];
const PLAIN_FIELDS = ['kind', 'title', 'summary', 'link', 'date', 'slug'];
const PROJECT_ALIASES = {
  name: 'title', url: 'link', href: 'link', repository: 'repo', github: 'repo', tag: 'ref', version: 'ref', release: 'ref',
  description: 'summary', type: 'kind', made: 'date', when: 'date', year: 'date',
};

/**
 * Reads and checks the answers. Returns the answers in one shape (every text a value per language)
 * or refuses with exit 1 and one line per problem.
 */
function readAnswers(path) {
  const shown = path;
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    refuse(2, `--answers ${shown}: ${err.code === 'ENOENT' ? 'no such file' : err.message}`);
  }
  let a;
  try {
    a = JSON.parse(raw);
  } catch (err) {
    refuse(1, `${shown}: is not valid JSON (${err.message})`);
  }
  if (!isObject(a)) refuse(1, `${shown}: must be one JSON object, { "languages": […], "name": … }`);

  const problems = [];
  const bad = (at, message) => problems.push(`${shown}: ${at ? `"${at}" ` : ''}${message}`);
  bad.count = () => problems.length;
  checkKeys(a, '', TOP_FIELDS, TOP_ALIASES, bad);

  // Languages first: every text is checked against them.
  const langs = readLanguages(a.languages, bad);
  const sections = readSections(a.sections, bad);
  if (!langs) refuse(1, ...problems);

  const name = readText(a.name, 'name', langs, bad, { required: true, what: 'the person’s name' });
  const jobTitle = readText(a.jobTitle, 'jobTitle', langs, bad, { what: 'what the person does, in a few words' });
  const email = readEmail(a.email, bad);
  const domain = readDomain(a.domain, bad);
  const colours = readColours(a.colours, bad);
  const links = readLinks(a.links, langs, bad);
  const projects = readProjects(a.projects, langs, bad);
  if (projects.length && sections && !sections.includes('projects'))
    bad('projects', `lists ${projects.length} project${projects.length === 1 ? '' : 's'}, but "sections" leaves the projects section out: add "projects" to "sections", or leave the projects out`);
  if (problems.length) refuse(1, ...problems);
  return { languages: langs, sections, name, jobTitle, email, domain, colours, links, projects };
}

/** A preset's name, or the owner's own pair. Whether a pair is readable is the template's to say (pnpm check). */
function readColours(value, bad) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'string') {
    const name = value.trim().toLowerCase();
    if (PRESETS.includes(name)) return name;
    bad('colours', `is ${JSON.stringify(value)}, which is not a palette: choose one of ${PRESETS.join(', ')}, or give two colours of the owner’s own as { "field": "#rrggbb", "accent": "#rrggbb" }`);
    return null;
  }
  if (typeof value !== 'object' || Array.isArray(value)) { bad('colours', `must be a palette’s name (${PRESETS.join(', ')}) or { "field": "#rrggbb", "accent": "#rrggbb" }`); return null; }
  checkKeys(value, 'colours', ['field', 'accent'], { background: 'field', primary: 'field', main: 'field', button: 'accent', cta: 'accent', secondary: 'accent' }, bad);
  const hex = (key, what) => {
    const v = value[key];
    if (typeof v !== 'string' || !/^#[0-9a-f]{6}$/i.test(v.trim())) { bad(`colours.${key}`, `${v === undefined ? 'is missing' : `is ${JSON.stringify(v)}`}: ${what}, written #rrggbb`); return null; }
    return v.trim().toLowerCase();
  };
  const field = hex('field', 'the deep colour the name stands on');
  const accent = hex('accent', 'the colour of the one button a page has');
  return field && accent ? { field, accent } : null;
}

function checkKeys(obj, at, known, aliases, bad) {
  for (const key of Object.keys(obj)) {
    if (known.includes(key) || key.startsWith('$')) continue;
    const guess = aliases[key] ?? aliases[key.toLowerCase()] ?? nearest(key, known);
    bad(at ? `${at}.${key}` : key, `is not a field here (${guess && known.includes(guess) ? `did you mean "${guess}"?` : `the fields are ${known.join(', ')}`})`);
  }
}

function readLanguages(value, bad) {
  if (value === undefined) { bad('languages', 'is missing (the site’s languages, the main one first: ["en"] or ["ka", "en"])'); return null; }
  if (typeof value === 'string') value = [value];
  if (!Array.isArray(value) || !value.length) { bad('languages', 'must be a list of one or two language codes, the main one first: ["en"] or ["ka", "en"]'); return null; }
  if (value.length > 2) {
    bad('languages', `lists ${value.length} languages: a site has one main language and at most one more (${value.slice(0, 2).map((l) => JSON.stringify(l)).join(', ')}), so leave out ${value.slice(2).map((l) => JSON.stringify(l)).join(', ')}`);
    return null;
  }
  let ok = true;
  value.forEach((code, i) => { if (!checkLanguage(code, `languages[${i}]`, bad)) ok = false; });
  if (ok && value[0] === value[1]) { bad('languages', `lists "${value[0]}" twice`); ok = false; }
  return ok ? value : null;
}

/** A language code the template can take: known, two or three lower-case letters, Latin script or Georgian. */
function checkLanguage(code, at, bad) {
  if (typeof code !== 'string' || !code.trim()) { bad(at, 'must be a language code like "en", "ka" or "de"'); return false; }
  const base = code.trim().toLowerCase().split(/[-_]/)[0];
  let canonical;
  try { canonical = Intl.getCanonicalLocales(base)[0]; } catch { canonical = undefined; }
  const known = canonical && /^[a-z]{2,3}$/.test(canonical) && EN_NAMES.of(canonical) ? canonical : undefined;
  if (!known) {
    let country;
    try { country = /^[a-z]{2}$/.test(base) ? new Intl.Locale(`und-${base.toUpperCase()}`).maximize().language : undefined; } catch { country = undefined; }
    const region = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' }).of(base.toUpperCase());
    bad(at, country && country !== 'und' && region
      ? `is "${code}", the country code of ${region}; its language ${languageName(country)} is "${country}"`
      : `is "${code}", which is not a language code (like "en", "ka" or "de")`);
    return false;
  }
  if (code !== known) {
    bad(at, `must be written "${known}" (${languageName(known)}): two or three lower-case letters, no region`);
    return false;
  }
  const script = new Intl.Locale(known).maximize().script;
  if (script !== 'Latn' && script !== 'Geor') {
    const scriptName = script ? new Intl.DisplayNames(['en'], { type: 'script' }).of(script) : 'a script of its own';
    bad(at, `is ${languageName(known)}, written in ${scriptName}: the template takes Latin-script languages and Georgian ("ka")`);
    return false;
  }
  return true;
}

function readSections(value, bad) {
  if (value === undefined) { bad('sections', `is missing (the sections that are on: any of ${SECTIONS.map((s) => `"${s}"`).join(', ')}; [] for a home page only)`); return null; }
  if (!Array.isArray(value)) { bad('sections', `must be a list of the sections that are on: any of ${SECTIONS.map((s) => `"${s}"`).join(', ')}`); return null; }
  const out = [];
  value.forEach((s, i) => {
    if (typeof s !== 'string') return bad(`sections[${i}]`, 'must be a section’s name');
    if (s === 'home') return bad(`sections[${i}]`, `is "home", which is always there: list only ${SECTIONS.join(', ')}`);
    if (!SECTIONS.includes(s)) {
      const guess = nearest(s, SECTIONS) ?? { contact: 'work', offer: 'work', services: 'work', cv: 'about', resume: 'about', posts: 'blog', portfolio: 'projects', skills: 'projects' }[s.toLowerCase()];
      return bad(`sections[${i}]`, `is "${s}", not a section${guess ? ` (did you mean "${guess}"?)` : ''}: the sections are ${SECTIONS.join(', ')}`);
    }
    if (out.includes(s)) return bad(`sections[${i}]`, `lists "${s}" twice`);
    out.push(s);
  });
  return SECTIONS.filter((s) => out.includes(s));
}

/** Letters a language's text may not hold, as the template's own check finds them. */
function scriptProblem(text, lang) {
  const other = text.match(OTHER_SCRIPT_LETTER)?.[0];
  if (other) return `has "${other}", a letter of a script the template has no font for: it takes Latin and Georgian letters only`;
  if (lang !== 'ka' && GEORGIAN_LETTER.test(text))
    return `has "${text.match(GEORGIAN_LETTER)[0]}", a Georgian letter, but ${languageName(lang)} pages are Latin-script: write it as ${languageName(lang)} writes it`;
  return null;
}

/**
 * A text: a string (the same in every language of the site) or { "<lang>": "…" }. Returns a value per
 * language that has one; with `required`, every language must have one.
 */
function readText(value, at, langs, bad, { required = false, what }) {
  const out = {};
  const many = langs.length > 1;
  const missing = (lang) => {
    if (!required) return;
    if (!many) return bad(at, `is missing (${what})`);
    bad(`${at}.${lang}`, `is missing: the site is in ${languageName(lang)} too, so it needs ${what} as ${languageName(lang)} writes it (the same spelling in both is fine: give one string)`);
  };
  if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) {
    if (required) bad(at, `is missing (${what}${many ? `: one string, or { ${langs.map((l) => `"${l}": "…"`).join(', ')} }` : ''})`);
    return out;
  }
  if (typeof value === 'string') for (const lang of langs) out[lang] = value;
  else if (isObject(value)) {
    for (const key of Object.keys(value)) if (!langs.includes(key) && !key.startsWith('$')) bad(`${at}.${key}`, `is not a language of this site (${langs.join(', ')})`);
    for (const lang of langs) {
      const v = value[lang];
      if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) { missing(lang); continue; }
      if (typeof v !== 'string') { bad(`${at}.${lang}`, `must be text (${what})`); continue; }
      out[lang] = v;
    }
  } else {
    bad(at, `must be text (${what}): one string, or { ${langs.map((l) => `"${l}": "…"`).join(', ')} }`);
    return {};
  }
  for (const lang of Object.keys(out)) {
    out[lang] = out[lang].replace(/\s+/g, ' ').trim();
    const where = typeof value === 'string' ? at : `${at}.${lang}`;
    const problem = scriptProblem(out[lang], lang)
      ?? (/[{}]/.test(out[lang]) ? 'has { or }, which the site reads as a fill-in token: leave them out' : null)
      ?? (required && isPlaceholder(out[lang]) ? `must be ${what} itself, not a placeholder: the site cannot be made without it` : null);
    if (!problem) continue;
    bad(where, problem);
    // One string stands for every language: one problem with it is enough.
    if (typeof value === 'string') return {};
    delete out[lang];
  }
  return out;
}

const DOMAIN_LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

/** Why `host` is not a bare domain, or null. */
function domainProblem(host) {
  const labels = host.split('.');
  if (labels.length < 2) return 'must be a whole domain like "example.com"';
  if (!labels.every((l) => DOMAIN_LABEL.test(l))) return 'must be a domain of letters, digits, hyphens and dots, like "example.com"';
  if (!/^([a-z]{2,63}|xn--[a-z0-9-]+)$/.test(labels.at(-1))) return `ends in ".${labels.at(-1)}", which is not a top-level domain`;
  return null;
}

function readDomain(value, bad) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') { bad('domain', 'must be the domain as text, like "example.com", or null when there is none yet'); return null; }
  const v = value.trim();
  const scheme = v.match(/^[a-z]+:\/\//i)?.[0];
  if (scheme) { bad('domain', `must be the bare domain, without ${scheme}: "${v.slice(scheme.length).replace(/\/.*$/, '').toLowerCase()}"`); return null; }
  if (/[/?#\s]/.test(v)) { bad('domain', `must be the bare domain, without a path or spaces: "${v.split(/[/?#\s]/)[0].toLowerCase()}"`); return null; }
  if (/[^\x00-\x7f]/.test(v)) {
    let ascii;
    try { ascii = new URL(`https://${v}`).hostname; } catch { ascii = undefined; }
    bad('domain', `must be written in ASCII${ascii ? `: "${ascii}"` : ''}`);
    return null;
  }
  if (v !== v.toLowerCase()) { bad('domain', `must be lower-case: "${v.toLowerCase()}"`); return null; }
  if (v.startsWith('www.')) { bad('domain', `must be the bare domain, without www.: "${v.slice(4)}" (pnpm domain adds the www name and sends it to the bare one)`); return null; }
  const p = domainProblem(v);
  if (p) { bad('domain', p); return null; }
  return v;
}

function readEmail(value, bad) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') { bad('email', 'must be an email address as text'); return null; }
  const v = value.trim();
  if (/^mailto:/i.test(v)) { bad('email', `must be the address alone, without mailto: "${v.slice(7)}"`); return null; }
  const m = v.match(/^([^\s@]+)@([^\s@]+)$/);
  if (!m || domainProblem(m[2].toLowerCase())) { bad('email', `is "${v}", which is not an email address like "name@example.com"`); return null; }
  return v;
}

function readUrl(value, at, bad, what) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') { bad(at, `must be an address as text (${what})`); return null; }
  const v = value.trim();
  if (/^http:\/\//i.test(v)) { bad(at, `must start with https://: "https://${v.slice(7)}"`); return null; }
  let ok = /^https:\/\/\S+$/.test(v);
  if (ok) try { ok = Boolean(new URL(v).hostname.includes('.')); } catch { ok = false; }
  if (!ok) { bad(at, `is "${v}", which is not an address starting with https:// (${what})`); return null; }
  return v;
}

function readLinks(value, langs, bad) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) { bad('links', 'must be a list of { "label": …, "url": "https://…" }'); return []; }
  return value.flatMap((link, i) => {
    const at = `links[${i}]`;
    if (!isObject(link)) { bad(at, 'must be { "label": …, "url": "https://…" }'); return []; }
    checkKeys(link, at, LINK_FIELDS, LINK_ALIASES, bad);
    const url = readUrl(link.url, `${at}.url`, bad, 'where the link goes');
    if (link.label === undefined || link.label === null || link.label === '') { bad(`${at}.label`, 'is missing (the link’s name, like "GitHub")'); return []; }
    const before = bad.count();
    const label = readText(link.label, `${at}.label`, langs, bad, { what: 'the link’s name' });
    if (!Object.keys(label).length) {
      if (bad.count() === before) bad(`${at}.label`, 'needs the link’s name in at least one language of the site');
      return [];
    }
    return [{ label, sameEverywhere: typeof link.label === 'string', url }];
  });
}

const REPO = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/;
const REF = /^(?!-)(?!.*\.\.)(?!.*\/\/)[A-Za-z0-9._/-]+(?<![/.])$/;

function readProjects(value, langs, bad) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) { bad('projects', 'must be a list of projects, each { "kind": "skill", … } or { "kind": "plain", … }'); return []; }
  const projects = value.flatMap((p, i) => {
    const at = `projects[${i}]`;
    if (!isObject(p)) { bad(at, 'must be { "kind": "skill", … } or { "kind": "plain", … }'); return []; }
    let kind = p.kind;
    if (kind === undefined) {
      bad(`${at}.kind`, `is missing: "skill" (an agent skill whose page text comes from its GitHub repository) or "plain" (a project written in the site)${p.repo ? '; this one has a "repo", so probably "skill"' : ''}`);
      return [];
    }
    if (kind !== 'skill' && kind !== 'plain') {
      const guess = nearest(String(kind), ['skill', 'plain']) ?? (/agent|repo|github/i.test(String(kind)) ? 'skill' : undefined);
      bad(`${at}.kind`, `is "${kind}": it must be "skill" or "plain"${guess ? ` (did you mean "${guess}"?)` : ''}`);
      return [];
    }
    if (kind === 'skill') {
      checkKeys(p, at, SKILL_FIELDS, PROJECT_ALIASES, bad);
      let repo = null;
      if (typeof p.repo !== 'string' || !p.repo.trim()) bad(`${at}.repo`, 'is missing (the skill’s GitHub repository, "owner/name")');
      else {
        const r = p.repo.trim();
        const fromUrl = r.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+\/[^/\s]+?)(?:\.git)?\/?$/i)?.[1];
        if (fromUrl) bad(`${at}.repo`, `must be "owner/name", not an address: "${fromUrl}"`);
        else if (!REPO.test(r) || /\.git$/.test(r) || /\/\.{1,2}$/.test(r)) bad(`${at}.repo`, `is "${r}", which is not a GitHub repository written as "owner/name"`);
        else repo = r;
      }
      let ref = null;
      if (typeof p.ref !== 'string' || !p.ref.trim()) bad(`${at}.ref`, 'is missing (the release tag the page text is fetched from, like "v1.0.0")');
      else if (!REF.test(p.ref.trim())) bad(`${at}.ref`, `is "${p.ref}", which is not a tag or branch name like "v1.0.0"`);
      else ref = p.ref.trim();
      let slug = null;
      if (p.slug !== undefined) slug = readSlug(p.slug, `${at}.slug`, bad);
      else if (repo) {
        const name = repo.split('/')[1];
        if (SLUG.test(name)) slug = name;
        else bad(`${at}.slug`, `is missing: "${name}" cannot be a page address, so give the skill’s folder name under skills/ in ${repo} (lower-case letters, digits and hyphens)`);
      }
      if (!repo || !ref || !slug) return [];
      return [{ kind, repo, ref, slug, at }];
    }
    checkKeys(p, at, PLAIN_FIELDS, PROJECT_ALIASES, bad);
    const before = bad.count();
    const title = readText(p.title, `${at}.title`, langs, bad, { what: 'the project’s name' });
    if (!Object.keys(title).length && bad.count() === before) bad(`${at}.title`, 'is missing (the project’s name, in at least the main language)');
    const summary = readText(p.summary, `${at}.summary`, langs, bad, { what: 'one sentence: what the project is' });
    const link = readUrl(p.link, `${at}.link`, bad, 'the project’s own address');
    // A date the owner does not remember yet is a placeholder: the site lists that project after the dated ones.
    let date = null;
    if (p.date === undefined || p.date === null || p.date === '') date = '[[date]]';
    else if (typeof p.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(p.date) || Number.isNaN(Date.parse(`${p.date}T00:00:00Z`)) || new Date(`${p.date}T00:00:00Z`).toISOString().slice(0, 10) !== p.date)
      bad(`${at}.date`, `is ${JSON.stringify(p.date)}, which is not a date written YYYY-MM-DD`);
    else date = p.date;
    let slug = null;
    if (p.slug !== undefined) slug = readSlug(p.slug, `${at}.slug`, bad);
    else if (title[langs[0]] ?? Object.values(title)[0]) {
      // One address serves every language: the English title when there is one, else the first in Latin letters, else the main language's.
      const source = title.en ?? langs.map((l) => title[l]).find((t) => t && !GEORGIAN_LETTER.test(t)) ?? title[langs[0]] ?? Object.values(title)[0];
      slug = slugify(source);
      if (!SLUG.test(slug)) { bad(`${at}.slug`, `is missing: the title "${source}" makes no page address, so give one (lower-case letters, digits and hyphens)`); slug = null; }
    }
    if (!Object.keys(title).length || !date || !slug) return [];
    if (!title[langs[0]]) bad(`${at}.title`, `needs the name in the main language, ${languageName(langs[0])} ("${langs[0]}")`);
    return [{ kind, title, summary, link, date, slug, at }];
  });
  const seen = new Map();
  for (const p of projects) {
    if (seen.has(p.slug)) bad(`${p.at}.slug`, `is "${p.slug}", the same address as ${seen.get(p.slug)}: give one of them its own "slug"`);
    else seen.set(p.slug, p.at);
  }
  return projects;
}

function readSlug(value, at, bad) {
  if (typeof value !== 'string' || !SLUG.test(value)) { bad(at, `is ${JSON.stringify(value)}: a page address is lower-case letters, digits and single hyphens`); return null; }
  return value;
}

// ───────────── The version and the template ─────────────

function skillVersion() {
  const file = join(SKILL_DIR, 'SKILL.md');
  let src;
  try { src = readFileSync(file, 'utf8'); } catch { refuse(2, `${file} is missing: it holds the skill’s version ("metadata.version")`); }
  const fm = src.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
  const meta = fm.match(/^metadata:[ \t]*\r?\n((?:[ \t]+.*(?:\r?\n|$))*)/m)?.[1] ?? '';
  const version = meta.match(/^[ \t]+version:[ \t]*["']?([^"'\s]+)["']?[ \t]*$/m)?.[1];
  if (!version || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) refuse(2, `${file}: "metadata.version" is missing or not a version like 1.0.0`);
  return version;
}

function checkTemplate(dir, what) {
  for (const file of ['package.json', 'content/site.json', 'content/ui/en.json'])
    if (!existsSync(join(dir, file))) refuse(2, `${what}: ${join(dir, file)} is missing, so this is not the sitewright template`);
}

/** The template's folder: local, or cloned from the repository at the skill's release tag into `work`. */
function getTemplate(opts, version, work) {
  const local = opts.template ?? process.env.SITEWRIGHT_TEMPLATE;
  if (local) {
    const dir = resolve(local);
    if (!existsSync(dir) || !statSync(dir).isDirectory()) refuse(2, `${opts.template ? '--template' : 'SITEWRIGHT_TEMPLATE'} ${local}: no such folder`);
    checkTemplate(dir, opts.template ? `--template ${local}` : `SITEWRIGHT_TEMPLATE=${local}`);
    return { dir, from: dir };
  }
  const url = process.env.SITEWRIGHT_REPO || REPOSITORY;
  const tag = `v${version}`;
  const clone = join(work, 'repository');
  const r = spawnSync('git', ['-c', 'advice.detachedHead=false', 'clone', '--quiet', '--depth', '1', '--branch', tag, url, clone], {
    encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' },
  });
  if (r.error?.code === 'ENOENT') refuse(2, 'git is not installed: the template is fetched with git (install git, or pass --template <folder>)');
  if (r.status !== 0) refuse(2, `could not get the template ${tag} from ${url}: ${lastLine(r.stderr)} (offline, or no release ${tag} there: pass --template <folder>)`);
  const dir = join(clone, 'template');
  checkTemplate(dir, `${url} at ${tag}`);
  return { dir, from: `${url} at ${tag}` };
}

// What a template folder may hold that is not the template: installs, builds, local settings.
const SKIP_ANYWHERE = new Set(['node_modules', '.git', '.next', '.vercel', '.content', '.turbo']);
const SKIP_TOP = new Set(['out', 'next-env.d.ts', 'public/skills']);

function copyTemplate(from, to) {
  cpSync(from, to, {
    recursive: true,
    verbatimSymlinks: true,
    filter: (src) => {
      const rel = relative(from, src).split(sep).join('/');
      if (!rel) return true;
      const name = basename(src);
      return !(SKIP_ANYWHERE.has(name) || SKIP_TOP.has(rel) || name.startsWith('.env') || name.endsWith('.tsbuildinfo'));
    },
  });
}

const readJson = (file) => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return undefined; } };

/** What the template's demo content names: the person's names and email, and its files in public/. */
function readDemo(templateDir) {
  const content = join(templateDir, 'content');
  const names = [];
  const publicFiles = new Set();
  const site = readJson(join(content, 'site.json')) ?? {};
  const languages = Array.isArray(site.languages) ? site.languages : [];
  if (site.photo?.src) publicFiles.add(site.photo.src);
  for (const entry of readdirSync(content, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'ui' || entry.name === 'projects') continue;
    const name = readJson(join(content, entry.name, 'site.json'))?.name;
    if (typeof name === 'string' && name.trim()) names.push(name.trim());
    const cv = readJson(join(content, entry.name, 'about.json'))?.cv?.href;
    if (typeof cv === 'string' && cv.startsWith('/')) publicFiles.add(cv);
  }
  const projectDir = join(content, 'projects');
  if (existsSync(projectDir))
    for (const f of readdirSync(projectDir).filter((x) => x.endsWith('.json'))) {
      const p = readJson(join(projectDir, f));
      for (const src of [p?.image?.src, p?.image?.phone?.src]) if (typeof src === 'string' && src.startsWith('/')) publicFiles.add(src);
    }
  return { names, publicFiles: [...publicFiles], primary: languages[0] ?? 'en' };
}

function removeEmptyDirs(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) if (entry.isDirectory()) removeEmptyDirs(join(dir, entry.name));
  if (!readdirSync(dir).length) rmSync(dir, { recursive: true });
}

/** Takes the demo person out of the copy in `out`: content, pictures, CV, and their name elsewhere. */
function removeDemo(out, demo, personName) {
  const content = join(out, 'content');
  for (const entry of readdirSync(content)) if (entry !== 'ui') rmSync(join(content, entry), { recursive: true, force: true });
  const pub = join(out, 'public');
  for (const file of demo.publicFiles) rmSync(join(pub, file), { force: true });
  // Project pictures and blog images live in folders of their own by convention.
  for (const dir of ['projects', 'blog']) rmSync(join(pub, dir), { recursive: true, force: true });
  if (existsSync(pub)) for (const entry of readdirSync(pub, { withFileTypes: true })) if (entry.isDirectory()) removeEmptyDirs(join(pub, entry.name));

  // What is true only of the template as shipped (its demo person, how it is tested as a template) is in
  // one file, which a person's site does not carry. README.md is already the site's own.
  rmSync(join(out, 'TEMPLATE.md'), { force: true });

  // A comment that still names the demo person names nobody; the tests (and their fixtures) keep theirs.
  const textFile = /\.(md|mdx|ts|tsx|mts|cts|mjs|cjs|js|css|json|ya?ml|txt|svg|html)$/;
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      const rel = relative(out, path).split(sep).join('/');
      if (['content', 'public', 'tests', 'node_modules', '.git'].includes(rel)) continue;
      if (entry.isDirectory()) { walk(path); continue; }
      if (!entry.isFile() || !textFile.test(entry.name)) continue;
      const before = readFileSync(path, 'utf8');
      let text = before;
      for (const name of demo.names) text = text.split(name).join('the demo person');
      if (text !== before) writeFileSync(path, text);
    }
  };
  walk(out);
}

// ───────────── The person's content ─────────────

/**
 * The words of one language's files: `ph` is a placeholder for a fact, in the file's language (English
 * for a language other than English and Georgian, saying which language it is for); `w` is a plain
 * interface word, given in English and Georgian and a placeholder in any other language.
 */
function wordsFor(lang) {
  const name = languageName(lang);
  return {
    ph: (en, ka) => (lang === 'ka' ? `[[${ka}]]` : lang === 'en' ? `[[${en}]]` : `[[${en}, in ${name}]]`),
    w: (en, ka) => (lang === 'ka' ? ka : lang === 'en' ? en : `[[“${en}” in ${name}]]`),
  };
}

/** JSON with short objects and lists on one line, the way the template's own content is written. */
function pretty(value, indent = '') {
  const inline = (v) => {
    if (Array.isArray(v)) return `[${v.map(inline).join(', ')}]`;
    if (isObject(v)) { const e = Object.entries(v); return e.length ? `{ ${e.map(([k, x]) => `${JSON.stringify(k)}: ${inline(x)}`).join(', ')} }` : '{}'; }
    return JSON.stringify(v);
  };
  const flat = inline(value);
  if (indent && indent.length + flat.length <= 96) return flat;
  const inner = `${indent}  `;
  if (Array.isArray(value)) return value.length ? `[\n${value.map((x) => inner + pretty(x, inner)).join(',\n')}\n${indent}]` : '[]';
  if (isObject(value)) {
    const e = Object.entries(value);
    return e.length ? `{\n${e.map(([k, x]) => `${inner}${JSON.stringify(k)}: ${pretty(x, inner)}`).join(',\n')}\n${indent}}` : '{}';
  }
  return flat;
}

/** A frontmatter value the template's reader takes back as it was written. */
const fmValue = (s) => `"${s.replace(/\s+/g, ' ').trim()}"`;

/** The latin form of the person's name, for the package name and a provisional address. */
function latinName(a) {
  const latin = a.languages.map((l) => a.name[l]).find((n) => n && !GEORGIAN_LETTER.test(n));
  return slugify(latin ?? a.name[a.languages[0]]) || 'site';
}

/** Every content file of the person's site, as path → text. */
function contentFiles(a, ctx) {
  const files = new Map();
  const put = (rel, value) => files.set(rel, typeof value === 'string' ? value : `${pretty(value)}\n`);
  const [primary] = a.languages;
  const main = wordsFor(primary);
  const on = (s) => a.sections.includes(s);

  const comment = ['The site and its person, in no particular language. Written by sitewright from the person’s answers; README.md describes each field, and a [[…]] is a fact not given yet.'];
  if (ctx.provisional) comment.push(`The domain is provisional: ${ctx.domain} is the address a Vercel project named ${ctx.packageName} would get. After the first deployment, write the address Vercel gives the project, or the person’s own domain, here.`);
  put('content/site.json', {
    $comment: comment.join(' '),
    domain: ctx.domain,
    languages: a.languages,
    sections: Object.fromEntries(SECTIONS.map((s) => [s, on(s)])),
    ...(a.colours ? { colours: a.colours } : {}),
    // This file is read by every language's pages: its placeholders are short and in Latin letters.
    email: a.email ?? '[[email]]',
    links: a.links.map((link) => {
      const label = link.sameEverywhere
        ? link.label[primary]
        : Object.fromEntries(a.languages.map((l) => [l, link.label[l] ?? wordsFor(l).ph('the link’s name', 'ბმულის სახელი')]));
      const shownLabel = link.label[primary] ?? Object.values(link.label)[0];
      const latinLabel = [shownLabel, ...Object.values(link.label)].find((l) => !GEORGIAN_LETTER.test(l)) ?? 'link';
      return { label, url: link.url ?? `[[${latinLabel} URL]]` };
    }),
    photo: null,
    year: new Date().getFullYear(),
  });

  for (const lang of a.languages) {
    const { ph, w } = wordsFor(lang);
    const dir = `content/${lang}`;
    put(`${dir}/site.json`, {
      name: a.name[lang],
      jobTitle: a.jobTitle[lang] ?? ph('what you do, in a few words', 'რას საქმიანობ, რამდენიმე სიტყვით'),
      description: ph('one or two sentences about you: what you do, and for whom', 'ერთი-ორი წინადადება შენზე: რას აკეთებ და ვისთვის'),
      contact: { button: w('Email me', 'მომწერე'), subject: w('Hello from your site', 'გამარჯობა შენი საიტიდან') },
    });
    put(`${dir}/home.json`, { lede: ph('a paragraph about you: who you are, what you do, and for whom', 'აბზაცი შენზე: ვინ ხარ, რას აკეთებ და ვისთვის') });
    const ctaHeading = ph('the heading above the button at the end of the page', 'სათაური გვერდის ბოლოს, ღილაკის თავზე');
    if (on('projects'))
      put(`${dir}/projects.json`, {
        title: w('Projects', 'პროექტები'),
        description: ph('one sentence: what these projects are', 'ერთი წინადადება: რა პროექტებია ესენი'),
        lede: ph('a line under the title: what the projects are', 'ერთი ხაზი სათაურის ქვეშ: რა პროექტებია'),
        intro: ph('a line under the projects’ heading on the home page', 'ერთი ხაზი მთავარ გვერდზე, პროექტების სათაურის ქვეშ'),
        all: w('All projects', 'ყველა პროექტი'),
        count: lang === 'en' ? { one: '{n} project', other: '{n} projects' } : lang === 'ka' ? { one: '{n} პროექტი', other: '{n} პროექტი' } : { other: `{n} ${w('projects', '')}` },
        ctaHeading,
        projectCtaHeading: ph('the heading above the button at the end of each project’s page', 'სათაური თითოეული პროექტის გვერდის ბოლოს, ღილაკის თავზე'),
      });
    if (on('work'))
      put(`${dir}/work.json`, {
        title: w('Work with me', 'თანამშრომლობა'),
        description: ph('one sentence: what you offer', 'ერთი წინადადება: რას სთავაზობ'),
        lede: ph('a sentence under the title: what you offer, and to whom', 'წინადადება სათაურის ქვეშ: რას სთავაზობ და ვის'),
        price: ph('the price, with its currency', 'ფასი, ვალუტით'),
        package: ph('the offer’s name', 'შეთავაზების სახელი'),
        amount: '{price}',
        priceNote: ph('what the price includes, and how it is agreed', 'რას მოიცავს ფასი და როგორ თანხმდებით'),
        get: {
          heading: w('What you get', 'რას მიიღებ'),
          items: [{ term: ph('something a person gets', 'რას იღებს ადამიანი'), text: ph('what it means for them', 'რას ნიშნავს ეს მისთვის') }],
        },
        how: { heading: w('How it goes', 'ასე ვიმუშავებთ'), steps: [ph('the first step of working together', 'თანამშრომლობის პირველი ნაბიჯი')] },
        contact: {
          heading: w('Get in touch', 'დამიკავშირდი'),
          text: ph('a line under it: what to write to you about', 'ერთი ხაზი მის ქვეშ: რაზე მოგწერონ'),
          button: w('Email me', 'მომწერე'),
          subject: w('Working together', 'თანამშრომლობა'),
        },
        teaser: { text: ph('a line on the home page about your work', 'ერთი ხაზი მთავარ გვერდზე შენს სამუშაოზე'), button: w('Work with me', 'ვითანამშრომლოთ') },
      });
    if (on('about'))
      put(`${dir}/about.json`, {
        title: w('About', 'ჩემ შესახებ'),
        description: ph('one sentence about you, for search engines and the share image', 'ერთი წინადადება შენზე, საძიებო სისტემებისა და გაზიარების სურათისთვის'),
        lede: ph('a line under your name: what you do', 'ერთი ხაზი შენი სახელის ქვეშ: რას აკეთებ'),
        facts: [{ label: ph('a short fact’s label, like where you live', 'მოკლე ფაქტის სათაური, მაგალითად სად ცხოვრობ'), value: ph('the fact', 'თვითონ ფაქტი') }],
        contact: {
          heading: w('Contact', 'კონტაქტი'),
          text: ph('a line under it: what to write to you about', 'ერთი ხაზი მის ქვეშ: რაზე მოგწერონ'),
          button: w('Email me', 'მომწერე'),
          subject: w('Hello from your site', 'გამარჯობა შენი საიტიდან'),
        },
        sections: [{
          heading: w('Experience', 'გამოცდილება'),
          entries: [{
            when: ph('when', 'როდის'),
            title: ph('the role', 'პოზიცია'),
            where: ph('where: the company and the place', 'სად: კომპანია და ადგილი'),
            text: ph('one or two lines about it', 'ერთი-ორი ხაზი ამაზე'),
          }],
        }],
        stack: {
          heading: w('Skills', 'უნარები'),
          groups: [{ group: ph('a group of skills or tools', 'უნარების ან ხელსაწყოების ჯგუფი'), items: ph('what is in it', 'რა შედის მასში') }],
        },
        teaser: {
          heading: ph('a heading on the home page that leads here', 'სათაური მთავარ გვერდზე, რომელიც აქ მოიყვანს'),
          text: ph('a line under it', 'ერთი ხაზი მის ქვეშ'),
          link: w('More about me', 'მეტი ჩემ შესახებ'),
        },
      });
    if (on('blog')) {
      put(`${dir}/blog.json`, {
        title: w('Blog', 'ბლოგი'),
        description: ph('one sentence: what the blog is about', 'ერთი წინადადება: რაზეა ბლოგი'),
        lede: ph('a line under the title: what you write about', 'ერთი ხაზი სათაურის ქვეშ: რაზე წერ'),
        empty: w('The first post is coming soon.', 'პირველი პოსტი მალე გამოჩნდება.'),
        ctaHeading,
        postCtaHeading: ph('the heading above the button at the end of each post', 'სათაური თითოეული პოსტის ბოლოს, ღილაკის თავზე'),
        teaser: { text: ph('a line on the home page about the blog', 'ერთი ხაზი მთავარ გვერდზე ბლოგზე'), link: w('All posts', 'ყველა პოსტი') },
      });
      // The template's draft that shows every part a post can have, its links moved to this site's layout.
      const draft = ctx.postTemplate(lang);
      if (draft) put(`${dir}/blog/template.md`, draft);
    }
    if (on('projects'))
      for (const p of a.projects.filter((x) => x.kind === 'plain')) {
        const body = p.link ? '' : `\n${ph('The project’s page: what it is, who it is for and what came of it. Parts start at a ## heading.', 'პროექტის გვერდი: რა არის, ვისთვის არის და რა გამოვიდა. ნაწილები ## სათაურით იწყება.')}\n`;
        put(`${dir}/projects/${p.slug}.md`, [
          '---',
          `title: ${fmValue(p.title[lang] ?? ph('the project’s name', 'პროექტის სახელი'))}`,
          `summary: ${fmValue(p.summary[lang] ?? ph('one sentence: what the project is', 'ერთი წინადადება: რა არის ეს პროექტი'))}`,
          '---',
          body,
        ].join('\n'));
      }
  }

  if (on('projects'))
    for (const p of a.projects)
      put(`content/projects/${p.slug}.json`, p.kind === 'skill'
        ? { kind: 'skill', repo: p.repo, ref: p.ref }
        : { kind: 'plain', date: p.date, ...(p.link ? { link: p.link } : {}) });
  return files;
}

/** content/ui/<lang>.json for a language the template has no interface words for: English to translate. */
function uiCopy(templateDir, lang) {
  const ui = JSON.parse(readFileSync(join(templateDir, 'content/ui/en.json'), 'utf8'));
  const own = new Intl.DisplayNames([lang], { type: 'language', fallback: 'none' }).of(lang);
  if (own && ui.language) ui.language.name = /^\p{Script=Latin}/u.test(own) ? own.charAt(0).toLocaleUpperCase(lang) + own.slice(1) : own;
  const region = new Intl.Locale(lang).maximize().region;
  if (region && typeof ui.locale === 'string') ui.locale = `${lang}_${region}`;
  if (Array.isArray(ui.date?.months) && ui.date.months.length === 12) {
    const month = new Intl.DateTimeFormat(lang, { month: 'long', timeZone: 'UTC' });
    ui.date.months = Array.from({ length: 12 }, (_, i) => month.format(new Date(Date.UTC(2026, i, 15))));
  }
  return `${JSON.stringify(ui, null, 2)}\n`;
}

// ───────────── Git ─────────────

function makeRepository(out, version) {
  const git = (...args) => spawnSync('git', args, { cwd: out, encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  const init = git('init', '--quiet', '--initial-branch=main');
  if (init.error?.code === 'ENOENT') return 'Git: not installed, so the folder is no repository yet (the GitHub step needs one: install git, then git init).';
  if (init.status !== 0) return `Git: the folder is no repository: ${lastLine(init.stderr)}.`;
  const add = git('add', '--all');
  if (add.status !== 0) return `Git: a repository, but the files are not staged: ${lastLine(add.stderr)}.`;
  const message = `The site, made by sitewright ${version}`;
  const commit = git('-c', 'user.useConfigOnly=true', 'commit', '--quiet', '--no-verify', '-m', message);
  if (commit.status === 0) return 'Git: a repository on main with its first commit.';
  const noIdentity = /tell me who you are|useConfigOnly|empty ident|no email was given|no name was given/i.test(commit.stderr);
  return `Git: a repository with every file staged but no commit, because ${noIdentity ? 'git has no name and email set' : lastLine(commit.stderr)}. `
    + `${noIdentity ? 'Set them (git config --global user.name "…"; git config --global user.email "…"), then: ' : 'Then: '}git -C ${shellQuote(out)} commit -m ${shellQuote(message)}`;
}

// ───────────── Main ─────────────

function main(argv) {
  const opts = parseArgs(argv);
  if (opts.help) {
    console.log(`${USAGE}\nMakes a person's site folder from the sitewright template and their answers (answers.md says what they hold).`);
    return 0;
  }
  const version = skillVersion();
  if (opts.version) { console.log(version); return 0; }

  const out = resolve(opts.out);
  if (existsSync(out)) {
    if (!statSync(out).isDirectory()) refuse(2, `--out ${opts.out}: exists and is a file: give a new folder`);
    if (readdirSync(out).length) refuse(2, `--out ${opts.out}: exists and is not empty: give a new folder`);
  }
  const a = readAnswers(opts.answers);

  const work = mkdtempSync(join(tmpdir(), 'sitewright-'));
  const outExisted = existsSync(out);
  let made = false;
  try {
    const template = getTemplate(opts, version, work);
    if (`${out}${sep}`.startsWith(`${template.dir}${sep}`)) refuse(2, `--out ${opts.out}: is inside the template folder: give a folder outside it`);
    const demo = readDemo(template.dir);

    const packageName = a.domain ?? latinName(a);
    const domain = a.domain ?? `${packageName}.vercel.app`;
    const postTemplate = (lang) => {
      const source = [lang, 'en'].map((l) => join(template.dir, 'content', l, 'blog', 'template.md')).find((f) => existsSync(f));
      if (!source) return null;
      const from = basename(dirname(dirname(source)));
      const oldPrefix = from === demo.primary ? '' : `/${from}`;
      const newPrefix = lang === a.languages[0] ? '' : `/${lang}`;
      const text = readFileSync(source, 'utf8');
      return oldPrefix === newPrefix ? text : text.replace(new RegExp(`\\]\\(${oldPrefix.replace('/', '\\/')}\\/(?!\\/)`, 'g'), `](${newPrefix}/`);
    };
    const files = contentFiles(a, { domain, packageName, provisional: !a.domain, postTemplate });

    mkdirSync(out, { recursive: true });
    made = true;
    copyTemplate(template.dir, out);
    removeDemo(out, demo, a.name[a.languages[0]]);
    for (const [rel, text] of files) {
      mkdirSync(dirname(join(out, rel)), { recursive: true });
      writeFileSync(join(out, rel), text);
    }
    const translate = [];
    for (const lang of a.languages) {
      const rel = `content/ui/${lang}.json`;
      if (existsSync(join(out, rel))) continue;
      writeFileSync(join(out, rel), uiCopy(template.dir, lang));
      translate.push(`${rel} (a copy of the English interface words: the language’s name, locale and months are set, every other word is English)`);
      if (files.has(`content/${lang}/blog/template.md`)) translate.push(`content/${lang}/blog/template.md (the English draft that shows every part a post can have)`);
    }
    const pkgFile = join(out, 'package.json');
    const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'));
    pkg.name = packageName;
    writeFileSync(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`);

    // Every [[placeholder]] in the files written, the way `pnpm check` counts them (the post draft aside).
    const counts = [];
    const inValues = (v) => (typeof v === 'string' ? (v.match(PLACEHOLDER) ?? []).length
      : Array.isArray(v) ? v.reduce((s, x) => s + inValues(x), 0)
        : isObject(v) ? Object.entries(v).reduce((s, [k, x]) => s + (k === '$comment' ? 0 : inValues(x)), 0) : 0);
    for (const [rel, text] of files) {
      if (rel.endsWith('/blog/template.md')) continue;
      const n = rel.endsWith('.json') ? inValues(JSON.parse(text)) + (rel === 'content/site.json' ? 1 : 0) /* "photo": null */ : inValues(text);
      if (n) counts.push([rel, n]);
    }
    counts.sort((x, y) => x[0].localeCompare(y[0]));
    const total = counts.reduce((s, [, n]) => s + n, 0);
    const gitLine = opts.git ? makeRepository(out, version) : 'Git: not made a repository (--no-git).';

    const [primary, second] = a.languages;
    const off = SECTIONS.filter((s) => !a.sections.includes(s));
    const lines = [
      `Made ${out} from the sitewright template ${version} (${template.from}).`,
      `Languages: ${primary} (main, at /)${second ? `, ${second} (at /${second}/)` : ''}.`,
      `Sections: home${a.sections.length ? `, ${a.sections.join(', ')}` : ''}${off.length ? `; off: ${off.join(', ')}` : ''}.`,
      a.domain
        ? `Domain: ${domain}. Package: ${packageName}.`
        : `Domain: ${domain}, provisional (no domain yet): name the Vercel project ${packageName}, and after the first deployment write the address Vercel gives it in content/site.json "domain". Package: ${packageName}.`,
    ];
    if (a.projects.length) lines.push(`Projects: ${a.projects.map((p) => (p.kind === 'skill' ? `${p.slug} (agent skill, ${p.repo} at ${p.ref})` : `${p.slug} (plain)`)).join(', ')}.`);
    if (a.projects.some((p) => p.kind === 'skill')) lines.push('Agent skills: the build fetches each one’s page text from GitHub (docs/<slug>.md at its ref, and skills/<slug>/SKILL.md), so each repository must be public and have them.');
    lines.push(`Placeholders: ${total} in ${counts.length} files, each a fact still to write (pnpm check lists them):`);
    for (const [rel, n] of counts) lines.push(`  ${rel}: ${n}`);
    for (const t of translate) lines.push(`Translate: ${t}.`);
    lines.push(gitLine);
    const fetch = a.projects.some((p) => p.kind === 'skill') ? ' && pnpm fetch-skills' : '';
    lines.push(`Next: cd ${shellQuote(out)} && pnpm install${fetch} && pnpm check; then write the texts with the person (pnpm dev shows every [[…]] as a dashed box).`);
    console.log(lines.join('\n'));
    return 0;
  } catch (err) {
    if (made) {
      if (outExisted) for (const entry of readdirSync(out)) rmSync(join(out, entry), { recursive: true, force: true });
      else rmSync(out, { recursive: true, force: true });
    }
    throw err;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (err) {
  if (!(err instanceof Refusal)) throw err;
  console.error(err.lines.join('\n'));
  process.exitCode = err.code;
}

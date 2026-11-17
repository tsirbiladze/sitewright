// A throwaway copy of the site for a test, in a temporary directory made the working directory, where
// lib/content.ts reads it. Its content/ and public/ are the demo kept in tests/fixtures/site/ (the
// fictional person the template ships with), never the live content/: a person's site keeps passing
// these tests after every sentence of its content has changed. A test can add the fixture agent skill,
// change a file, or put the site into one of the shapes of scripts/lib/shapes.mjs.
// tests/live-content.test.ts is the one that reads the live content/, with { live: true }.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyShape } from '../scripts/lib/shapes.mjs';

export const fixtures = new URL('./fixtures/', import.meta.url).pathname;
export const root = new URL('../', import.meta.url).pathname;
/** The demo the tests run on: a copy of the content/ and public/ the template ships with. */
export const demo = join(fixtures, 'site');
/** The fixture skill's slug: content/projects/fixture.json, its fetched text in .content/skills/fixture. */
export const slug = 'fixture';
export const siteUrl = 'https://example.com';

/** Every copy this test process made, removed when it ends. */
const made: string[] = [];
process.on('exit', () => {
  process.chdir(root);
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

export interface SiteOptions {
  /** Add the fixture agent skill (as if scripts/fetch-skills.mjs had fetched it), with these overlays from tests/fixtures. */
  skill?: boolean | string[];
  /** One of scripts/lib/shapes.mjs: 'en', 'en+de', 'no-blog'… */
  shape?: string;
  /** Copy the site's live content/ and public/ instead of the demo (tests/live-content.test.ts only). */
  live?: boolean;
}

/**
 * Makes a copy of the site the working directory and returns its path. Call it before the first
 * call into lib/ that reads content (lib/content.ts reads <cwd>/content on every call outside a
 * production build, so later edits show too). The repo's `assets/` is linked in for lib/og.tsx.
 */
export function useSite({ skill = false, shape, live = false }: SiteOptions = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'sitewright-test-'));
  made.push(dir);
  const from = live ? root : demo;
  cpSync(join(from, 'content'), join(dir, 'content'), { recursive: true });
  if (existsSync(join(from, 'public'))) cpSync(join(from, 'public'), join(dir, 'public'), { recursive: true, filter: (src) => !src.startsWith(join(from, 'public/skills')) });
  else mkdirSync(join(dir, 'public'));
  symlinkSync(join(root, 'assets'), join(dir, 'assets'));
  if (shape) applyShape(dir, shape);
  if (skill) addSkill(dir, Array.isArray(skill) ? skill : []);
  process.chdir(dir);
  // Outside a production build every call reads the folder again, which the tests rely on.
  delete (process.env as Record<string, string | undefined>).NODE_ENV;
  return dir;
}

/** Adds the fixture skill: its project file, and its "fetched" text with any overlays copied over it. */
export function addSkill(dir: string, overlays: string[] = []) {
  cpSync(join(fixtures, 'skill-project.json'), join(dir, 'content/projects', `${slug}.json`));
  for (const from of ['skill', ...overlays]) cpSync(join(fixtures, from), join(dir, '.content/skills', slug), { recursive: true });
}

/**
 * Stands in for the fetched text of an agent skill `name` of any site (tests/live-content.test.ts): the
 * fixture skill's text, in every language of the site, without what belongs to the fixture alone. Its
 * links into a site (`/skills/fixture/rules`) keep their words and lose the link, and its picture keeps
 * its address on GitHub (no images.json), since no site has the fixture's pages or files.
 */
export function standInSkill(dir: string, name: string, languages: string[]) {
  const into = join(dir, '.content/skills', name);
  cpSync(join(fixtures, 'skill'), into, { recursive: true });
  rmSync(join(into, 'images.json'), { force: true });
  for (const lang of languages) {
    const from = existsSync(join(into, `${lang}.md`)) ? `${lang}.md` : 'en.md';
    const text = readFileSync(join(into, from), 'utf8').replace(/(?<!!)\[([^\]]+)\]\(\/[^)\s]*\)/g, '$1');
    writeFileSync(join(into, `${lang}.md`), text);
  }
}

/** Reads a JSON file of the copy's content, lets `change` edit it, writes it back. */
export function editJson(file: string, change: (data: any) => void) {
  const path = join(process.cwd(), 'content', file);
  const data = JSON.parse(readFileSync(path, 'utf8'));
  change(data);
  writeFileSync(path, JSON.stringify(data, null, 2));
}

export const writeContent = (file: string, text: string) => writeFileSync(join(process.cwd(), 'content', file), text);
export const removeContent = (file: string) => rmSync(join(process.cwd(), 'content', file), { recursive: true, force: true });

// The frontmatter of a Markdown file: blog posts, plain projects' texts, and a skill's docs and SKILL.md.

/** A frontmatter value: a string, or one level of nested `key: value` lines. */
export type FrontmatterValue = string | { [key: string]: string };
/** Frontmatter as read, before anything is assumed about it: read it with `fmString` and `fmNested`. */
export type Frontmatter = { [key: string]: FrontmatterValue | undefined };

/**
 * Minimal frontmatter reader: `key: value` lines and one level of nesting. Values are not checked
 * against `T`. The default suits flat frontmatter (blog posts), where every value is a string; pass
 * `Frontmatter` to get the honest union and narrow it.
 */
export function frontmatter<T extends Frontmatter = { [key: string]: string }>(src: string): { data: T; body: string } {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { data: {} as T, body: src };
  const data: Frontmatter = {};
  let parent: Record<string, string> | null = null;
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^(\s*)([\w-]+):\s*(.*)$/);
    if (!kv) continue;
    const [, indent, key, rawValue] = kv;
    const value = rawValue.replace(/^["'](.*)["']$/, '$1');
    if (indent && parent) parent[key] = value;
    else if (value === '') { parent = {}; data[key] = parent; }
    else { data[key] = value; parent = null; }
  }
  return { data: data as T, body: src.slice(m[0].length) };
}

/** A top-level frontmatter string; '' when it is missing or nested. */
export const fmString = (v: FrontmatterValue | undefined) => (typeof v === 'string' ? v : '');
/** A string one level down (`metadata.version`); undefined when it is missing. */
export const fmNested = (v: FrontmatterValue | undefined, key: string) => (typeof v === 'object' ? v[key] : undefined);

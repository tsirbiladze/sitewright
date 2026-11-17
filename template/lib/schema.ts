// A small checker for the content files (lib/content.ts). Every problem is one line that names the
// file and the field, the way a person or an agent can find it: `content/en/work.json: "lede" is
// missing (the sentence under the title)`. A schema also gives the TypeScript type of what it checks,
// so the files' shape is written once.
import { editDistance } from './suggest';

/** Where a value is, and where its problems go. */
export interface Ctx { file: string; problems: string[] }

export interface Schema<T> {
  /** Checks `value` (found at `at`, a field path like `get.items[2].term`) and returns it typed. */
  parse(value: unknown, at: string, ctx: Ctx): T;
  /** Absent (undefined) is allowed. */
  optional: boolean;
  /** What the value is, for messages: `text`, `true or false`. */
  what: string;
}

export type Infer<S> = S extends Schema<infer T> ? T : never;

/** One problem, one line. */
export function problem(ctx: Ctx, at: string, message: string) {
  ctx.problems.push(`${ctx.file}: ${at ? `"${at}" ` : ''}${message}`);
}

const join = (at: string, key: string | number) => (typeof key === 'number' ? `${at}[${key}]` : at ? `${at}.${key}` : key);
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** `{name}` tokens in a text, e.g. `{price}`. */
export const tokensIn = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);

interface TextOptions {
  /** The `{name}` tokens this text may use; any other is a problem. */
  tokens?: string[];
  /** A pattern the text must match, and what it means when it does not. */
  pattern?: [RegExp, string];
}

/** A non-empty string. `hint` says what it is for, in the message when it is missing. */
export function text(hint: string, options: TextOptions = {}): Schema<string> {
  return {
    optional: false,
    what: hint,
    parse(value, at, ctx) {
      if (typeof value !== 'string' || !value.trim()) {
        problem(ctx, at, value === undefined ? `is missing (${hint})` : `must be text (${hint})`);
        return '';
      }
      const unknown = tokensIn(value).filter((t) => !(options.tokens ?? []).includes(t));
      if (unknown.length)
        problem(ctx, at, `uses {${unknown[0]}}, which this text cannot fill${options.tokens?.length ? ` (it can use ${options.tokens.map((t) => `{${t}}`).join(', ')})` : ''}`);
      if (options.pattern && !options.pattern[0].test(value) && !isPlaceholder(value)) problem(ctx, at, options.pattern[1]);
      return value;
    },
  };
}

/** A string that may be empty: a word some languages leave out (the "?" after a suggestion). */
export function textOrEmpty(hint: string): Schema<string> {
  return {
    optional: false,
    what: hint,
    parse(value, at, ctx) {
      if (typeof value !== 'string') problem(ctx, at, value === undefined ? `is missing (${hint}; "" when there is none)` : `must be text (${hint})`);
      return typeof value === 'string' ? value : '';
    },
  };
}

/** A whole value that is only a placeholder: `[[LinkedIn URL]]`. */
export const isPlaceholder = (value: string) => /^\[\[[^\]]+\]\]$/.test(value.trim());

/** A link: `https://…`, `mailto:…`, a path on the site (`/…`), or a placeholder `[[…]]`. */
export const link = (hint: string) => text(hint, { pattern: [/^(https:\/\/[^\s]+|mailto:[^\s]+|\/[^\s]*)$/, 'must be a link: https://…, mailto:… or a path on this site starting with /'] });
export const date = (hint: string) => text(hint, { pattern: [/^\d{4}-\d{2}-\d{2}$/, 'must be a date as YYYY-MM-DD'] });
export const slug = (hint: string) => text(hint, { pattern: [/^[a-z0-9]+(-[a-z0-9]+)*$/, 'must be a slug: lower-case letters, digits and single hyphens'] });

export function bool(hint: string): Schema<boolean> {
  return {
    optional: false,
    what: 'true or false',
    parse(value, at, ctx) {
      if (typeof value !== 'boolean') problem(ctx, at, value === undefined ? `is missing (${hint}: true or false)` : 'must be true or false');
      return value === true;
    },
  };
}

export function int(hint: string): Schema<number> {
  return {
    optional: false,
    what: 'a whole number',
    parse(value, at, ctx) {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) problem(ctx, at, value === undefined ? `is missing (${hint})` : `must be a whole number (${hint})`);
      return typeof value === 'number' ? value : 0;
    },
  };
}

export function oneOf<const T extends string>(values: readonly T[], hint: string): Schema<T> {
  return {
    optional: false,
    what: values.join(' or '),
    parse(value, at, ctx) {
      if (typeof value !== 'string' || !values.includes(value as T))
        problem(ctx, at, value === undefined ? `is missing (${hint}: ${values.join(' or ')})` : `must be ${values.map((v) => `"${v}"`).join(' or ')}`);
      return value as T;
    },
  };
}

export function optional<T>(inner: Schema<T>): Schema<T | undefined> {
  return { optional: true, what: inner.what, parse: (value, at, ctx) => (value === undefined ? undefined : inner.parse(value, at, ctx)) };
}

/** `null` means "not given yet" (the page shows a placeholder); a value is checked. */
export function nullable<T>(inner: Schema<T>): Schema<T | null> {
  return { optional: false, what: `${inner.what} or null`, parse: (value, at, ctx) => (value === null ? null : inner.parse(value, at, ctx)) };
}

export function list<T>(of: Schema<T>, hint: string, { min = 0 } = {}): Schema<T[]> {
  return {
    optional: false,
    what: `a list (${hint})`,
    parse(value, at, ctx) {
      if (!Array.isArray(value)) {
        problem(ctx, at, value === undefined ? `is missing (${hint})` : `must be a list (${hint})`);
        return [];
      }
      if (value.length < min) problem(ctx, at, `needs at least ${min} ${min === 1 ? 'entry' : 'entries'} (${hint})`);
      return value.map((v, i) => of.parse(v, join(at, i), ctx));
    },
  };
}

type Fields = Record<string, Schema<unknown>>;
type ObjectOf<F extends Fields> = { [K in keyof F]: Infer<F[K]> };

/**
 * An object with exactly these fields. A field the schema does not know is a problem too (most often
 * a typo), with the nearest known name suggested. `$comment` is allowed anywhere, for notes.
 */
export function object<F extends Fields>(fields: F, hint = 'a group of fields', unknownMessage?: (key: string) => string): Schema<ObjectOf<F>> {
  return {
    optional: false,
    what: hint,
    parse(value, at, ctx) {
      const out: Record<string, unknown> = {};
      if (!isObject(value)) {
        problem(ctx, at, value === undefined ? `is missing (${hint})` : `must be ${hint}, written as { … }`);
        for (const key of Object.keys(fields)) out[key] = undefined;
        return out as ObjectOf<F>;
      }
      for (const [key, schema] of Object.entries(fields)) {
        if (value[key] === undefined && schema.optional) { out[key] = undefined; continue; }
        out[key] = schema.parse(value[key], join(at, key), ctx);
      }
      for (const key of Object.keys(value)) {
        if (key in fields || key === '$comment') continue;
        if (unknownMessage) { problem(ctx, join(at, key), unknownMessage(key)); continue; }
        const near = Object.keys(fields).map((k) => [k, editDistance(key, k)] as const).sort((a, b) => a[1] - b[1])[0];
        problem(ctx, join(at, key), `is not a field here${near && near[1] <= 3 ? ` (did you mean "${near[0]}"?)` : ''}`);
      }
      return out as ObjectOf<F>;
    },
  };
}

/** A text for each language of the site: `{ "en": "…", "ka": "…" }`. */
export function perLanguage<T>(of: Schema<T>, languages: readonly string[], hint: string): Schema<Record<string, T>> {
  return {
    optional: false,
    what: `one ${hint} per language (${languages.join(', ')})`,
    parse(value, at, ctx) {
      const out: Record<string, T> = {};
      if (!isObject(value)) {
        problem(ctx, at, value === undefined ? `is missing (${hint}, one per language: ${languages.join(', ')})` : `must be { ${languages.map((l) => `"${l}": …`).join(', ')} }`);
        return out;
      }
      for (const lang of languages) out[lang] = of.parse(value[lang], join(at, lang), ctx);
      for (const key of Object.keys(value)) if (!languages.includes(key)) problem(ctx, join(at, key), `is not a language of this site (${languages.join(', ')})`);
      return out;
    },
  };
}

/** A word that is the same in every language ("GitHub"), or one per language: { "en": "Code", "ka": "კოდი" }. */
export function textOrPerLanguage(hint: string): Schema<string | Record<string, string>> {
  const one = text(hint);
  return {
    optional: false,
    what: hint,
    parse(value, at, ctx) {
      if (!isObject(value)) return one.parse(value, at, ctx);
      return Object.fromEntries(Object.entries(value).filter(([k]) => k !== '$comment').map(([k, v]) => [k, one.parse(v, join(at, k), ctx)]));
    },
  };
}

/** Plural forms (`one`, `few`, `other`… as Intl.PluralRules names them), each a text with `{n}`. `other` is required. */
export function plural(hint: string): Schema<Record<string, string>> {
  const form = text(hint, { tokens: ['n'] });
  const forms = ['zero', 'one', 'two', 'few', 'many', 'other'] as const;
  return object(Object.fromEntries(forms.map((f) => [f, f === 'other' ? form : optional(form)])) as Record<(typeof forms)[number], Schema<string | undefined>>, `${hint}: { "one": "{n} …", "other": "{n} …" }`) as unknown as Schema<Record<string, string>>;
}

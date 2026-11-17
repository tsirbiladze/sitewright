// `node --import ./tests/register.mjs --test` lets the tests import the app's TypeScript the way Next
// resolves it: extensionless relative imports, the `@/` alias and JSON imports without `with { type }`.
// Node 24 strips the types of .ts files itself; .tsx (JSX) goes through TypeScript's own transpiler,
// already a dev dependency, so the share images and components can be tested too. The font modules
// a layout or a project page gets by its language ('site-fonts/*', aliased by next.config.ts) resolve
// to tests/stubs/fonts.ts: next/font works only inside Next's build.
import { existsSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = new URL('..', import.meta.url);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('site-fonts/')) specifier = new URL('tests/stubs/fonts.ts', root).href;
    if (specifier.startsWith('@/')) specifier = new URL(specifier.slice(2), root).href;
    if (/^(\.{1,2}\/|file:)/.test(specifier) && !/\.(m?[jt]sx?|json)$/.test(specifier)) {
      const base = new URL(specifier, context.parentURL);
      const hit = ['.ts', '.tsx', '/index.ts'].map((ext) => new URL(base.href + ext)).find((u) => existsSync(fileURLToPath(u)));
      if (hit) specifier = hit.href;
    }
    let resolved;
    try {
      resolved = nextResolve(specifier, context);
    } catch (err) {
      // Bundlers resolve `next/og` to next/og.js; Node's ESM resolver wants the extension (next has no "exports").
      if (err?.code !== 'ERR_MODULE_NOT_FOUND' || !/^[\w@][^:]*\/[^.]+$/.test(specifier)) throw err;
      resolved = nextResolve(`${specifier}.js`, context);
    }
    return specifier.endsWith('.json') ? { ...resolved, importAttributes: { type: 'json' } } : resolved;
  },
  load(url, context, nextLoad) {
    if (!url.startsWith('file:') || !url.endsWith('.tsx')) return nextLoad(url, context);
    const file = fileURLToPath(url);
    const { outputText } = ts.transpileModule(readFileSync(file, 'utf8'), {
      fileName: file,
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023, sourceMap: false },
    });
    return { format: 'module', source: outputText, shortCircuit: true };
  },
});

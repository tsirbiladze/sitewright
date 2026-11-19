// The slow run, kept out of the default one: a scaffolded site installs, passes `pnpm check`,
// `pnpm typecheck`, builds, and passes its own unit tests. Run it with `npm run test:e2e`
// (SITEWRIGHT_E2E=1), outside any command sandbox: pnpm installs from this machine's store, with the
// template's minimumReleaseAge and no exclusions. An agent skill's page text comes from a local stand-in
// for raw.githubusercontent.com (SKILLS_RAW_BASE) on a port from 4340 to 4349, serving the template's
// fixture skill the way its own `pnpm shapes` does.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { fullAnswers, made, person } from './helpers.mjs';

const enabled = process.env.SITEWRIGHT_E2E === '1';

const sites = {
  'two languages, every section, an agent skill and plain projects': fullAnswers(),
  'one language, no projects': { languages: ['en'], sections: ['work', 'about', 'blog'], name: person.en, email: person.email },
  'Georgian first, English second, plain projects only, no domain': fullAnswers({
    languages: ['ka', 'en'],
    name: { ka: person.ka, en: person.en },
    domain: null,
    projects: fullAnswers().projects.filter((p) => p.kind === 'plain'),
  }),
};

/** raw.githubusercontent.com/example/fixture/v0.2.0/<path>, served from the template's fixture skill. */
async function standIn(fixtures) {
  const files = { 'docs/fixture.md': 'en.md', 'docs/fixture.ka.md': 'ka.md', 'skills/fixture/SKILL.md': 'SKILL.md', 'CHANGELOG.md': 'CHANGELOG.md' };
  const server = createServer((req, res) => {
    const file = files[(req.url ?? '').replace(/^\/example\/fixture\/v0\.2\.0\//, '')];
    if (!file) return res.writeHead(404).end();
    res.writeHead(200).end(readFileSync(join(fixtures, file)));
  });
  for (let port = 4340; port <= 4349; port++) {
    const ok = await new Promise((resolve) => {
      server.once('error', () => resolve(false));
      server.listen(port, '127.0.0.1', () => resolve(true));
    });
    if (ok) return { server, base: `http://127.0.0.1:${port}` };
  }
  throw new Error('no free port from 4340 to 4349 for the stand-in');
}

/**
 * Runs pnpm in the site without blocking this process (the stand-in answers meanwhile). Without
 * NODE_TEST_CONTEXT, which this test runner sets: with it, the site's own `node --test` would run no file.
 */
function pnpm(cwd, args, env) {
  const base = { ...process.env };
  delete base.NODE_TEST_CONTEXT;
  return new Promise((resolve) => {
    const child = spawn('pnpm', args, { cwd, env: { ...base, NEXT_TELEMETRY_DISABLED: '1', ...env } });
    let output = '';
    child.stdout.on('data', (d) => { output += d; });
    child.stderr.on('data', (d) => { output += d; });
    const timer = setTimeout(() => child.kill('SIGTERM'), 15 * 60_000);
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, output }); });
  });
}

const tail = (text, n = 60) => text.trim().split('\n').slice(-n).join('\n');

for (const [name, answers] of Object.entries(sites))
  describe(name, { skip: !enabled && 'set SITEWRIGHT_E2E=1 (pnpm test:e2e) to run it' }, () => {
    const skill = (answers.projects ?? []).some((p) => p.kind === 'skill');
    let out;
    let stand;
    let env = {};
    before(async () => {
      out = made(answers).out;
      if (skill) {
        stand = await standIn(join(out, 'tests/fixtures/skill'));
        env = { SKILLS_RAW_BASE: stand.base, NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost' };
      }
    });
    after(() => stand?.server.close());

    const step = (title, args, { retry } = {}) =>
      test(title, { timeout: 20 * 60_000 }, async (t) => {
        let r = await pnpm(out, args, env);
        if (r.code !== 0 && retry?.test(r.output)) {
          t.diagnostic('ran again after Next’s one-time upgrade notice');
          r = await pnpm(out, args, env);
        }
        assert.equal(r.code, 0, `pnpm ${args.join(' ')} in ${out}:\n${tail(r.output)}`);
        if (args[0] === 'test') assert.match(r.output, /^ℹ pass [1-9]\d*$/m, 'the site’s unit tests ran');
        t.diagnostic(tail(r.output, args[0] === 'test' ? 12 : 4).replace(/\n/g, ' | '));
      });

    step('pnpm install', ['install', '--frozen-lockfile', '--prefer-offline']);
    if (skill) step('pnpm fetch-skills', ['fetch-skills']);
    step('pnpm check', ['check']);
    step('pnpm typecheck', ['typecheck']);
    step('pnpm build', ['build'], { retry: /SecurityFatalError/ });
    step('pnpm test', ['test']);
  });

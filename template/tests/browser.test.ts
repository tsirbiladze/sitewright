// The browser the QA scripts drive (scripts/lib/browser.mjs): CHROMIUM= first, then Chrome, Chromium,
// Edge or Brave where each usually lives on macOS, Linux and Windows; none found is one line naming
// the variable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { browserPath, candidates } from '../scripts/lib/browser.mjs';
import { root } from './helpers';

test('macOS, Linux and Windows: each browser where it is usually installed', () => {
  assert.equal(candidates('darwin')[0], '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
  assert.ok(candidates('darwin').includes('/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'));
  const linux = candidates('linux', { PATH: '/usr/local/bin:/usr/bin' });
  assert.equal(linux[0], '/usr/local/bin/google-chrome');
  for (const p of ['/usr/bin/chromium-browser', '/usr/bin/chromium', '/usr/bin/microsoft-edge', '/usr/bin/brave-browser', '/snap/bin/chromium']) assert.ok(linux.includes(p), p);
  const windows = candidates('win32', { PROGRAMFILES: 'C:\\Program Files', LOCALAPPDATA: 'C:\\Users\\a\\AppData\\Local' });
  assert.equal(windows[0], 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe');
  assert.ok(windows.includes('C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'));
  assert.ok(windows.includes('C:\\Users\\a\\AppData\\Local\\BraveSoftware\\Brave-Browser\\Application\\brave.exe'));
});

test('the first browser that exists; CHROMIUM= overrides the search', () => {
  const have = new Set(['/usr/bin/chromium', '/opt/brave.com/brave/brave']);
  const exists = (p: string) => have.has(p);
  assert.equal(browserPath({ platform: 'linux', env: { PATH: '/usr/bin' }, exists }), '/usr/bin/chromium');
  assert.equal(browserPath({ platform: 'linux', env: { PATH: '/usr/bin', CHROMIUM: '/opt/brave.com/brave/brave' }, exists }), '/opt/brave.com/brave/brave');
});

test('no browser, or CHROMIUM= naming nothing: one line that names the variable, exit 2', () => {
  /** browserPath's refusal: what it printed and the exit code it asked for. */
  const refusal = (env: Record<string, string>) => {
    const { exit } = process;
    const { error } = console;
    const lines: string[] = [];
    console.error = (line: string) => { lines.push(line); };
    (process as { exit: (code?: number) => never }).exit = (code?: number) => { throw Object.assign(new Error('exit'), { code }); };
    try {
      browserPath({ platform: 'linux', env, exists: () => false });
      return { code: undefined, lines };
    } catch (err) {
      return { code: (err as { code?: number }).code, lines };
    } finally {
      process.exit = exit;
      console.error = error;
    }
  };
  assert.deepEqual(refusal({ PATH: '/usr/bin' }), { code: 2, lines: ['No Chrome, Chromium, Edge or Brave found where they are usually installed; set CHROMIUM=/path/to/the/browser'] });
  const wrong = refusal({ PATH: '/usr/bin', CHROMIUM: '/nowhere/chrome' });
  assert.equal(wrong.code, 2);
  assert.equal(wrong.lines.length, 1);
  assert.match(wrong.lines[0], /^CHROMIUM=\/nowhere\/chrome: there is no browser at that path; set CHROMIUM to /);
});

test('the QA scripts take their browser from it', () => {
  for (const script of ['qa', 'shot', 'axe', 'lighthouse']) {
    const src = spawnSync('cat', [join(root, 'scripts', `${script}.mjs`)], { encoding: 'utf8' }).stdout;
    assert.match(src, /import \{ browserPath \} from '\.\/lib\/browser\.mjs';/, script);
    assert.doesNotMatch(src, /chromium-browser/, script);
  }
});

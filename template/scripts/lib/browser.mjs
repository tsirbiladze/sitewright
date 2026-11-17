// The browser the QA scripts drive (qa, shot, axe, lighthouse, fit): CHROMIUM= when it is set, otherwise
// the first Chrome, Chromium, Edge or Brave found where each is usually installed on macOS, Linux and
// Windows. None found: one line that says so and names the variable, and exit 2.
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';

/** Where each browser usually lives, per platform, in the order they are tried. */
export function candidates(platform = process.platform, env = process.env) {
  if (platform === 'darwin') {
    const apps = [
      'Google Chrome.app/Contents/MacOS/Google Chrome',
      'Chromium.app/Contents/MacOS/Chromium',
      'Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      'Brave Browser.app/Contents/MacOS/Brave Browser',
    ];
    return [...apps.map((a) => join('/Applications', a)), ...apps.map((a) => join(homedir(), 'Applications', a))];
  }
  if (platform === 'win32') {
    const roots = [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA].filter(Boolean);
    const exes = [
      'Google\\Chrome\\Application\\chrome.exe',
      'Chromium\\Application\\chrome.exe',
      'Microsoft\\Edge\\Application\\msedge.exe',
      'BraveSoftware\\Brave-Browser\\Application\\brave.exe',
    ];
    return exes.flatMap((exe) => roots.map((root) => `${root}\\${exe}`));
  }
  // Linux and the other Unixes: the commands on PATH, then the usual install folders.
  const names = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge', 'microsoft-edge-stable', 'brave-browser', 'brave'];
  const path = (env.PATH ?? '').split(delimiter).filter(Boolean);
  return [
    ...names.flatMap((name) => path.map((dir) => join(dir, name))),
    '/opt/google/chrome/chrome',
    '/snap/bin/chromium',
    '/opt/microsoft/msedge/msedge',
    '/opt/brave.com/brave/brave',
  ];
}

/** The browser's executable, or a refusal in one line (exit 2). */
export function browserPath({ platform = process.platform, env = process.env, exists = existsSync } = {}) {
  if (env.CHROMIUM) {
    if (exists(env.CHROMIUM)) return env.CHROMIUM;
    console.error(`CHROMIUM=${env.CHROMIUM}: there is no browser at that path; set CHROMIUM to a Chrome, Chromium, Edge or Brave executable`);
    process.exit(2);
  }
  const found = candidates(platform, env).find((p) => exists(p));
  if (found) return found;
  console.error('No Chrome, Chromium, Edge or Brave found where they are usually installed; set CHROMIUM=/path/to/the/browser');
  process.exit(2);
}

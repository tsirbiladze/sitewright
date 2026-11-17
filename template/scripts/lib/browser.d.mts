// Types for scripts/lib/browser.mjs, for the tests.
export function candidates(platform?: string, env?: Record<string, string | undefined>): string[];
export function browserPath(options?: { platform?: string; env?: Record<string, string | undefined>; exists?: (path: string) => boolean }): string;

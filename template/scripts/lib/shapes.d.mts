// Types for scripts/lib/shapes.mjs, which the tests import.
export const SHAPES: Record<string, { languages?: string[]; off?: 'projects' | 'work' | 'about' | 'blog'; note: string }>;
export function applyShape(dir: string, name: string): (typeof SHAPES)[string];
export function expectedPages(name: string): string[];
export function expectedBuild(name: string): string[];
export function expectedMissing(name: string): string[];

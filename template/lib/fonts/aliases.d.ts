// The font modules a layout or a project page gets by its language's script. next.config.ts maps each
// name to a file in this folder (fontAliases); these declarations are what TypeScript sees.
declare module 'site-fonts/primary' { export const fontClass: string }
declare module 'site-fonts/second' { export const fontClass: string }
declare module 'site-fonts/reading-primary' { export const readingClass: string | undefined }
declare module 'site-fonts/reading-second' { export const readingClass: string | undefined }

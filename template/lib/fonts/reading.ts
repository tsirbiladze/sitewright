import { Source_Serif_4 } from 'next/font/google';

// The reading face for long Latin-script text on project pages. Imported only by the project page
// routes, through the 'site-fonts/reading-*' aliases (next.config.ts), so no other page loads it and a
// Georgian project page gets lib/fonts/no-reading.ts instead. Not preloaded: the article starts below
// the first screen, and the header's Archivo should win the race for bandwidth. No optical-size axis:
// it would more than double the file (122 KB against 51 KB) for a difference too small to see at 17–19 px.
const readingFont = Source_Serif_4({
  subsets: ['latin'],
  style: ['normal'],
  variable: '--font-reading',
  display: 'swap',
  preload: false,
});

export const readingClass: string | undefined = readingFont.variable;

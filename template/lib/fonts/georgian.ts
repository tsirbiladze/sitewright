import { Archivo, IBM_Plex_Mono, Noto_Sans_Georgian } from 'next/font/google';

// The fonts of the Georgian root layout (see ./latin.ts for how a layout gets one of the two).
// - Noto Sans Georgian draws Georgian and the Latin words in it (product names): both preloaded.
// - Archivo is only the second name in the stack (app/styles/base.css), for glyphs Noto lacks. Not preloaded.
// - IBM Plex Mono: install lines and code, below the first screen on a phone. Not preloaded.
const georgian = Noto_Sans_Georgian({ subsets: ['georgian', 'latin'], axes: ['wdth'], variable: '--font-georgian', display: 'swap' });
const archivo = Archivo({ subsets: ['latin'], axes: ['wdth'], variable: '--font-archivo', display: 'swap', preload: false });
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono', display: 'swap', preload: false });

export const fontClass = `${archivo.variable} ${georgian.variable} ${mono.variable}`;

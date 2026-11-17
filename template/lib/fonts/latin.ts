import { Archivo, IBM_Plex_Mono, Noto_Sans_Georgian } from 'next/font/google';

// The fonts of a Latin-script language's root layout (the layout imports them as 'site-fonts/primary'
// or 'site-fonts/second'; next.config.ts points the alias here or at ./georgian.ts by the language).
// Each layout loads one of the two modules, so each preloads only what its pages draw first.
// - Archivo latin draws all the text: preloaded. Its latin-ext file is not; it loads when a page
//   draws a letter in it. Archivo has no ₾ (components/Lari.tsx).
// - Noto Sans Georgian: only a link to the Georgian pages and the ₾ sign use it here. Not preloaded.
// - IBM Plex Mono: install lines and code, below the first screen on a phone. Not preloaded.
const archivo = Archivo({ subsets: ['latin'], axes: ['wdth'], variable: '--font-archivo', display: 'swap' });
const georgian = Noto_Sans_Georgian({ subsets: ['georgian'], axes: ['wdth'], variable: '--font-georgian', display: 'swap', preload: false });
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono', display: 'swap', preload: false });

export const fontClass = `${archivo.variable} ${georgian.variable} ${mono.variable}`;

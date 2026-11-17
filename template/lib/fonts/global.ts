import { Archivo, Noto_Sans_Georgian } from 'next/font/google';

// Fonts for the global 404 (app/global-not-found.tsx), which sits outside both root layouts.
//
// Nothing here is preloaded, on purpose: Next adds the global 404's font preloads to every route of
// both layouts, so a preload here would be a preload on every page.
//
// These instances are not the layouts' instances, so their files have other URLs (a preloaded
// next/font file is named `….p.…woff2`). The 404 must therefore not prefetch: a prefetched page's
// payload carries its layout's font preload, and the 404 would download Archivo latin a second time.
// Its links are full page loads anyway (it sits outside both root layouts), so the Header and the
// 404 body pass `prefetch={false}` (components/Chrome.tsx).
//
// Archivo and Noto Sans Georgian are variable on width and weight: the bigger the type, the narrower it gets.
// `subsets` decides what is preloaded; every subset stays in the CSS with its unicode-range, so a glyph
// outside the preloaded files still loads when a page draws it. No mono here: the 404 shows no code,
// and the layouts' Plex CSS already reaches the 404 through the shared globals chunk. The mono stack
// in base.css has a fallback.
const archivo = Archivo({ subsets: ['latin'], axes: ['wdth'], variable: '--font-archivo', display: 'swap', preload: false });
const georgian = Noto_Sans_Georgian({ subsets: ['georgian'], axes: ['wdth'], variable: '--font-georgian', display: 'swap', preload: false });

export const fontClass = `${archivo.variable} ${georgian.variable}`;

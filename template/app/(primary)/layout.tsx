import type { Metadata, Viewport } from 'next';
import type { CSSProperties } from 'react';
// The fonts of this language's script (lib/fonts/latin.ts or lib/fonts/georgian.ts, by next.config.ts).
import { fontClass } from 'site-fonts/primary';
import { getContent, L } from '@/lib/content';
import { siteJsonLd, jsonLdScript, openGraphBase } from '@/lib/site';
import { cssVars } from '@/lib/colours';
import '../globals.css';

// The main language's pages, at /. Each language has its own root layout: its <html lang>, its fonts
// (each layout preloads only what its pages draw first) and its structured data.

export function generateMetadata(): Metadata {
  const { primary, url } = getContent();
  const l = L(primary);
  return {
    metadataBase: new URL(url),
    title: { default: l.site.name, template: `%s – ${l.site.name}` },
    description: l.site.description,
    authors: [{ name: l.site.name, url }],
    openGraph: openGraphBase(primary),
    twitter: { card: 'summary_large_image' },
  };
}

// The browser's chrome takes the field's colour (content/site.json "colours").
export function generateViewport(): Viewport {
  return { themeColor: getContent().palette.field };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const lang = getContent().primary;
  return (
    <html lang={lang} className={fontClass} style={cssVars(getContent().palette) as CSSProperties}>
      <body>
        {children}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(siteJsonLd(lang)) }} />
      </body>
    </html>
  );
}

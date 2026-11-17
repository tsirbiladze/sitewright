import type { Metadata, Viewport } from 'next';
import type { CSSProperties } from 'react';
// The fonts of this language's script (lib/fonts/latin.ts or lib/fonts/georgian.ts, by next.config.ts).
import { fontClass } from 'site-fonts/second';
import { getContent, L } from '@/lib/content';
import { siteJsonLd, jsonLdScript, openGraphBase } from '@/lib/site';
import { cssVars } from '@/lib/colours';
import '../../globals.css';

// The second language's pages, under /<code>/ (content/site.json "languages"). Its own root layout:
// <html lang>, the fonts of its script, its structured data. Which pages exist is up to each page's
// generateStaticParams (lib/pages.ts): with no second language there are none.

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const { url } = getContent();
  const l = L(lang);
  if (!l) return {};
  return {
    metadataBase: new URL(url),
    title: { default: l.site.name, template: `%s – ${l.site.name}` },
    description: l.site.description,
    authors: [{ name: l.site.name, url: `${url}/${lang}` }],
    openGraph: openGraphBase(lang),
    twitter: { card: 'summary_large_image' },
  };
}

// The browser's chrome takes the field's colour (content/site.json "colours").
export function generateViewport(): Viewport {
  return { themeColor: getContent().palette.field };
}

export default async function Layout({ children, params }: { children: React.ReactNode; params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  return (
    <html lang={lang} className={fontClass} style={cssVars(getContent().palette) as CSSProperties}>
      <body>
        {children}
        {L(lang) && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(siteJsonLd(lang)) }} />}
      </body>
    </html>
  );
}

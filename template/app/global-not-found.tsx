import type { Metadata, Viewport } from 'next';
import type { CSSProperties } from 'react';
import { fontClass } from '@/lib/fonts/global';
import { Header, Footer, NotFoundBody } from '@/components/Chrome';
import { getContent, L } from '@/lib/content';
import { openGraphBase } from '@/lib/site';
import { cssVars } from '@/lib/colours';
import './globals.css';

// No `robots` here: Next injects <meta name="robots" content="noindex"> on every 404 itself.
// The 404 has no address of its own, so `og:url` names the home it sends you to.
export function generateMetadata(): Metadata {
  const { primary, url } = getContent();
  const l = L(primary);
  return {
    metadataBase: new URL(url),
    title: `${l.ui.notFound.title} – ${l.site.name}`,
    description: l.ui.notFound.lede,
    openGraph: { ...openGraphBase(primary), url: '/' },
  };
}

export function generateViewport(): Viewport {
  return { themeColor: getContent().palette.field };
}

/** Any address that matches no route, in the main language. Anything under /<code>/ gets the second language's 404 instead. */
export default function GlobalNotFound() {
  const lang = getContent().primary;
  return (
    <html lang={lang} className={fontClass} style={cssVars(getContent().palette) as CSSProperties}>
      <body>
        <Header lang={lang} prefetch={false} />
        <main id="main">
          <NotFoundBody lang={lang} />
        </main>
        <Footer lang={lang} />
      </body>
    </html>
  );
}

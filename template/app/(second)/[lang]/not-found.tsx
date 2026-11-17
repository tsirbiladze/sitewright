import type { Metadata } from 'next';
import { Header, Footer, NotFoundBody } from '@/components/Chrome';
import { getContent, L } from '@/lib/content';
import { openGraphBase } from '@/lib/site';

// No `robots` here: Next injects <meta name="robots" content="noindex"> on every 404 itself.
// The 404 has no address of its own, so `og:url` names the home it sends you to.
// The description is the page's own lede (components/Chrome.tsx), not the home's.
export function generateMetadata(): Metadata {
  const lang = getContent().second;
  if (!lang) return {};
  const words = L(lang).ui.notFound;
  return { title: words.title, description: words.lede, openGraph: { ...openGraphBase(lang), url: `/${lang}` } };
}

/**
 * The second language's 404, inside its layout (its lang, its fonts): any address under /<code>/
 * that matches no page (rewritten to the prebuilt ./404/page.tsx by next.config.ts), and any page
 * there that calls notFound().
 */
export default function NotFound() {
  const lang = getContent().second!;
  return (
    <>
      <Header lang={lang} prefetch={false} />
      <main id="main">
        <NotFoundBody lang={lang} />
      </main>
      <Footer lang={lang} />
    </>
  );
}

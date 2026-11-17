import Link from 'next/link';
import { Header, Footer, PageHead, Placeholder, CtaBlock } from './Chrome';
import { rich } from './Text';
import { formatDate, getContent, href, L, plural, type Lang } from '@/lib/content';
import { blogPath, draftPreview, feedPath, getPosts, postPath, type Post } from '@/lib/blog';

/** A post's date, reading time and, in a local preview, the draft mark. */
function PostMeta({ post, lang }: { post: Post; lang: Lang }) {
  const words = L(lang).ui.blog;
  return (
    <p className="post-meta">
      <time dateTime={post.date}>{formatDate(post.date, lang)}</time>
      <span>{plural(lang, words.minutes, post.minutes)}</span>
      {post.draft && <Placeholder>{words.draft}</Placeholder>}
    </p>
  );
}

/** A language's blog: its posts newest first (drafts only in a local preview, marked), the feed, the call to action. */
export function BlogIndex({ lang }: { lang: Lang }) {
  const l = L(lang);
  const b = l.blog!;
  const posts = getPosts(lang, { drafts: draftPreview() });
  return (
    <>
      <Header lang={lang} current="blog" page="/blog" />
      <main id="main">
        <PageHead lang={lang} title={b.title} lede={rich(b.lede)} />
        <div className="wrap page-body blog-index">
          {posts.length ? (
            <ul className="post-list">
              {posts.map((p) => (
                <li key={p.slug}>
                  <PostMeta post={p} lang={lang} />
                  <h2><Link href={postPath(lang, p.slug)}>{rich(p.title)}</Link></h2>
                  {p.summary && <p>{rich(p.summary)}</p>}
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty">
              <p>{rich(b.empty)}</p>
            </div>
          )}
          <p className="blog-feed">{l.ui.blog.feed} <a href={feedPath(lang)} type="application/rss+xml">{feedPath(lang)}</a></p>
          <CtaBlock lang={lang} heading={b.ctaHeading} text={b.ctaText} />
        </div>
      </main>
      <Footer lang={lang} />
    </>
  );
}

/** A post: the title on the edge, its summary and date, the text, the way back, and the call to action. */
export function BlogPost({ lang, post }: { lang: Lang; post: Post }) {
  const c = getContent();
  const l = L(lang);
  const b = l.blog!;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.summary || undefined,
    datePublished: post.date,
    inLanguage: lang,
    url: `${c.url}${postPath(lang, post.slug)}`,
    author: { '@type': 'Person', name: l.site.name, url: href(lang, '/') === '/' ? c.url : `${c.url}${href(lang, '/')}` },
  };
  return (
    <>
      <Header lang={lang} current="blog" page={`/blog/${post.slug}`} />
      <main id="main">
        <PageHead lang={lang} title={post.title} lede={post.summary ? rich(post.summary) : undefined} crumbs={[{ href: blogPath(lang), label: b.title }]} text>
          <PostMeta post={post} lang={lang} />
        </PageHead>
        <div className="wrap page-body post">
          <article className="prose post-body" dangerouslySetInnerHTML={{ __html: post.html }} />
          <p className="post-back"><Link href={blogPath(lang)}>{l.ui.blog.all}</Link></p>
          <CtaBlock lang={lang} heading={b.postCtaHeading} />
        </div>
      </main>
      <Footer lang={lang} />
      {!post.draft && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />}
    </>
  );
}

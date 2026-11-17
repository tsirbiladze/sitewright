import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BlogPost } from '@/components/Blog';
import { draftPreview, getPost } from '@/lib/blog';
import { postMetadata, postParams, secondLang, secondParams } from '@/lib/pages';

type Props = { params: Promise<{ lang: string; slug: string }> };

// Drafts get a page only in a local preview (lib/blog.ts).
export const dynamicParams = false;
export const generateStaticParams = () => secondParams('blog').flatMap(({ lang }) => postParams(lang).map((p) => ({ lang, ...p })));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return postMetadata(await secondLang(params), (await params).slug);
}

export default async function Page({ params }: Props) {
  const lang = await secondLang(params);
  const post = getPost(lang, (await params).slug, { drafts: draftPreview() });
  if (!post) notFound();
  return <BlogPost lang={lang} post={post} />;
}

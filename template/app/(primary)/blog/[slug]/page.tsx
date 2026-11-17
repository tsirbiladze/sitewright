import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BlogPost } from '@/components/Blog';
import { getContent } from '@/lib/content';
import { draftPreview, getPost } from '@/lib/blog';
import { postMetadata, postParams } from '@/lib/pages';

type Props = { params: Promise<{ slug: string }> };

// Drafts get a page only in a local preview (lib/blog.ts).
export const dynamicParams = false;
export const generateStaticParams = () => postParams(getContent().primary);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return postMetadata(getContent().primary, (await params).slug);
}

export default async function Page({ params }: Props) {
  const lang = getContent().primary;
  const post = getPost(lang, (await params).slug, { drafts: draftPreview() });
  if (!post) notFound();
  return <BlogPost lang={lang} post={post} />;
}

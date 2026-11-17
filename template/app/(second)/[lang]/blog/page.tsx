import type { Metadata } from 'next';
import { BlogIndex } from '@/components/Blog';
import { blogMetadata } from '@/lib/pages';
import { secondLang, secondParams } from '@/lib/pages';

type Props = { params: Promise<{ lang: string }> };

export const dynamicParams = false;
export const generateStaticParams = () => secondParams('blog');

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return blogMetadata(await secondLang(params));
}

export default async function Page({ params }: Props) {
  const lang = await secondLang(params);
  return <BlogIndex lang={lang} />;
}

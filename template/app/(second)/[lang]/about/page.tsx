import type { Metadata } from 'next';
import { AboutPage } from '@/components/AboutPage';
import { aboutMetadata } from '@/lib/pages';
import { secondLang, secondParams } from '@/lib/pages';

type Props = { params: Promise<{ lang: string }> };

export const dynamicParams = false;
export const generateStaticParams = () => secondParams('about');

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return aboutMetadata(await secondLang(params));
}

export default async function Page({ params }: Props) {
  const lang = await secondLang(params);
  return <AboutPage lang={lang} />;
}

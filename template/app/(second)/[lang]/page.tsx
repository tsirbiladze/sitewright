import type { Metadata } from 'next';
import { Home } from '@/components/Home';
import { homeMetadata } from '@/lib/pages';
import { secondLang, secondParams } from '@/lib/pages';

type Props = { params: Promise<{ lang: string }> };

export const dynamicParams = false;
export const generateStaticParams = () => secondParams();

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return homeMetadata(await secondLang(params));
}

export default async function Page({ params }: Props) {
  const lang = await secondLang(params);
  return <Home lang={lang} />;
}

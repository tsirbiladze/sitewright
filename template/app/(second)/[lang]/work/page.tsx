import type { Metadata } from 'next';
import { WorkPage } from '@/components/WorkPage';
import { workMetadata } from '@/lib/pages';
import { secondLang, secondParams } from '@/lib/pages';

type Props = { params: Promise<{ lang: string }> };

export const dynamicParams = false;
export const generateStaticParams = () => secondParams('work');

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return workMetadata(await secondLang(params));
}

export default async function Page({ params }: Props) {
  const lang = await secondLang(params);
  return <WorkPage lang={lang} />;
}

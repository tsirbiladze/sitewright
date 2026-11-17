import type { Metadata } from 'next';
import { Home } from '@/components/Home';
import { homeMetadata } from '@/lib/pages';
import { getContent } from '@/lib/content';

export function generateMetadata(): Metadata {
  return homeMetadata(getContent().primary);
}

export default function Page() {
  return <Home lang={getContent().primary} />;
}

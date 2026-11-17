import { Suspense } from 'react';
import NotFound from '../not-found';

// Next prerenders a notFound() page as an empty shell and draws the 404 in the browser. The Suspense
// fallback is the same 404, so the HTML itself carries it (no JavaScript needed), and the browser then
// swaps in ../not-found.tsx, which is identical. Without this the prebuilt HTML has an empty <body>.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<NotFound />}>{children}</Suspense>;
}

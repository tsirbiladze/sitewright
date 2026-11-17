import type { ReactNode } from 'react';

/**
 * Sets ₾ in Noto Sans Georgian. Archivo has no lari sign, so on English pages the browser would
 * download Archivo's latin-ext file just to find it missing, then fall back anyway.
 */
export function withLari(text: string): ReactNode {
  const parts = text.split('₾');
  if (parts.length === 1) return text;
  return parts.flatMap((part, i) => (i ? [<span className="lari" key={i}>₾</span>, part] : [part]));
}

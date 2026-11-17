import type { Specimen as SpecimenData } from '@/lib/projects';
import type { Lang } from '@/lib/content';

/**
 * What a skill does, shown: the phone crop below 700 px, the wide crop above, both small WebP files cut
 * at fetch time (a skill's `specimen` in content/projects/<slug>.json) or a plain project's picture, each with its own size so nothing shifts as it loads.
 * Never lazy, and `priority` where it is the largest thing on a phone's first screen (/work, /skills),
 * so the browser fetches it ahead of the scripts. Inside <picture>, React adds no preload hint to the
 * page's payload, so the header's prefetch of /work doesn't make every page download it.
 */
export function Specimen({ specimen, lang, priority = false }: { specimen: SpecimenData; lang: Lang; priority?: boolean }) {
  const { wide, phone, alt } = specimen;
  return (
    <picture className="specimen">
      {phone && <source media="(max-width: 699px)" srcSet={phone.src} width={phone.width} height={phone.height} />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={wide.src} width={wide.width} height={wide.height} alt={alt[lang]} decoding="async" fetchPriority={priority ? 'high' : undefined} />
    </picture>
  );
}

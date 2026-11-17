import { ImageResponse } from 'next/og';
import { getContent } from '@/lib/content';

/**
 * The home-screen icon: app/icon.tsx at 180 px, in the site's colours (its 32-unit grid × 5.625), square, because iOS
 * rounds the corners itself: the wine field and, from 22/32 of the height, the light ground under
 * its edge (the horizon every page stands on).
 */
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

const u = 180 / 32;
const box = (x: number, y: number, w: number, h: number, background: string) => ({
  position: 'absolute' as const, left: x * u, top: y * u, width: w * u, height: h * u, background,
});

export default function AppleIcon() {
  const { field, mist, foam } = getContent().palette;
  return new ImageResponse(
    (
      <div style={{ width: 180, height: 180, display: 'flex', position: 'relative', background: field }}>
        <div style={box(0, 22, 32, 10, mist)} />
        <div style={box(7, 15, 18, 7, foam)} />
      </div>
    ),
    size,
  );
}

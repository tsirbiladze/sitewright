import { getContent } from '@/lib/content';

/**
 * The browser tab's icon, in the site's colours (content/site.json "colours"): the field and, from 22/32
 * of the height, the light ground under its edge (the horizon every page stands on), with the name's
 * block standing on it. An SVG, drawn at build time.
 */
export const contentType = 'image/svg+xml';
export const dynamic = 'force-static';

export default function Icon() {
  const { field, mist, foam } = getContent().palette;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="${field}"/><path d="M0 22h32v4a6 6 0 0 1-6 6H6a6 6 0 0 1-6-6z" fill="${mist}"/><path d="M7 15h18v7H7z" fill="${foam}"/></svg>`;
  return new Response(svg, { headers: { 'content-type': contentType } });
}

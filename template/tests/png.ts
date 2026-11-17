// Just enough of a PNG decoder to look at the share images' pixels: 8-bit RGB or RGBA, any filter.
import { inflateSync } from 'node:zlib';

export interface Png { width: number; height: number; rgb: (x: number, y: number) => [number, number, number] }

export function decodePng(buf: Buffer): Png {
  if (buf.toString('latin1', 0, 8) !== '\x89PNG\r\n\x1a\n') throw new Error('not a PNG');
  let width = 0, height = 0, channels = 0;
  const idat: Buffer[] = [];
  for (let pos = 8; pos < buf.length;) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const [depth, color, , , interlace] = data.subarray(8);
      channels = ({ 2: 3, 6: 4 } as Record<number, number>)[color] ?? 0;
      if (depth !== 8 || !channels || interlace) throw new Error(`unsupported PNG: depth ${depth}, colour type ${color}, interlace ${interlace}`);
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const px = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x];
      const a = x >= channels ? px[y * stride + x - channels] : 0;
      const b = y ? px[(y - 1) * stride + x] : 0;
      const c = x >= channels && y ? px[(y - 1) * stride + x - channels] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter];
      px[y * stride + x] = (v + pred) & 0xff;
    }
  }
  return { width, height, rgb: (x, y) => [px[y * stride + x * channels], px[y * stride + x * channels + 1], px[y * stride + x * channels + 2]] };
}

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/** Share of the pixels in a box within `tolerance` of a colour on every channel, 0–1. */
export function share(png: Png, color: string, box: { x: number; y: number; w: number; h: number }, tolerance = 24): number {
  const [r, g, b] = hex(color);
  let hits = 0;
  for (let y = box.y; y < box.y + box.h; y++) {
    for (let x = box.x; x < box.x + box.w; x++) {
      const [pr, pg, pb] = png.rgb(x, y);
      if (Math.abs(pr - r) <= tolerance && Math.abs(pg - g) <= tolerance && Math.abs(pb - b) <= tolerance) hits++;
    }
  }
  return hits / (box.w * box.h);
}

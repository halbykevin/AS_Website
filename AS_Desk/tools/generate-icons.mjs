import { mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';

// Renders the brand mark (teal tile, monitor glyph — the same shape as the in-app ScreenIcon)
// into PNGs with signed-distance anti-aliasing. Output is committed; re-run after changing it.
const teal = [0x40, 0xc7, 0xac], ink = [0x11, 0x2f, 0x2b];
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = bytes => { let c = 0xffffffff; for (const b of bytes) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0); out.write(type, 4, 'ascii'); data.copy(out, 8);
  out.writeUInt32BE(crc(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function png(size, rgba) {
  const header = Buffer.alloc(13); header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header.set([8, 6, 0, 0, 0], 8);
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
// Distances in icon units (0..24, like the SVG viewBox).
const box = (px, py, cx, cy, hw, hh, r) => {
  const qx = Math.abs(px - cx) - hw + r, qy = Math.abs(py - cy) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};
const segment = (px, py, ax, ay, bx, by) => {
  const t = Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
  return Math.hypot(px - ax - t * (bx - ax), py - ay - t * (by - ay));
};
function render(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const unit = 24 / size, stroke = 1.7;
  // The glyph occupies the inner 70% of the tile.
  const inset = 3.6, scale = (24 - 2 * inset) / 24;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    const blend = (color, coverage) => {
      const na = coverage + a * (1 - coverage);
      if (na <= 0) return;
      r = (color[0] * coverage + r * a * (1 - coverage)) / na; g = (color[1] * coverage + g * a * (1 - coverage)) / na;
      b = (color[2] * coverage + b * a * (1 - coverage)) / na; a = na;
    };
    let s = 0;
    for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
      const px = (x + (sx + 0.5) / 4) * unit, py = (y + (sy + 0.5) / 4) * unit;
      if (box(px, py, 12, 12, 12, 12, 5.2) <= 0) s++;
    }
    blend(teal, s / 16);
    const gx = (x + 0.5) * unit, gy = (y + 0.5) * unit;
    const ux = (gx - inset) / scale, uy = (gy - inset) / scale;
    const half = stroke / 2;
    // rect x3 y3 w18 h13 r2, stand 12,16→12,21, base 8,21→16,21, arrow 7,8→13,8 and 11,6→13,8→11,10
    const d = Math.min(
      Math.abs(box(ux, uy, 12, 9.5, 9, 6.5, 2)) - half,
      segment(ux, uy, 12, 16, 12, 21) - half, segment(ux, uy, 8, 21, 16, 21) - half,
      segment(ux, uy, 7, 8, 13, 8) - half, segment(ux, uy, 11, 6, 13, 8) - half, segment(ux, uy, 13, 8, 11, 10) - half);
    const coverage = Math.max(0, Math.min(1, 0.5 - d * scale / unit));
    if (coverage > 0) blend(ink, coverage);
    rgba.set([Math.round(r), Math.round(g), Math.round(b), Math.round(a * 255)], (y * size + x) * 4);
  }
  return png(size, rgba);
}
const dir = new URL('../apps/desktop/assets/', import.meta.url);
await mkdir(dir, { recursive: true });
await writeFile(new URL('icon.png', dir), render(256));
// Windows tray: 16 px at 100% scaling, with @1.5x/@2x variants picked by Electron.
await writeFile(new URL('tray.png', dir), render(16));
await writeFile(new URL('tray@1.5x.png', dir), render(24));
await writeFile(new URL('tray@2x.png', dir), render(32));
console.log('Icons written to apps/desktop/assets/');

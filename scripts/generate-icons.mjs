// Renders the extension icon (lightning bolt on a gradient rounded square) to
// PNGs without any image dependencies. Run: node scripts/generate-icons.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Bolt polygon in a 24x24 design space (same path as the in-page icon).
const BOLT = [
  [13, 2],
  [4, 14],
  [11, 14],
  [10, 22],
  [19, 10],
  [12, 10],
];

function inPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inRoundedRect(x, y, size, r) {
  const cx = Math.min(Math.max(x, r), size - r);
  const cy = Math.min(Math.max(y, r), size - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function render(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const ss = 4; // supersampling
  const from = [0x4f, 0x46, 0xe5];
  const to = [0x7c, 0x3a, 0xed];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let bg = 0;
      let bolt = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const px = x + (sx + 0.5) / ss;
          const py = y + (sy + 0.5) / ss;
          if (inRoundedRect(px, py, size, size * 0.22)) {
            bg++;
            const bx = ((px / size) * 24 - 12) * 1.12 + 12;
            const by = ((py / size) * 24 - 12) * 1.12 + 12;
            if (inPolygon(bx, by, BOLT)) bolt++;
          }
        }
      }
      const n = ss * ss;
      const t = (x + y) / (2 * size);
      const i = (y * size + x) * 4;
      const a = bolt / n;
      for (let c = 0; c < 3; c++) {
        const g = from[c] + (to[c] - from[c]) * t;
        rgba[i + c] = Math.round(
          g * (1 - a / Math.max(bg / n, 1e-9)) + 255 * (a / Math.max(bg / n, 1e-9)),
        );
      }
      rgba[i + 3] = Math.round((bg / n) * 255);
    }
  }
  return rgba;
}

mkdirSync('public/icons', { recursive: true });
for (const size of [16, 32, 48, 128]) {
  writeFileSync(`public/icons/icon-${size}.png`, encodePng(size, render(size)));
  console.log(`public/icons/icon-${size}.png`);
}

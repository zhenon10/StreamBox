/**
 * Generate StreamBox webOS icons / splash as PNG (no native deps).
 * Outputs:
 *   webos/icon.png           80×80
 *   webos/icon-large.png     130×130
 *   webos/splash.png         1920×1080
 *   webos/store/store-icon-400.png  400×400 (Seller Lounge)
 */
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const webosDir = join(root, 'webos');
const storeDir = join(webosDir, 'store');

const BG = [10, 14, 20, 255];
const TEAL = [13, 148, 136, 255];
const TEAL_LIGHT = [45, 212, 191, 255];
const WHITE = [232, 238, 245, 255];
const INNER = [8, 40, 38, 255];

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * stride, y * stride + stride);
  }
  const compressed = deflateSync(raw, { level: 9 });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function setPx(rgba, w, h, x, y, color) {
  if (x < 0 || y < 0 || x >= w || y >= h) return;
  const i = (y * w + x) * 4;
  rgba[i] = color[0];
  rgba[i + 1] = color[1];
  rgba[i + 2] = color[2];
  rgba[i + 3] = color[3];
}

function fillRect(rgba, w, h, x0, y0, x1, y1, color) {
  const xa = Math.max(0, Math.floor(x0));
  const ya = Math.max(0, Math.floor(y0));
  const xb = Math.min(w, Math.ceil(x1));
  const yb = Math.min(h, Math.ceil(y1));
  for (let y = ya; y < yb; y++) {
    for (let x = xa; x < xb; x++) setPx(rgba, w, h, x, y, color);
  }
}

function fillCircle(rgba, w, h, cx, cy, r, color) {
  const r2 = r * r;
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) setPx(rgba, w, h, x, y, color);
    }
  }
}

function fillRoundedRect(rgba, w, h, x0, y0, x1, y1, radius, color) {
  fillRect(rgba, w, h, x0 + radius, y0, x1 - radius, y1, color);
  fillRect(rgba, w, h, x0, y0 + radius, x1, y1 - radius, color);
  fillCircle(rgba, w, h, x0 + radius, y0 + radius, radius, color);
  fillCircle(rgba, w, h, x1 - radius - 1, y0 + radius, radius, color);
  fillCircle(rgba, w, h, x0 + radius, y1 - radius - 1, radius, color);
  fillCircle(rgba, w, h, x1 - radius - 1, y1 - radius - 1, radius, color);
}

function fillPlayTriangle(rgba, w, h, cx, cy, size, color) {
  const half = size / 2;
  for (let y = -half; y <= half; y++) {
    const left = cx - size * 0.15;
    const maxX = left + (half - Math.abs(y)) * 1.1;
    for (let x = left; x <= maxX; x++) {
      setPx(rgba, w, h, Math.round(x), Math.round(cy + y), color);
    }
  }
}

function drawAppIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  fillRect(rgba, size, size, 0, 0, size, size, BG);

  const pad = Math.max(5, Math.round(size * 0.08));
  const radius = Math.round(size * 0.18);
  fillRoundedRect(rgba, size, size, pad, pad, size - pad, size - pad, radius, TEAL);

  const inset = Math.round(size * 0.12);
  fillRoundedRect(
    rgba,
    size,
    size,
    pad + inset,
    pad + inset,
    size - pad - inset,
    size - pad - inset,
    Math.round(radius * 0.7),
    INNER,
  );

  fillPlayTriangle(rgba, size, size, size * 0.48, size * 0.5, size * 0.38, WHITE);
  fillRect(
    rgba,
    size,
    size,
    Math.round(size * 0.22),
    Math.round(size * 0.78),
    Math.round(size * 0.78),
    Math.round(size * 0.82),
    TEAL_LIGHT,
  );

  return encodePng(size, size, rgba);
}

function drawSplash(width, height) {
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const t = y / height;
    const r = Math.round(10 + t * 8);
    const g = Math.round(14 + t * 20);
    const b = Math.round(20 + t * 18);
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
      rgba[i + 3] = 255;
    }
  }

  const emblem = 220;
  const cx = Math.floor(width / 2);
  const cy = Math.floor(height / 2) - 40;
  const x0 = cx - emblem / 2;
  const y0 = cy - emblem / 2;
  fillRoundedRect(rgba, width, height, x0, y0, x0 + emblem, y0 + emblem, 36, TEAL);
  fillRoundedRect(rgba, width, height, x0 + 28, y0 + 28, x0 + emblem - 28, y0 + emblem - 28, 24, INNER);
  fillPlayTriangle(rgba, width, height, cx - 6, cy, 100, WHITE);

  const barY = cy + emblem / 2 + 48;
  fillRect(rgba, width, height, cx - 180, barY, cx + 180, barY + 10, TEAL_LIGHT);
  fillRect(rgba, width, height, cx - 90, barY + 28, cx + 90, barY + 36, [100, 116, 139, 255]);

  return encodePng(width, height, rgba);
}

function write(relPath, buffer) {
  const path = join(root, relPath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, buffer);
  console.log(`✓ ${relPath} (${buffer.length} bytes)`);
}

if (!existsSync(webosDir)) mkdirSync(webosDir, { recursive: true });
if (!existsSync(storeDir)) mkdirSync(storeDir, { recursive: true });

write('webos/icon.png', drawAppIcon(80));
write('webos/icon-large.png', drawAppIcon(130));
write('webos/store/store-icon-400.png', drawAppIcon(400));
write('webos/splash.png', drawSplash(1920, 1080));

console.log('\nStreamBox webOS assets ready.');

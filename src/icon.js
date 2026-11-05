// Draw a ring-gauge tray icon as PNG with no native deps (works on macOS, Windows, Linux).
const zlib = require('zlib');

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function encodePng(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

function colorFor(pct, warnAt) {
  if (pct == null) return [140, 140, 150];
  if (pct >= 95) return [229, 72, 77];
  if (warnAt > 0 && pct >= warnAt) return [240, 160, 40];
  return [52, 199, 120];
}

/** @returns {Buffer} PNG */
function ringPng(size, pct, warnAt = 75) {
  const SS = 4; // supersampling
  const rgba = Buffer.alloc(size * size * 4);
  const c = size / 2, rOut = size * 0.47, rIn = size * 0.29;
  const fill = colorFor(pct, warnAt);
  const frac = pct == null ? 0 : Math.max(0, Math.min(1, pct / 100));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let track = 0, arc = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS - c, py = y + (sy + 0.5) / SS - c;
          const d = Math.hypot(px, py);
          if (d < rIn || d > rOut) continue;
          // angle from 12 o'clock, clockwise, 0..1
          const a = (Math.atan2(px, -py) / (2 * Math.PI) + 1) % 1;
          if (a < frac) arc++; else track++;
        }
      }
      const n = SS * SS, ta = track / n, aa = arc / n;
      const alpha = aa + ta * 0.35;
      const i = (y * size + x) * 4;
      if (alpha <= 0) continue;
      for (let k = 0; k < 3; k++) rgba[i + k] = Math.round((fill[k] * aa + 150 * ta * 0.35) / alpha);
      rgba[i + 3] = Math.round(Math.min(1, alpha) * 255);
    }
  }
  return encodePng(size, rgba);
}

module.exports = { ringPng, colorFor };

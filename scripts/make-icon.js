// Draws build/icon.png (1024x1024), the app icon used by the installers.
// Run: node scripts/make-icon.js
const fs = require('fs');
const path = require('path');
const { encodePng } = require('../src/icon');

const S = 1024;
const SS = 3; // supersampling
const rgba = Buffer.alloc(S * S * 4);

const BG = [28, 27, 31];
const TRACK = [58, 56, 62];
const ARC = [52, 199, 120];
const pct = 0.68;

const c = S / 2;
const margin = S * 0.09, radius = S * 0.2;            // macOS-style rounded square
const rOut = S * 0.33, rIn = S * 0.235;
const capR = (rOut - rIn) / 2, capMid = (rOut + rIn) / 2;

function inRoundedSquare(x, y) {
  const lo = margin, hi = S - margin;
  if (x < lo || x > hi || y < lo || y > hi) return false;
  const cx = Math.min(Math.max(x, lo + radius), hi - radius);
  const cy = Math.min(Math.max(y, lo + radius), hi - radius);
  return Math.hypot(x - cx, y - cy) <= radius;
}

function capHit(px, py, a) {
  const ang = a * 2 * Math.PI;
  return Math.hypot(px - capMid * Math.sin(ang), py + capMid * Math.cos(ang)) <= capR;
}

for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    let bg = 0, track = 0, arc = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const fx = x + (sx + 0.5) / SS, fy = y + (sy + 0.5) / SS;
        if (!inRoundedSquare(fx, fy)) continue;
        const px = fx - c, py = fy - c, d = Math.hypot(px, py);
        const a = (Math.atan2(px, -py) / (2 * Math.PI) + 1) % 1;
        const onRing = d >= rIn && d <= rOut;
        if ((onRing && a <= pct) || capHit(px, py, 0) || capHit(px, py, pct)) arc++;
        else if (onRing) track++;
        else bg++;
      }
    }
    const n = SS * SS, total = bg + track + arc;
    if (!total) continue;
    const i = (y * S + x) * 4;
    for (let k = 0; k < 3; k++) rgba[i + k] = Math.round((BG[k] * bg + TRACK[k] * track + ARC[k] * arc) / total);
    rgba[i + 3] = Math.round((total / n) * 255);
  }
}

const out = path.join(__dirname, '..', 'build', 'icon.png');
fs.writeFileSync(out, encodePng(S, rgba));
console.log(`wrote ${out}`);

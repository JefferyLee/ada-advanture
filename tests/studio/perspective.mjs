// Checks finding and straightening a sheet of paper on made-up photos: angled, tilted, uneven
// light, a light desk, paper running off the frame, a comic page with panel borders, and cases
// where the whole photo must be kept. No browser needed.
// Run:  node tests/studio/perspective.mjs
import { toSmallGray, detectPage, straightSize, straighten, FULL_FRAME } from '../../src/studio/perspective.js';
import { cleanLineArt } from '../../src/studio/cleanup.js';
// unit square -> quad, as a real camera would see a flat sheet
function proj(q) { const m = []; const f = [[0, 0], [1, 0], [1, 1], [0, 1]]; for (let i = 0; i < 4; i++) { const [u, v] = f[i], [x, y] = q[i]; m.push([u, v, 1, 0, 0, 0, -u * x, -v * x, x]); m.push([0, 0, 0, u, v, 1, -u * y, -v * y, y]); }
  for (let c = 0; c < 8; c++) { let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r; [m[c], m[p]] = [m[p], m[c]]; for (let r = 0; r < 8; r++) if (r !== c) { const k = m[r][c] / m[c][c]; for (let j = c; j < 9; j++) m[r][j] -= k * m[c][j]; } } return m.map((r, i) => r[8] / r[i]); }
// A "photo": a dark desk with a sheet seen at an angle. `draw(s,t)` says where the sheet is inked (s,t in 0..1 across the sheet).
function photo(W, H, quad, draw, { desk = 70, paper = 225, light = 0 } = {}) {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) { const x = i % W; const v = desk + light * (x / W) + (Math.random() * 6 - 3); data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v; data[i * 4 + 3] = 255; }
  const P = proj(quad); const N = 1700;
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    const s = i / N, t = j / N;
    const z = P[6] * s + P[7] * t + 1;
    const x = (P[0] * s + P[1] * t + P[2]) / z;
    const y = (P[3] * s + P[4] * t + P[5]) / z;
    const v = draw(s, t) ? 60 : paper + light * (x / W) * 0.3;
    const p = (Math.min(H - 1, Math.round(y)) * W + Math.min(W - 1, Math.round(x))) * 4;
    data[p] = data[p + 1] = data[p + 2] = v;
  }
  return { data, width: W, height: H };
}
const card = (s, t) => ((s > 0.08 && s < 0.92 && t > 0.08 && t < 0.92) && (s < 0.095 || s > 0.905 || t < 0.1 || t > 0.9)) || Math.abs(s - 0.5) < 0.006 || Math.abs(t - 0.5) < 0.008 || Math.hypot(s - 0.25, t - 0.25) < 0.02;
// A comic page drawn on paper: thick panel borders reaching almost to the paper's edge
const comic = (s, t) => { const b = (v, a, z) => Math.abs(v - a) < 0.008 || Math.abs(v - z) < 0.008; const inP = (s0, s1, t0, t1) => s >= s0 - 0.008 && s <= s1 + 0.008 && t >= t0 - 0.008 && t <= t1 + 0.008 && (b(s, s0, s1) || b(t, t0, t1)); return inP(0.03, 0.48, 0.03, 0.48) || inP(0.52, 0.97, 0.03, 0.48) || inP(0.03, 0.97, 0.52, 0.97); };
const inner = (s, t) => ((s > 0.08 && s < 0.92 && t > 0.08 && t < 0.92) && (s < 0.095 || s > 0.905 || t < 0.1 || t > 0.9)) || (Math.abs(s - 0.5) < 0.006 && t > 0.2 && t < 0.8) || (Math.abs(t - 0.5) < 0.008 && s > 0.2 && s < 0.8);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const W = 1600, H = 1200;
function run(name, truth, draw, opts) {
  const img = photo(W, H, truth, draw, opts);
  const found = detectPage(toSmallGray(img));
  if (!found) { console.log(name + ': NOT found'); return null; }
  const px = found.map(([x, y]) => [x * W, y * H]);
  console.log(name + ': found; corner error px (incl. the deliberate 2.5% inset):', px.map((c, i) => dist(c, truth[i]).toFixed(0)).join(', '));
  return { img, px };
}
const truth = [[330, 210], [1290, 150], [1420, 1010], [190, 930]];
run('angled card, lines running off the paper', truth, card);
const r = run('angled card', truth, inner);
const size = straightSize(r.px, 1500);
let t = Date.now();
const flat = straighten(r.img, r.px, size.width, size.height);
console.log('  straightened to', size.width + 'x' + size.height, 'in', (Date.now() - t) + 'ms');
const g = (fx, fy) => flat.data[(Math.round(fy * (flat.height - 1)) * flat.width + Math.round(fx * (flat.width - 1))) * 4];
console.log('  four corners are paper:', [g(0.01, 0.01), g(0.99, 0.01), g(0.99, 0.99), g(0.01, 0.99)].join(','));
const dark = (cx, cy, rr) => { let sx = 0, sy = 0, n = 0; for (let y = Math.round((cy - rr) * flat.height); y < (cy + rr) * flat.height; y++) for (let x = Math.round((cx - rr) * flat.width); x < (cx + rr) * flat.width; x++) if (flat.data[(y * flat.width + x) * 4] < 120) { sx += x; sy += y; n++; } return n ? (sx / n / flat.width).toFixed(3) + ',' + (sy / n / flat.height).toFixed(3) : 'none'; };
console.log('  cross centre lands at', dark(0.5, 0.5, 0.04), '(want 0.500,0.500)');
const edgeY = (fx) => { for (let y = 0; y < flat.height / 2; y++) if (flat.data[(y * flat.width + Math.round(fx * flat.width)) * 4] < 120) return y; return -1; };
const edgeX = (fy) => { for (let x = 0; x < flat.width / 2; x++) if (flat.data[(Math.round(fy * flat.height) * flat.width + x) * 4] < 120) return x; return -1; };
console.log('  drawn border after straightening: top y at 20/50/80% =', [edgeY(0.2), edgeY(0.45), edgeY(0.8)].join('/'), '| left x at 20/50/80% =', [edgeX(0.2), edgeX(0.45), edgeX(0.8)].join('/'), '(equal numbers = straight and square)');
const cleaned = cleanLineArt(flat, { darkness: 65, smudge: 30 });
console.log('  clean-up: bbox', JSON.stringify(cleaned.bbox), 'of', flat.width + 'x' + flat.height, '| desk showing as ink at the rim:', cleaned.bbox.x0 < 4 || cleaned.bbox.y0 < 4 || cleaned.bbox.x1 > flat.width - 5 || cleaned.bbox.y1 > flat.height - 5);
run('comic page with panel borders', [[250, 180], [1350, 230], [1300, 1050], [300, 1000]], comic);
run('strongly tilted (20 degrees)', [[420, 120], [1380, 420], [1150, 1120], [200, 800]], card);
run('uneven light across desk and paper', truth, card, { light: 60 });
run('light wooden desk (low contrast)', truth, card, { desk: 150, paper: 228 });
const off = run('sheet cut off by the bottom of the frame', [[300, 250], [1300, 250], [1380, 1199], [220, 1199]], card, { light: 25 });
const flatGray = (fill) => { const d = new Uint8ClampedArray(800 * 600 * 4); for (let i = 0; i < 800 * 600; i++) { const v = fill(i % 800, (i / 800) | 0); d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255; } return { data: d, width: 800, height: 600 }; };
const keep = (x) => (x ? 'CROPPED (bad)' : 'whole photo kept');
console.log('must not crop | paper fills frame, uneven light:', keep(detectPage(toSmallGray(flatGray((x) => 140 + 90 * x / 800)))));
console.log('must not crop | soft shadow from a hand at the edge:', keep(detectPage(toSmallGray(flatGray((x, y) => 230 - 110 * Math.exp(-((x - 60) ** 2 + (y - 300) ** 2) / 40000))))));
console.log('must not crop | plain white:', keep(detectPage(toSmallGray(flatGray(() => 235)))));
console.log('must not crop | paper fills frame with a drawing on it:', keep(detectPage(toSmallGray(photo(800, 600, [[0, 0], [799, 0], [799, 599], [0, 599]], card)))));
const same = straighten(r.img, FULL_FRAME.map(([x, y]) => [x * W, y * H]), W, H);
let diff = 0; for (let i = 0; i < r.img.data.length; i += 4001) diff = Math.max(diff, Math.abs(r.img.data[i] - same.data[i]));
console.log('whole-photo corners change nothing: max pixel difference', diff, '| corners in a line ->', straighten(r.img, [[0, 0], [100, 100], [200, 200], [300, 300]], 100, 100));

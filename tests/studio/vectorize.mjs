// Checks "Just my character" and "Neat lines" on made-up line art: a round head
// with eyes inside it and hearts around it, a line with a small gap, two lines
// crossing. No browser needed.
// Run:  node tests/studio/vectorize.mjs
import { keepFigure, neatSvg, traceNeat } from '../../src/studio/vectorize.js';

let failed = 0;
const check = (ok, what, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? ` (${detail})` : ''}`);
  if (!ok) failed++;
};

// Line art as an alpha channel; pen() draws a round-ended line `r` wide on each side.
function sheet(w, h) {
  const alpha = new Uint8Array(w * h);
  const pen = (pts, r) => {
    for (let k = 0; k < pts.length - 1; k++) {
      const [ax, ay] = pts[k];
      const [bx, by] = pts[k + 1];
      const steps = Math.ceil(Math.hypot(bx - ax, by - ay) * 2) + 1;
      for (let s = 0; s <= steps; s++) {
        const cx = ax + ((bx - ax) * s) / steps;
        const cy = ay + ((by - ay) * s) / steps;
        for (let y = Math.floor(cy - r); y <= cy + r; y++) {
          for (let x = Math.floor(cx - r); x <= cx + r; x++) {
            if (x >= 0 && y >= 0 && x < w && y < h && (x - cx) ** 2 + (y - cy) ** 2 <= r * r) alpha[y * w + x] = 255;
          }
        }
      }
    }
  };
  return { alpha, pen, w, h };
}
const circle = (cx, cy, r, n = 120) => Array.from({ length: n + 1 }, (_, k) => [cx + r * Math.cos((2 * Math.PI * k) / n), cy + r * Math.sin((2 * Math.PI * k) / n)]);
const inkIn = (alpha, w, x0, y0, x1, y1) => {
  let n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) n += alpha[y * w + x] > 90 ? 1 : 0;
  return n;
};
const ends = (d) => {
  const nums = d.match(/-?\d+(\.\d+)?/g).map(Number);
  return { start: nums.slice(0, 2), end: nums.slice(-2) };
};

// 1. Just my character: head with eyes stays, hearts around it go.
{
  const s = sheet(400, 500);
  s.pen(circle(200, 250, 120), 3);
  s.pen([[150, 230], [170, 240], [150, 250]], 2.5); // eye, not touching the head
  s.pen([[250, 230], [230, 240], [250, 250]], 2.5);
  s.pen(circle(40, 40, 14, 40), 2.5); // hearts floating around
  s.pen(circle(360, 460, 12, 40), 2.5);
  const kept = keepFigure(s.alpha, s.w, s.h);
  check(inkIn(kept, s.w, 70, 120, 330, 380) === inkIn(s.alpha, s.w, 70, 120, 330, 380), 'head and eyes are kept');
  check(inkIn(kept, s.w, 140, 220, 260, 260) > 50, 'eyes inside the head are kept');
  check(inkIn(kept, s.w, 0, 0, 80, 80) === 0 && inkIn(kept, s.w, 330, 430, 400, 500) === 0, 'hearts around it are gone');
  check(keepFigure(new Uint8Array(100), 10, 10) === null, 'an empty page gives nothing');
}

// 2. Neat lines: a ring becomes one closed stroke about as wide as the pencil line.
{
  const s = sheet(300, 300);
  s.pen(circle(150, 150, 100), 3);
  const { paths, width } = traceNeat(s.alpha, s.w, s.h);
  check(paths.length === 1, 'a ring is one stroke', `${paths.length} strokes`);
  const { start, end } = ends(paths[0]);
  check(Math.hypot(start[0] - end[0], start[1] - end[1]) < 3, 'and it closes');
  check(width > 4.5 && width < 8, 'pen width matches the pencil line', `width ${width.toFixed(2)}, line 7`);
  // every point of the stroke sits on the ring
  const nums = paths[0].match(/-?\d+(\.\d+)?/g).map(Number);
  let worst = 0;
  for (let k = 0; k < nums.length; k += 2) worst = Math.max(worst, Math.abs(Math.hypot(nums[k] - 150, nums[k + 1] - 150) - 100));
  check(worst < 3, 'the stroke follows the drawn line', `off by up to ${worst.toFixed(1)} px`);
}

// 3. A small gap in a line (faint pencil) is closed.
{
  const s = sheet(300, 100);
  s.pen([[20, 50], [140, 50]], 2.5);
  s.pen([[148, 50], [280, 50]], 2.5);
  const { paths } = traceNeat(s.alpha, s.w, s.h);
  check(paths.length === 1, 'a small gap is bridged', `${paths.length} strokes`);
}

// 4. Two crossing lines stay two whole strokes.
{
  const s = sheet(300, 300);
  s.pen([[30, 30], [270, 270]], 2.5);
  s.pen([[270, 30], [30, 270]], 2.5);
  const { paths } = traceNeat(s.alpha, s.w, s.h);
  const long = paths.filter((d) => {
    const { start, end } = ends(d);
    return Math.hypot(start[0] - end[0], start[1] - end[1]) > 300;
  });
  check(paths.length === 2 && long.length === 2, 'crossing lines stay two strokes', `${paths.length} strokes, ${long.length} long`);
}

// 5. The SVG is cut to the given box.
{
  const svg = neatSvg({ paths: ['M0 0L10 10'], width: 3 }, 0, 0, 120, 80);
  check(svg.includes('width="120"') && svg.includes('viewBox="0 0 120 80"') && svg.includes('stroke-width="3.00"'), 'SVG has the size and pen width');
}

if (failed) {
  console.log(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nall vectorize checks passed');

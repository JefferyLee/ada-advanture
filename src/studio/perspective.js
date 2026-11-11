// Find a sheet of paper in a photo and straighten it. Pure functions over
// pixel arrays, no DOM, so they can be tested outside the browser.
//
// A corner list is always [top-left, top-right, bottom-right, bottom-left],
// each as [x, y].

export const FULL_FRAME = [[0, 0], [1, 0], [1, 1], [0, 1]];

const DETECT_SIDE = 256; // detection runs on a copy about this many pixels across
const MIN_EDGE_STEP = 22; // how much brighter paper must be than what is just outside it (0-255)

// Shrink to a small grayscale picture by averaging blocks.
export function toSmallGray(src) {
  const { data, width, height } = src;
  const k = Math.max(1, Math.round(Math.max(width, height) / DETECT_SIDE));
  const w = Math.floor(width / k);
  const h = Math.floor(height / k);
  const gray = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let dy = 0; dy < k; dy++) {
        let p = ((y * k + dy) * width + x * k) * 4;
        for (let dx = 0; dx < k; dx++, p += 4) sum += 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
      }
      gray[y * w + x] = sum / (k * k);
    }
  }
  return { gray, w, h };
}

// The brightness that best splits the picture into a dark group and a bright one.
function otsu(gray) {
  const hist = new Float64Array(256);
  for (let i = 0; i < gray.length; i++) hist[Math.min(255, gray[i] | 0)]++;
  let total = 0;
  for (let v = 0; v < 256; v++) total += v * hist[v];
  let below = 0;
  let sumBelow = 0;
  let best = 127;
  let bestScore = -1;
  for (let v = 0; v < 256; v++) {
    below += hist[v];
    if (below === 0) continue;
    const above = gray.length - below;
    if (above === 0) break;
    sumBelow += v * hist[v];
    const diff = sumBelow / below - (total - sumBelow) / above;
    const score = below * above * diff * diff;
    if (score > bestScore) { bestScore = score; best = v; }
  }
  return best;
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

// Look for a bright sheet on a darker surface. Returns its corners as
// fractions of the picture (0..1), or null when there is no clear sheet: the
// paper fills the frame, the surface is as light as the paper, or the "edge"
// found is only a shadow or uneven light.
export function detectPage({ gray, w, h }) {
  const n = w * h;
  const cut = otsu(gray);

  // The surface the paper lies on: broad dark areas that can be reached from
  // the edge of the picture. "Broad" matters. A drawn line that runs off the
  // edge of the paper is dark and touches the desk, and must not be followed
  // into the sheet, so only pixels with nothing but dark around them (THIN
  // pixels each way) carry the search. Whatever is left afterwards is the
  // sheet, including the drawing on it.
  const THIN = 2;
  const dark = new Uint8Array(n);
  for (let i = 0; i < n; i++) dark[i] = gray[i] <= cut ? 1 : 0;
  const broadX = new Uint8Array(n);
  const broad = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let all = 1;
      for (let d = -THIN; d <= THIN && all; d++) {
        const xx = x + d;
        if (xx >= 0 && xx < w && !dark[y * w + xx]) all = 0; // beyond the frame counts as dark
      }
      broadX[y * w + x] = all;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let all = 1;
      for (let d = -THIN; d <= THIN && all; d++) {
        const yy = y + d;
        if (yy >= 0 && yy < h && !broadX[yy * w + x]) all = 0;
      }
      broad[y * w + x] = all;
    }
  }
  const reached = new Uint8Array(n);
  const stack = new Int32Array(n);
  let top = 0;
  const seed = (i) => { if (!reached[i] && broad[i]) { reached[i] = 1; stack[top++] = i; } };
  for (let x = 0; x < w; x++) { seed(x); seed(n - w + x); }
  for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
  while (top > 0) {
    const i = stack[--top];
    const x = i % w;
    if (x > 0) seed(i - 1);
    if (x < w - 1) seed(i + 1);
    if (i >= w) seed(i - w);
    if (i < n - w) seed(i + w);
  }
  // Give the surface back the THIN-pixel rim the "broad" test shaved off it.
  const outside = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!dark[i]) continue;
      let near = 0;
      for (let dy = -THIN; dy <= THIN && !near; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -THIN; dx <= THIN; dx++) {
          const xx = x + dx;
          if (xx >= 0 && xx < w && reached[yy * w + xx]) { near = 1; break; }
        }
      }
      outside[i] = near;
    }
  }

  // The largest connected piece of "not surface" is the sheet. Its corners
  // are the points furthest along each diagonal.
  const seen = new Uint8Array(n);
  let bestSize = 0;
  let at = null;
  for (let start = 0; start < n; start++) {
    if (seen[start] || outside[start]) continue;
    const far = { tl: Infinity, br: -Infinity, tr: -Infinity, bl: Infinity };
    const found = { tl: null, tr: null, br: null, bl: null };
    let size = 0;
    top = 0;
    stack[top++] = start;
    seen[start] = 1;
    const visit = (j) => { if (!seen[j] && !outside[j]) { seen[j] = 1; stack[top++] = j; } };
    while (top > 0) {
      const i = stack[--top];
      size++;
      const x = i % w;
      const y = (i - x) / w;
      if (x + y < far.tl) { far.tl = x + y; found.tl = [x, y]; }
      if (x + y > far.br) { far.br = x + y; found.br = [x, y]; }
      if (x - y > far.tr) { far.tr = x - y; found.tr = [x, y]; }
      if (x - y < far.bl) { far.bl = x - y; found.bl = [x, y]; }
      if (x > 0) visit(i - 1);
      if (x < w - 1) visit(i + 1);
      if (i >= w) visit(i - w);
      if (i < n - w) visit(i + w);
    }
    if (size > bestSize) { bestSize = size; at = found; }
  }
  if (bestSize < 0.12 * n) return null;
  const quad = [at.tl, at.tr, at.br, at.bl];

  // The four points should enclose roughly the area found (a sheet, not a blob).
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const [x1, y1] = quad[i];
    const [x2, y2] = quad[(i + 1) % 4];
    area += x1 * y2 - x2 * y1;
  }
  area = Math.abs(area) / 2;
  if (area < 0.7 * bestSize || area > 1.5 * bestSize) return null;

  // Every edge that isn't cut off by the frame must be a real step from paper
  // to something darker, not a soft change in the light.
  const cx = (quad[0][0] + quad[1][0] + quad[2][0] + quad[3][0]) / 4;
  const cy = (quad[0][1] + quad[1][1] + quad[2][1] + quad[3][1]) / 4;
  const sample = (x, y) => {
    const px = Math.round(x);
    const py = Math.round(y);
    return px < 0 || py < 0 || px >= w || py >= h ? null : gray[py * w + px];
  };
  let realEdges = 0;
  for (let e = 0; e < 4; e++) {
    const [ax, ay] = quad[e];
    const [bx, by] = quad[(e + 1) % 4];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    let nx = -(by - ay) / len;
    let ny = (bx - ax) / len;
    if (nx * (cx - ax) + ny * (cy - ay) < 0) { nx = -nx; ny = -ny; } // point inward
    const steps = [];
    for (let t = 0.15; t <= 0.851; t += 0.07) {
      const px = ax + (bx - ax) * t;
      const py = ay + (by - ay) * t;
      // Paper is the brightest thing just inside the edge; looking a few
      // pixels deep finds it even when a drawn border hugs the paper's edge.
      let inside = null;
      for (let d = 1; d <= 5; d++) {
        const v = sample(px + nx * d, py + ny * d);
        if (v !== null && (inside === null || v > inside)) inside = v;
      }
      const o2 = sample(px - nx * 2, py - ny * 2);
      const o3 = sample(px - nx * 3, py - ny * 3);
      if (inside !== null && o2 !== null && o3 !== null) steps.push(inside - Math.min(o2, o3));
    }
    if (steps.length < 4) continue; // this edge runs along the frame
    if (median(steps) < MIN_EDGE_STEP) return null;
    realEdges++;
  }
  if (realEdges === 0) return null;

  // Pull each corner a little toward the middle so the desk and the paper's
  // shadowed edge are left out.
  const INSET = 0.025;
  return quad.map(([x, y]) => [
    Math.min(1, Math.max(0, (x + 0.5 + (cx - x) * INSET) / w)),
    Math.min(1, Math.max(0, (y + 0.5 + (cy - y) * INSET) / h)),
  ]);
}

// Size of the straightened picture: as wide as the sheet's longer horizontal
// edge and as tall as its longer vertical edge, shrunk to fit maxSide.
export function straightSize(corners, maxSide) {
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const [tl, tr, br, bl] = corners;
  const w = Math.max(d(tl, tr), d(bl, br));
  const h = Math.max(d(tl, bl), d(tr, br));
  const k = Math.min(1, maxSide / Math.max(w, h));
  return { width: Math.max(8, Math.round(w * k)), height: Math.max(8, Math.round(h * k)) };
}

// The eight numbers that map a point (u, v) of a w-by-h rectangle to the
// matching point inside the four corners.
function rectToQuad(corners, w, h) {
  const from = [[0, 0], [w, 0], [w, h], [0, h]];
  const m = [];
  for (let i = 0; i < 4; i++) {
    const [u, v] = from[i];
    const [x, y] = corners[i];
    m.push([u, v, 1, 0, 0, 0, -u * x, -v * x, x]);
    m.push([0, 0, 0, u, v, 1, -u * y, -v * y, y]);
  }
  // Gaussian elimination with partial pivoting.
  for (let col = 0; col < 8; col++) {
    let pivot = col;
    for (let r = col + 1; r < 8; r++) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    if (Math.abs(m[pivot][col]) < 1e-9) return null; // corners in a line: no sheet to straighten
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let r = 0; r < 8; r++) {
      if (r === col) continue;
      const f = m[r][col] / m[col][col];
      if (f === 0) continue;
      for (let c = col; c < 9; c++) m[r][c] -= f * m[col][c];
    }
  }
  return m.map((row, i) => row[8] / row[i]);
}

// Straighten the part of `src` inside `corners` (in src pixels) into a
// width-by-height picture. Returns { data, width, height } like an ImageData,
// or null if the corners can't form a sheet.
export function straighten(src, corners, width, height) {
  const H = rectToQuad(corners, width, height);
  if (!H) return null;
  const { data: s, width: sw, height: sh } = src;
  const out = new Uint8ClampedArray(width * height * 4);
  let o = 0;
  for (let v = 0; v < height; v++) {
    for (let u = 0; u < width; u++, o += 4) {
      const z = H[6] * (u + 0.5) + H[7] * (v + 0.5) + 1;
      const x = Math.min(sw - 1, Math.max(0, (H[0] * (u + 0.5) + H[1] * (v + 0.5) + H[2]) / z - 0.5));
      const y = Math.min(sh - 1, Math.max(0, (H[3] * (u + 0.5) + H[4] * (v + 0.5) + H[5]) / z - 0.5));
      const x0 = x | 0;
      const y0 = y | 0;
      const x1 = Math.min(sw - 1, x0 + 1);
      const y1 = Math.min(sh - 1, y0 + 1);
      const fx = x - x0;
      const fy = y - y0;
      const a = (y0 * sw + x0) * 4;
      const b = (y0 * sw + x1) * 4;
      const c = (y1 * sw + x0) * 4;
      const d = (y1 * sw + x1) * 4;
      for (let ch = 0; ch < 3; ch++) {
        out[o + ch] =
          (s[a + ch] * (1 - fx) + s[b + ch] * fx) * (1 - fy) + (s[c + ch] * (1 - fx) + s[d + ch] * fx) * fy;
      }
      out[o + 3] = 255;
    }
  }
  return { data: out, width, height };
}

// Two steps after a photo has been cleaned into line art (see cleanup.js),
// both on the alpha channel of that line art. Pure functions, no DOM, so they
// run the same in the browser and in a test.
//
// keepFigure: keep only the character. Lines are thickened until the strokes
//   of one figure touch, the biggest blob is the character, and every line
//   inside its outline (eyes, buttons) stays. Things around it (hearts, labels)
//   go.
// traceNeat: "neat lines". Finds the middle of every pencil line and redraws it
//   as a smooth stroke of even width, so the shapes stay exactly Ada's but the
//   line looks inked. Returns SVG path data.

const INK = 90; // alpha above this counts as a line

// Square dilation of radius r as two sliding-window passes (linear time).
function dilate(mask, w, h, r) {
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    let n = 0;
    for (let x = 0; x < w + r; x++) {
      if (x < w) n += mask[o + x];
      if (x - 2 * r - 1 >= 0) n -= mask[o + x - 2 * r - 1];
      const cx = x - r;
      if (cx >= 0 && cx < w) tmp[o + cx] = n > 0 ? 1 : 0;
    }
  }
  for (let x = 0; x < w; x++) {
    let n = 0;
    for (let y = 0; y < h + r; y++) {
      if (y < h) n += tmp[y * w + x];
      if (y - 2 * r - 1 >= 0) n -= tmp[(y - 2 * r - 1) * w + x];
      const cy = y - r;
      if (cy >= 0 && cy < h) out[cy * w + x] = n > 0 ? 1 : 0;
    }
  }
  return out;
}

// Returns a copy of `alpha` with everything outside the main figure cleared,
// or null when there are no lines at all.
export function keepFigure(alpha, w, h) {
  const ink = new Uint8Array(w * h);
  let any = false;
  for (let i = 0; i < ink.length; i++) if (alpha[i] > INK) { ink[i] = 1; any = true; }
  if (!any) return null;
  const thick = dilate(ink, w, h, Math.max(3, Math.round(Math.max(w, h) / 130)));

  // Biggest blob of the thickened lines.
  const label = new Int32Array(w * h);
  let best = 0;
  let bestSize = 0;
  let next = 0;
  const stack = [];
  for (let i = 0; i < thick.length; i++) {
    if (!thick[i] || label[i]) continue;
    next++;
    let size = 0;
    label[i] = next;
    stack.push(i);
    while (stack.length) {
      const j = stack.pop();
      size++;
      const x = j % w;
      if (x > 0 && thick[j - 1] && !label[j - 1]) { label[j - 1] = next; stack.push(j - 1); }
      if (x < w - 1 && thick[j + 1] && !label[j + 1]) { label[j + 1] = next; stack.push(j + 1); }
      if (j >= w && thick[j - w] && !label[j - w]) { label[j - w] = next; stack.push(j - w); }
      if (j < w * h - w && thick[j + w] && !label[j + w]) { label[j + w] = next; stack.push(j + w); }
    }
    if (size > bestSize) { bestSize = size; best = next; }
  }

  // Outside = what the border can reach without crossing the figure.
  const outside = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length) {
    const j = stack.pop();
    if (outside[j] || label[j] === best) continue;
    outside[j] = 1;
    const x = j % w;
    if (x > 0) stack.push(j - 1);
    if (x < w - 1) stack.push(j + 1);
    if (j >= w) stack.push(j - w);
    if (j < w * h - w) stack.push(j + w);
  }
  const out = alpha.slice();
  for (let i = 0; i < out.length; i++) if (outside[i]) out[i] = 0;
  return out;
}

// ---- Neat lines -------------------------------------------------------------

// Enlarge the alpha channel by `s` (bilinear), soften it a little and threshold
// it, so the thinned lines come out smooth rather than pixel-stepped.
function upscaleMask(alpha, w, h, s) {
  const W = Math.round(w * s);
  const H = Math.round(h * s);
  const big = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const fy = Math.min(h - 1, Math.max(0, (y + 0.5) / s - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(h - 1, y0 + 1);
    const ty = fy - y0;
    for (let x = 0; x < W; x++) {
      const fx = Math.min(w - 1, Math.max(0, (x + 0.5) / s - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(w - 1, x0 + 1);
      const tx = fx - x0;
      const top = alpha[y0 * w + x0] * (1 - tx) + alpha[y0 * w + x1] * tx;
      const bot = alpha[y1 * w + x0] * (1 - tx) + alpha[y1 * w + x1] * tx;
      big[y * W + x] = top * (1 - ty) + bot * ty;
    }
  }
  // Box blur, radius about one source pixel, rows then columns.
  const r = Math.max(1, Math.round(s * 0.7));
  const tmp = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    let acc = 0;
    for (let x = -r; x < W + r; x++) {
      if (x + r < W) acc += big[y * W + Math.max(0, x + r)];
      if (x - r - 1 >= 0) acc -= big[y * W + x - r - 1];
      if (x >= 0 && x < W) tmp[y * W + x] = acc / (2 * r + 1);
    }
  }
  const mask = new Uint8Array(W * H);
  for (let x = 0; x < W; x++) {
    let acc = 0;
    for (let y = -r; y < H + r; y++) {
      if (y + r < H) acc += tmp[Math.max(0, y + r) * W + x];
      if (y - r - 1 >= 0) acc -= tmp[(y - r - 1) * W + x];
      if (y >= 0 && y < H) mask[y * W + x] = acc / (2 * r + 1) > 80 ? 1 : 0;
    }
  }
  return { mask, W, H };
}

// Zhang-Suen thinning down to one-pixel-wide lines.
function thin(mask, w, h) {
  const m = mask.slice();
  let live = [];
  for (let i = 0; i < m.length; i++) if (m[i]) live.push(i);
  const p = new Uint8Array(8);
  const look = (i) => {
    const x = i % w;
    const up = i >= w;
    const dn = i < m.length - w;
    const lf = x > 0;
    const rt = x < w - 1;
    p[0] = up ? m[i - w] : 0;
    p[1] = up && rt ? m[i - w + 1] : 0;
    p[2] = rt ? m[i + 1] : 0;
    p[3] = dn && rt ? m[i + w + 1] : 0;
    p[4] = dn ? m[i + w] : 0;
    p[5] = dn && lf ? m[i + w - 1] : 0;
    p[6] = lf ? m[i - 1] : 0;
    p[7] = up && lf ? m[i - w - 1] : 0;
  };
  let changed = true;
  while (changed) {
    changed = false;
    for (const step of [0, 1]) {
      const kill = [];
      for (const i of live) {
        look(i);
        let b = 0;
        let a = 0;
        for (let k = 0; k < 8; k++) { b += p[k]; if (!p[k] && p[(k + 1) % 8]) a++; }
        if (b < 2 || b > 6 || a !== 1) continue;
        if (step === 0 ? p[0] * p[2] * p[4] || p[2] * p[4] * p[6] : p[0] * p[2] * p[6] || p[0] * p[4] * p[6]) continue;
        kill.push(i);
      }
      for (const i of kill) m[i] = 0;
      if (kill.length) { changed = true; live = live.filter((i) => m[i]); }
    }
  }
  return m;
}

function skeletonNeighbors(sk, w, h, i) {
  const x = i % w;
  const out = [];
  for (const d of [-w - 1, -w, -w + 1, -1, 1, w - 1, w, w + 1]) {
    const j = i + d;
    if (j < 0 || j >= w * h || Math.abs((j % w) - x) > 1) continue;
    if (sk[j]) out.push(j);
  }
  return out;
}

// Walk the skeleton into paths (pixel indices) running between end points and
// junctions; closed loops come out as paths that end where they start.
function tracePaths(sk, w, h) {
  const deg = new Uint8Array(sk.length);
  const pix = [];
  for (let i = 0; i < sk.length; i++) if (sk[i]) { deg[i] = skeletonNeighbors(sk, w, h, i).length; pix.push(i); }
  const used = new Set();
  const key = (a, b) => (a < b ? a * 4294967296 + b : b * 4294967296 + a);
  const paths = [];
  const walk = (start, next) => {
    const path = [start];
    let prev = start;
    let cur = next;
    used.add(key(prev, cur));
    for (;;) {
      path.push(cur);
      if (deg[cur] !== 2 || cur === start) break;
      const nx = skeletonNeighbors(sk, w, h, cur).find((j) => j !== prev && !used.has(key(cur, j)));
      if (nx === undefined) break;
      used.add(key(cur, nx));
      prev = cur;
      cur = nx;
    }
    return path;
  };
  for (const i of pix) if (deg[i] !== 2) for (const j of skeletonNeighbors(sk, w, h, i)) if (!used.has(key(i, j))) paths.push(walk(i, j));
  for (const i of pix) for (const j of skeletonNeighbors(sk, w, h, i)) if (!used.has(key(i, j))) paths.push(walk(i, j));
  return { paths, deg };
}

// Drop short spurs (free end on one side, junction on the other) and specks.
// Short links between two junctions stay, or lines would break.
function prune(paths, deg, minLen) {
  return paths.filter((p) => {
    const a = deg[p[0]];
    const b = deg[p[p.length - 1]];
    const spur = (a === 1 && b >= 3) || (b === 1 && a >= 3);
    const speck = a <= 1 && b <= 1;
    return !((spur || speck) && p.length < minLen);
  });
}

// Treat each clump of touching junction pixels as one node, drop the tiny links
// inside a clump, and at each node join the two path ends that continue most
// straight. A line crossing another stays one stroke.
function joinAtJunctions(paths, deg, w, scale) {
  const parent = new Map();
  const find = (i) => {
    while (parent.get(i) !== i) { parent.set(i, parent.get(parent.get(i))); i = parent.get(i); }
    return i;
  };
  for (const p of paths) for (const i of p) if (deg[i] >= 3 && !parent.has(i)) parent.set(i, i);
  for (const i of parent.keys()) {
    for (const d of [1, w - 1, w, w + 1]) {
      const j = i + d;
      if (parent.has(j) && Math.abs((j % w) - (i % w)) <= 1) parent.set(find(i), find(j));
    }
  }
  const clumpOf = (i) => (parent.has(i) ? find(i) : -1);
  const live = paths.filter((p) => {
    const a = clumpOf(p[0]);
    return !(a !== -1 && a === clumpOf(p[p.length - 1]) && p.length <= 2 * scale + 3);
  });

  const reach = Math.max(3, Math.round(4 * scale));
  const ends = new Map();
  live.forEach((p, pi) => {
    for (const start of [true, false]) {
      const e = start ? p[0] : p[p.length - 1];
      const c = clumpOf(e);
      if (c === -1) continue;
      const k = Math.min(p.length - 1, reach);
      const q = start ? p[k] : p[p.length - 1 - k];
      const dx = (q % w) - (e % w);
      const dy = Math.floor(q / w) - Math.floor(e / w);
      const n = Math.hypot(dx, dy) || 1;
      if (!ends.has(c)) ends.set(c, []);
      ends.get(c).push({ pi, start, dx: dx / n, dy: dy / n });
    }
  });
  const ek = (e) => `${e.pi}:${e.start}`;
  const link = new Map();
  for (const list of ends.values()) {
    const pairs = [];
    for (let a = 0; a < list.length; a++) {
      for (let b = a + 1; b < list.length; b++) {
        if (list[a].pi === list[b].pi) continue;
        pairs.push({ a: list[a], b: list[b], s: -(list[a].dx * list[b].dx + list[a].dy * list[b].dy) });
      }
    }
    pairs.sort((x, y) => y.s - x.s);
    for (const { a, b, s } of pairs) {
      if (s < 0.3) break;
      if (link.has(ek(a)) || link.has(ek(b))) continue;
      link.set(ek(a), b);
      link.set(ek(b), a);
    }
  }

  const done = new Uint8Array(live.length);
  const chains = [];
  const chainFrom = (pi, start) => {
    const pix = [];
    let cur = { pi, start };
    while (cur && !done[cur.pi]) {
      done[cur.pi] = 1;
      const p = live[cur.pi];
      pix.push(...(cur.start ? p : p.slice().reverse()));
      cur = link.get(ek({ pi: cur.pi, start: !cur.start })) || null;
    }
    return pix.map((i) => [i % w, Math.floor(i / w)]);
  };
  live.forEach((p, pi) => { if (!done[pi] && !link.has(`${pi}:true`)) chains.push(chainFrom(pi, true)); });
  live.forEach((p, pi) => { if (!done[pi] && !link.has(`${pi}:false`)) chains.push(chainFrom(pi, false)); });
  live.forEach((p, pi) => { if (!done[pi]) chains.push(chainFrom(pi, true)); });
  return chains;
}

// Join two free ends that are close and point at each other: faint pencil that
// didn't survive the cleanup. Chains are arrays of [x, y].
function bridgeGaps(chains, maxGap, reach) {
  const out = (c, start) => {
    const e = start ? c[0] : c[c.length - 1];
    const q = start ? c[Math.min(c.length - 1, reach)] : c[Math.max(0, c.length - 1 - reach)];
    const dx = e[0] - q[0];
    const dy = e[1] - q[1];
    const n = Math.hypot(dx, dy) || 1;
    return { e, dx: dx / n, dy: dy / n };
  };
  // End 2c is the start of chain c, 2c + 1 its end. Ends are put in a grid of
  // maxGap squares, so each is only compared with the ends near it.
  const ends = chains.flatMap((c) => [out(c, true), out(c, false)]);
  const cellOf = (e) => `${Math.floor(e[0] / maxGap)},${Math.floor(e[1] / maxGap)}`;
  const grid = new Map();
  ends.forEach((E, k) => {
    const key = cellOf(E.e);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(k);
  });
  const pairs = [];
  ends.forEach((A, a) => {
    const cx = Math.floor(A.e[0] / maxGap);
    const cy = Math.floor(A.e[1] / maxGap);
    for (let gx = cx - 1; gx <= cx + 1; gx++) {
      for (let gy = cy - 1; gy <= cy + 1; gy++) {
        for (const b of grid.get(`${gx},${gy}`) || []) {
          if (b <= a || b >> 1 === a >> 1) continue;
          const B = ends[b];
          const vx = B.e[0] - A.e[0];
          const vy = B.e[1] - A.e[1];
          const dist = Math.hypot(vx, vy);
          if (dist > maxGap || dist === 0) continue;
          if ((A.dx * vx + A.dy * vy) / dist < 0.6 || -(B.dx * vx + B.dy * vy) / dist < 0.6) continue;
          pairs.push({ a, b, dist });
        }
      }
    }
  });

  // Closest first, while both ends are still free and on different strokes.
  pairs.sort((x, y) => x.dist - y.dist);
  const parent = chains.map((_, i) => i);
  const find = (i) => {
    while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
    return i;
  };
  const link = new Map();
  for (const { a, b } of pairs) {
    if (link.has(a) || link.has(b)) continue;
    const ra = find(a >> 1);
    const rb = find(b >> 1);
    if (ra === rb) continue;
    parent[ra] = rb;
    link.set(a, b);
    link.set(b, a);
  }

  // Walk each joined stroke from one of its free ends.
  const done = new Uint8Array(chains.length);
  const joined = [];
  for (let k = 0; k < ends.length; k++) {
    if (link.has(k) || done[k >> 1]) continue;
    const pts = [];
    for (let e = k; e !== undefined; e = link.get(e ^ 1)) {
      done[e >> 1] = 1;
      const c = chains[e >> 1];
      if (e & 1) for (let i = c.length - 1; i >= 0; i--) pts.push(c[i]);
      else for (const p of c) pts.push(p);
    }
    joined.push(pts);
  }
  return joined;
}

function smooth(pts, r) {
  if (pts.length < 5) return pts;
  return pts.map((pt, k) => {
    if (k === 0 || k === pts.length - 1) return pt;
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (let j = Math.max(0, k - r); j <= Math.min(pts.length - 1, k + r); j++) { sx += pts[j][0]; sy += pts[j][1]; n++; }
    return [sx / n, sy / n];
  });
}

function simplify(pts, eps) {
  if (pts.length < 3) return pts;
  const [ax, ay] = pts[0];
  const [bx, by] = pts[pts.length - 1];
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  let worst = 0;
  let at = 0;
  for (let k = 1; k < pts.length - 1; k++) {
    const d = Math.abs(dy * pts[k][0] - dx * pts[k][1] + bx * ay - by * ax) / len;
    if (d > worst) { worst = d; at = k; }
  }
  if (worst <= eps) return [pts[0], pts[pts.length - 1]];
  return [...simplify(pts.slice(0, at + 1), eps).slice(0, -1), ...simplify(pts.slice(at), eps)];
}

// Smooth curve through the points (Catmull-Rom written as cubic Beziers).
function pathData(pts, f) {
  const P = pts.map(([x, y]) => [x * f, y * f]);
  const r = (v) => Math.round(v * 10) / 10;
  if (P.length === 1) P.push(P[0]);
  let d = `M${r(P[0][0])} ${r(P[0][1])}`;
  if (P.length === 2) return `${d}L${r(P[1][0])} ${r(P[1][1])}`;
  for (let k = 0; k < P.length - 1; k++) {
    const p0 = P[k - 1] || P[k];
    const p1 = P[k];
    const p2 = P[k + 1];
    const p3 = P[k + 2] || p2;
    d += `C${r(p1[0] + (p2[0] - p0[0]) / 6)} ${r(p1[1] + (p2[1] - p0[1]) / 6)} ${r(p2[0] - (p3[0] - p1[0]) / 6)} ${r(p2[1] - (p3[1] - p1[1]) / 6)} ${r(p2[0])} ${r(p2[1])}`;
  }
  return d;
}

// alpha: the line art's alpha channel (w x h). Returns { paths, width } in the
// same pixel units: SVG path data for each stroke and the pen width to draw
// them with (about the width of Ada's own lines).
export function traceNeat(alpha, w, h) {
  const s = Math.min(3, Math.max(1, 2400 / Math.max(w, h)));
  const { mask, W, H } = upscaleMask(alpha, w, h, s);
  let ink = 0;
  for (let i = 0; i < mask.length; i++) ink += mask[i];
  const sk = thin(mask, W, H);
  let bones = 0;
  for (let i = 0; i < sk.length; i++) bones += sk[i];
  const { paths, deg } = tracePaths(sk, W, H);
  const chains = bridgeGaps(joinAtJunctions(prune(paths, deg, 6 * s), deg, W, s), 14 * s, Math.round(4 * s));
  return {
    paths: chains.map((c) => pathData(simplify(smooth(c, Math.round(1.5 * s)), 0.6 * s), 1 / s)),
    width: Math.min(6, Math.max(2, ink / Math.max(1, bones) / s)),
  };
}

// A standalone SVG of the neat lines, cut to the box (x, y, w, h) of the line art.
export function neatSvg({ paths, width }, x, y, w, h, color = '#1b1b2f') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${x} ${y} ${w} ${h}">`
    + `<g fill="none" stroke="${color}" stroke-width="${width.toFixed(2)}" stroke-linecap="round" stroke-linejoin="round">`
    + paths.map((d) => `<path d="${d}"/>`).join('')
    + '</g></svg>';
}

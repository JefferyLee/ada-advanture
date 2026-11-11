// Split a line drawing into the areas its lines enclose, so each area can be
// filled with a color by tapping it. Pure functions over pixel arrays, no DOM.
//
// Children's lines often don't quite meet. To stop color leaking through a
// small opening, the lines are thickened by `gap` pixels before the areas are
// found (closing openings up to about twice that wide). The areas are then
// grown back, a little past the edge of the line, so color reaches right under
// the ink with no white rim.

const INK_ALPHA = 96; // a pixel this opaque or more counts as line
const UNDER_LINE = 3; // how far color continues underneath the ink

const each4 = (i, w, h, visit) => {
  const x = i % w;
  if (x > 0) visit(i - 1);
  if (x < w - 1) visit(i + 1);
  if (i >= w) visit(i - w);
  if (i < w * (h - 1)) visit(i + w);
};

// alpha: one byte per pixel (the drawing's opacity). Returns labels, one
// Int32 per pixel: 0 for "no area" (deep under a thick line), otherwise the
// area's number from 1 to count.
export function buildRegions(alpha, w, h, gap = 3) {
  const n = w * h;
  const closed = new Uint8Array(n);
  let frontier = new Int32Array(n);
  let next = new Int32Array(n);
  let size = 0;

  for (let i = 0; i < n; i++) {
    if (alpha[i] >= INK_ALPHA) { closed[i] = 1; frontier[size++] = i; }
  }
  for (let step = 0; step < gap && size > 0; step++) {
    let nextSize = 0;
    for (let k = 0; k < size; k++) {
      each4(frontier[k], w, h, (j) => { if (!closed[j]) { closed[j] = 1; next[nextSize++] = j; } });
    }
    [frontier, next, size] = [next, frontier, nextSize];
  }

  // Number each connected open area.
  const labels = new Int32Array(n);
  let count = 0;
  const stack = next;
  for (let start = 0; start < n; start++) {
    if (closed[start] || labels[start]) continue;
    count++;
    let top = 0;
    stack[top++] = start;
    labels[start] = count;
    while (top > 0) {
      each4(stack[--top], w, h, (j) => {
        if (!closed[j] && !labels[j]) { labels[j] = count; stack[top++] = j; }
      });
    }
  }

  // Grow every area back over the thickened band and a little under the ink.
  size = 0;
  for (let i = 0; i < n; i++) {
    if (!labels[i]) continue;
    let edge = false;
    each4(i, w, h, (j) => { if (!labels[j]) edge = true; });
    if (edge) frontier[size++] = i;
  }
  const spare = new Int32Array(n);
  let from = frontier;
  let to = spare;
  for (let step = 0; step < gap + UNDER_LINE && size > 0; step++) {
    let nextSize = 0;
    for (let k = 0; k < size; k++) {
      const label = labels[from[k]];
      each4(from[k], w, h, (j) => { if (!labels[j]) { labels[j] = label; to[nextSize++] = j; } });
    }
    [from, to, size] = [to, from, nextSize];
  }

  return { labels, count };
}

// The area at a point, looking a few pixels around if the point is on a line.
export function regionAt(labels, w, h, x, y, reach = 8) {
  const px = Math.round(x);
  const py = Math.round(y);
  if (px < 0 || py < 0 || px >= w || py >= h) return 0;
  if (labels[py * w + px]) return labels[py * w + px];
  let best = 0;
  let bestD = Infinity;
  for (let dy = -reach; dy <= reach; dy++) {
    for (let dx = -reach; dx <= reach; dx++) {
      const xx = px + dx;
      const yy = py + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const label = labels[yy * w + xx];
      const d = dx * dx + dy * dy;
      if (label && d < bestD) { best = label; bestD = d; }
    }
  }
  return best;
}

const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

// fills: [{ x, y, color }] with x and y as fractions of the picture (0..1) and
// color a "#rrggbb" string, or null to un-color. Later fills win. Returns the
// RGBA pixels of the color layer that sits under the line drawing.
export function paintFills(labels, w, h, fills) {
  const colorOf = new Map();
  for (const f of fills) {
    const label = regionAt(labels, w, h, f.x * w, f.y * h);
    if (!label) continue;
    if (f.color) colorOf.set(label, hexToRgb(f.color));
    else colorOf.delete(label);
  }
  const out = new Uint8ClampedArray(w * h * 4);
  if (colorOf.size === 0) return out;
  for (let i = 0, p = 0; i < labels.length; i++, p += 4) {
    const rgb = colorOf.get(labels[i]);
    if (!rgb) continue;
    out[p] = rgb[0]; out[p + 1] = rgb[1]; out[p + 2] = rgb[2]; out[p + 3] = 255;
  }
  return out;
}

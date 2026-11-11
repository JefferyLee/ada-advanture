// Turn a photo of a drawing on paper into clean line art: dark lines on a
// transparent background. Pure functions over pixel arrays, no DOM, so it runs
// the same in the browser and in a test.
//
// Steps: grayscale -> estimate the paper brightness around each pixel (this is
// what removes shadows and uneven light) -> keep pixels clearly darker than the
// paper -> drop tiny specks -> report the bounding box of what is left.

const INK = [27, 27, 47];

function paperBrightness(gray, w, h) {
  // One value per block: a bright percentile of the block, so thin lines
  // crossing the block don't drag the estimate down.
  const B = Math.max(8, Math.round(Math.max(w, h) / 48));
  const gw = Math.ceil(w / B);
  const gh = Math.ceil(h / B);
  let grid = new Float32Array(gw * gh);
  const hist = new Uint32Array(256);
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      hist.fill(0);
      let count = 0;
      const y1 = Math.min(h, (gy + 1) * B);
      const x1 = Math.min(w, (gx + 1) * B);
      for (let y = gy * B; y < y1; y++) {
        for (let x = gx * B; x < x1; x++) { hist[gray[y * w + x] | 0]++; count++; }
      }
      let need = Math.max(1, Math.floor(count * 0.1));
      let v = 255;
      for (; v > 0; v--) { need -= hist[v]; if (need <= 0) break; }
      grid[gy * gw + gx] = Math.max(v, 1);
    }
  }
  // A block fully covered by ink has no paper in it; borrow from neighbours
  // (max of 3x3), then blur so block edges don't show.
  const pass = (src, pick) => {
    const out = new Float32Array(gw * gh);
    for (let gy = 0; gy < gh; gy++) {
      for (let gx = 0; gx < gw; gx++) {
        let acc = 0;
        let cnt = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const yy = gy + dy;
            const xx = gx + dx;
            if (yy < 0 || xx < 0 || yy >= gh || xx >= gw) continue;
            const val = src[yy * gw + xx];
            if (pick === 'max') acc = Math.max(acc, val); else acc += val;
            cnt++;
          }
        }
        out[gy * gw + gx] = pick === 'max' ? acc : acc / cnt;
      }
    }
    return out;
  };
  grid = pass(pass(grid, 'max'), 'mean');
  return { grid, gw, gh, B };
}

export function cleanLineArt(src, { darkness = 65, smudge = 30 } = {}) {
  const { width: w, height: h, data } = src;
  const n = w * h;
  const gray = new Float32Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const a = data[p + 3] / 255;
    const lum = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
    gray[i] = lum * a + 255 * (1 - a); // transparent counts as white paper
  }

  const { grid, gw, gh, B } = paperBrightness(gray, w, h);
  const threshold = 0.5 + 0.4 * (darkness / 100); // fraction of paper brightness
  const soft = 0.1;
  const mask = new Uint8Array(n);
  const alpha = new Uint8ClampedArray(n);

  for (let y = 0; y < h; y++) {
    const fy = Math.min(gh - 1, Math.max(0, (y + 0.5) / B - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(gh - 1, y0 + 1);
    const ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(gw - 1, Math.max(0, (x + 0.5) / B - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(gw - 1, x0 + 1);
      const tx = fx - x0;
      const bg =
        (grid[y0 * gw + x0] * (1 - tx) + grid[y0 * gw + x1] * tx) * (1 - ty) +
        (grid[y1 * gw + x0] * (1 - tx) + grid[y1 * gw + x1] * tx) * ty;
      const i = y * w + x;
      const norm = gray[i] / bg;
      if (norm < threshold) {
        mask[i] = 1;
        alpha[i] = 255 * (0.45 + 0.55 * Math.min(1, (threshold - norm) / soft));
      }
    }
  }

  // Remove specks: connected groups of ink smaller than minArea.
  const minArea = Math.round((smudge / 100) * 0.00012 * n);
  if (minArea > 1) {
    const seen = new Uint8Array(n);
    const stack = new Int32Array(n);
    for (let start = 0; start < n; start++) {
      if (!mask[start] || seen[start]) continue;
      let top = 0;
      let size = 0;
      stack[top++] = start;
      seen[start] = 1;
      while (top > 0) {
        const i = stack[--top];
        // The same buffer holds the to-visit stack at the front and the
        // group's members at the back. They can't collide: together they never
        // hold more pixels than have been pushed, which is at most n.
        stack[n - 1 - size] = i;
        size++;
        const x = i % w;
        const y = (i - x) / w;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= w) continue;
            const j = yy * w + xx;
            if (mask[j] && !seen[j]) { seen[j] = 1; stack[top++] = j; }
          }
        }
      }
      if (size < minArea) {
        for (let k = 0; k < size; k++) mask[stack[n - 1 - k]] = 0;
      }
    }
  }

  const out = new Uint8ClampedArray(n * 4);
  let x0 = w, y0 = h, x1 = -1, y1 = -1, inkPixels = 0;
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    if (!mask[i]) continue;
    out[p] = INK[0]; out[p + 1] = INK[1]; out[p + 2] = INK[2]; out[p + 3] = alpha[i];
    inkPixels++;
    const x = i % w;
    const y = (i - x) / w;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return { data: out, width: w, height: h, inkPixels, bbox: inkPixels ? { x0, y0, x1, y1 } : null };
}

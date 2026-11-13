// Opening picture files.

const KEEP_SIDE = 2200; // a photo kept for later is shrunk to this

export async function loadBitmap(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

// A camera photo is far bigger than needed. This returns a smaller JPEG of
// it, the right way up, ready to store and send between devices, and its
// print (see printOf).
export async function shrinkPhoto(file) {
  const bitmap = await loadBitmap(file);
  const k = Math.min(1, KEEP_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * k);
  canvas.height = Math.round(bitmap.height * k);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
  return { blob, print: printOf(ctx, canvas.width, canvas.height) };
}

// A photo's print: how bright it is on a 32x32 grid, to tell when the same
// photo is added again, even saved again by another app. Two shots of the
// same drawing are never this close, so both of those are kept.
const PRINT_SIDE = 32;

function printOf(ctx, w, h) {
  const { data } = ctx.getImageData(0, 0, w, h);
  const sum = new Float64Array(PRINT_SIDE * PRINT_SIDE);
  const count = new Uint32Array(PRINT_SIDE * PRINT_SIDE);
  for (let y = 0; y < h; y++) {
    const row = Math.floor((y * PRINT_SIDE) / h) * PRINT_SIDE;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const cell = row + Math.floor((x * PRINT_SIDE) / w);
      sum[cell] += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      count[cell]++;
    }
  }
  return btoa(String.fromCharCode(...Array.from(sum, (s, k) => Math.round(s / count[k]))));
}

export function samePhoto(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  const x = atob(a);
  const y = atob(b);
  let total = 0;
  let worst = 0;
  for (let i = 0; i < x.length; i++) {
    const d = Math.abs(x.charCodeAt(i) - y.charCodeAt(i));
    total += d;
    worst = Math.max(worst, d);
  }
  return total / x.length < 3 && worst < 16;
}

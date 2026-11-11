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
// it, the right way up, ready to store and send between devices.
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
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
}

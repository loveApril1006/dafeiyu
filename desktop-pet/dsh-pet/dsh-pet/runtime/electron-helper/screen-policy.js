// Coarse pixels suppress cursor/video noise; no screenshot or title is persisted.
function signature(image) {
  const bytes = image.resize({ width: 48, height: 27, quality: 'good' }).toBitmap();
  const out = [];
  for (let i = 0; i < bytes.length; i += 4) out.push((bytes[i] + bytes[i + 1] + bytes[i + 2]) / 3);
  return out;
}
function distance(a, b) {
  if (!a || !b || a.length !== b.length) return 1;
  return a.reduce((sum, n, i) => sum + Math.abs(n - b[i]), 0) / a.length / 255;
}
function maskWindows(image, display, bounds, nativeImage) {
  const size = image.getSize(), pixels = image.toBitmap();
  for (const box of bounds) {
    const left = Math.max(0, Math.floor((box.x - display.x) / display.width * size.width));
    const top = Math.max(0, Math.floor((box.y - display.y) / display.height * size.height));
    const right = Math.min(size.width, Math.ceil((box.x + box.width - display.x) / display.width * size.width));
    const bottom = Math.min(size.height, Math.ceil((box.y + box.height - display.y) / display.height * size.height));
    for (let y = top; y < bottom; y++) {
      for (let x = left; x < right; x++) { const i = (y * size.width + x) * 4; pixels[i] = pixels[i + 1] = pixels[i + 2] = 128; pixels[i + 3] = 255; }
    }
  }
  return nativeImage.createFromBitmap(pixels, size);
}
module.exports = { signature, distance, maskWindows };

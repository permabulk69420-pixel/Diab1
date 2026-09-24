// Procedural texture helpers for the asset studio (runs in the browser).
export function rand(seed = 1) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
/** Smooth value noise. The lattice repeats every `period` units, so noise sampled over
 *  [0, period) tiles seamlessly. */
export function noise2(seed, period = 512) {
  const P = period, g = new Float32Array(P * P), r = rand(seed);
  for (let i = 0; i < g.length; i++) g[i] = r();
  const at = (x, y) => g[(((y % P) + P) % P) * P + (((x % P) + P) % P)];
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}
export function fbm(n, x, y, oct = 4, lac = 2.03) {
  let s = 0, a = .5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) { s += a * n(x * f, y * f); norm += a; a *= .5; f *= lac; }
  return s / norm;
}
export const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const mix = (a, b, t) => a + (b - a) * t;

/** rgb: Float32Array of 0..1 values (w*h*3). Returns a canvas. */
export function rgbCanvas(w, h, rgb) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d'), img = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    img.data[i * 4] = Math.round(Math.min(1, Math.max(0, rgb[i * 3])) * 255);
    img.data[i * 4 + 1] = Math.round(Math.min(1, Math.max(0, rgb[i * 3 + 1])) * 255);
    img.data[i * 4 + 2] = Math.round(Math.min(1, Math.max(0, rgb[i * 3 + 2])) * 255);
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0); return c;
}
/** Tangent-space normal map from a height field (metres-ish units, scaled by strength). */
export function normalCanvas(w, h, height, strength, wrap = true) {
  const rgb = new Float32Array(w * h * 3);
  const H = (x, y) => {
    if (wrap) { x = (x + w) % w; y = (y + h) % h; } else { x = Math.min(w - 1, Math.max(0, x)); y = Math.min(h - 1, Math.max(0, y)); }
    return height[y * w + x];
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    // Canvas y runs down while texture v runs up, hence the sign on dy.
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y - 1) - H(x, y + 1)) * strength;
    const l = Math.hypot(dx, dy, 1), i = (y * w + x) * 3;
    rgb[i] = (-dx / l) * .5 + .5; rgb[i + 1] = (-dy / l) * .5 + .5; rgb[i + 2] = (1 / l) * .5 + .5;
  }
  return rgbCanvas(w, h, rgb);
}
export function texture(THREE, canvas, {srgb = false, repeat = false, jpeg = true} = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.userData.mimeType = jpeg ? 'image/jpeg' : 'image/png';
  return t;
}

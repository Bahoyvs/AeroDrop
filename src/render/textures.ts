import { CanvasSource, Texture, type SCALE_MODE, type WRAP_MODE } from 'pixi.js';
import { Rng } from '../core/rng';

/**
 * Everything the game draws is generated here at boot: no external image
 * assets, no network fetches, and the "hand-authored PNG" look (specular
 * highlight, inner shadow, rim light) is baked once into a canvas.
 */

interface TexOptions {
  scaleMode?: SCALE_MODE;
  addressMode?: WRAP_MODE;
}

function canvas(size: number, height = size): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = height;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('AeroDrop: 2D canvas context unavailable');
  return { c, ctx };
}

export function toTexture(c: HTMLCanvasElement, opts: TexOptions = {}): Texture {
  const source = new CanvasSource({
    resource: c,
    scaleMode: opts.scaleMode ?? 'linear',
    addressMode: opts.addressMode ?? 'clamp-to-edge',
    alphaMode: 'premultiply-alpha-on-upload',
  });
  return new Texture({ source });
}

// --------------------------------------------------------------------- noise

/** Tileable value noise, so displacement/caustics can scroll forever. */
function valueNoise(size: number, freq: number, seed: number): Float32Array {
  const rand = new Rng(seed);
  const lattice = new Float32Array(freq * freq);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rand.next();

  const out = new Float32Array(size * size);
  const smooth = (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * freq;
      const fy = (y / size) * freq;
      const x0 = Math.floor(fx) % freq;
      const y0 = Math.floor(fy) % freq;
      const x1 = (x0 + 1) % freq;
      const y1 = (y0 + 1) % freq;
      const tx = smooth(fx - Math.floor(fx));
      const ty = smooth(fy - Math.floor(fy));
      const a = lattice[y0 * freq + x0]!;
      const b = lattice[y0 * freq + x1]!;
      const c = lattice[y1 * freq + x0]!;
      const d = lattice[y1 * freq + x1]!;
      const top = a + (b - a) * tx;
      const bottom = c + (d - c) * tx;
      out[y * size + x] = top + (bottom - top) * ty;
    }
  }
  return out;
}

function fbm(size: number, octaves: number, baseFreq: number, seed: number): Float32Array {
  const out = new Float32Array(size * size);
  let amp = 1;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    const layer = valueNoise(size, baseFreq * 2 ** o, seed + o * 7919);
    for (let i = 0; i < out.length; i++) out[i] += layer[i]! * amp;
    total += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] = out[i]! / total;
  return out;
}

// --------------------------------------------------------------------- drops

/**
 * The metaball silhouette. Solid core with a short feathered edge: sharp
 * enough to survive the alpha threshold, soft enough not to alias.
 */
export function makeBlobTexture(size = 256): Texture {
  const { c, ctx } = canvas(size);
  const r = size / 2;
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.82, 'rgba(255,255,255,1)');
  g.addColorStop(0.97, 'rgba(255,255,255,0.75)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return toTexture(c);
}

/**
 * Specular pass: the big top-left highlight, a tight sparkle, and the bright
 * bottom rim you get when light refracts through a water droplet. Drawn in
 * white so it can sit over any body tint with an additive blend.
 */
export function makeGlossTexture(size = 512): Texture {
  const { c, ctx } = canvas(size);
  const r = size / 2;

  ctx.save();
  ctx.beginPath();
  ctx.arc(r, r, r * 0.985, 0, Math.PI * 2);
  ctx.clip();

  // Broad sheen across the upper half.
  const sheen = ctx.createLinearGradient(0, 0, 0, size);
  sheen.addColorStop(0, 'rgba(255,255,255,0.42)');
  sheen.addColorStop(0.42, 'rgba(255,255,255,0.06)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, size, size);

  // Main elliptical highlight, top-left.
  ctx.save();
  ctx.translate(r * 0.66, r * 0.55);
  ctx.scale(1, 0.62);
  const hi = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.5);
  hi.addColorStop(0, 'rgba(255,255,255,0.95)');
  hi.addColorStop(0.45, 'rgba(255,255,255,0.5)');
  hi.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hi;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Tight sparkle.
  ctx.save();
  ctx.translate(r * 0.6, r * 0.44);
  ctx.scale(1, 0.7);
  const spark = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.17);
  spark.addColorStop(0, 'rgba(255,255,255,1)');
  spark.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = spark;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.17, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Refracted bottom rim - the detail that reads as "this is water".
  const rim = ctx.createRadialGradient(r, r * 1.12, r * 0.6, r, r * 1.05, r);
  rim.addColorStop(0, 'rgba(255,255,255,0)');
  rim.addColorStop(0.82, 'rgba(220,250,255,0.12)');
  rim.addColorStop(0.95, 'rgba(255,255,255,0.55)');
  rim.addColorStop(1, 'rgba(255,255,255,0.1)');
  ctx.fillStyle = rim;
  ctx.fillRect(0, 0, size, size);

  ctx.restore();
  return toTexture(c);
}

/** Inner shadow + edge darkening, multiplied under the gloss for volume. */
export function makeShadeTexture(size = 512): Texture {
  const { c, ctx } = canvas(size);
  const r = size / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(r, r, r * 0.985, 0, Math.PI * 2);
  ctx.clip();

  const inner = ctx.createRadialGradient(r, r, r * 0.5, r, r, r);
  inner.addColorStop(0, 'rgba(2,26,46,0)');
  inner.addColorStop(0.78, 'rgba(2,26,46,0.12)');
  inner.addColorStop(0.96, 'rgba(2,22,40,0.42)');
  inner.addColorStop(1, 'rgba(2,18,34,0.15)');
  ctx.fillStyle = inner;
  ctx.fillRect(0, 0, size, size);

  // Shadow pooling opposite the key light.
  ctx.save();
  ctx.translate(r * 1.3, r * 1.35);
  ctx.scale(1, 0.85);
  const pool = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.7);
  pool.addColorStop(0, 'rgba(0,18,36,0.28)');
  pool.addColorStop(1, 'rgba(0,18,36,0)');
  ctx.fillStyle = pool;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.restore();
  return toTexture(c);
}

/** Soft radial falloff - reused for glows, shadows and the boost flash. */
export function makeGlowTexture(size = 256): Texture {
  const { c, ctx } = canvas(size);
  const r = size / 2;
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return toTexture(c);
}

/** Glossy little food orb: body, highlight, and a faint dark rim. */
export function makeFoodTexture(size = 96): Texture {
  const { c, ctx } = canvas(size);
  const r = size / 2;

  const body = ctx.createRadialGradient(r * 0.75, r * 0.7, r * 0.1, r, r, r * 0.94);
  body.addColorStop(0, 'rgba(255,255,255,0.98)');
  body.addColorStop(0.45, 'rgba(255,255,255,0.72)');
  body.addColorStop(0.86, 'rgba(255,255,255,0.42)');
  body.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(r, r, r * 0.94, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(r * 0.72, r * 0.6);
  ctx.scale(1, 0.7);
  const hi = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.34);
  hi.addColorStop(0, 'rgba(255,255,255,1)');
  hi.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hi;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.34, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  return toTexture(c);
}

/** Rising background bubble: thin bright ring plus a highlight dot. */
export function makeBubbleTexture(size = 96): Texture {
  const { c, ctx } = canvas(size);
  const r = size / 2;

  const fill = ctx.createRadialGradient(r, r, r * 0.2, r, r, r * 0.92);
  fill.addColorStop(0, 'rgba(255,255,255,0.02)');
  fill.addColorStop(0.72, 'rgba(200,240,255,0.08)');
  fill.addColorStop(0.93, 'rgba(255,255,255,0.55)');
  fill.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(r, r, r * 0.92, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(r * 0.68, r * 0.62);
  ctx.scale(1, 0.75);
  const hi = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.22);
  hi.addColorStop(0, 'rgba(255,255,255,0.9)');
  hi.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hi;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  return toTexture(c);
}

// ---------------------------------------------------------------- background

/**
 * RG displacement map. Red drives horizontal offset, green vertical, both
 * centred on 128 so a flat 0.5/0.5 map means "no displacement".
 */
export function makeNoiseTexture(size = 256): Texture {
  const { c, ctx } = canvas(size);
  const nx = fbm(size, 3, 4, 1337);
  const ny = fbm(size, 3, 4, 7331);
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    img.data[i * 4 + 0] = Math.round(nx[i]! * 255);
    img.data[i * 4 + 1] = Math.round(ny[i]! * 255);
    img.data[i * 4 + 2] = 128;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c, { addressMode: 'repeat' });
}

/**
 * Underwater caustics: thin bright ridges pulled out of tileable noise by
 * folding it around its midpoint and sharpening what's left.
 */
export function makeCausticsTexture(size = 512): Texture {
  const { c, ctx } = canvas(size);
  const n = fbm(size, 4, 5, 20040);
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const ridge = 1 - Math.abs(n[i]! * 2 - 1);
    // A high exponent leaves only the thin bright crests, which is what reads
    // as light refracting through a surface rather than as fog.
    const a = Math.pow(ridge, 12) * 255;
    img.data[i * 4 + 0] = 190;
    img.data[i * 4 + 1] = 245;
    img.data[i * 4 + 2] = 255;
    img.data[i * 4 + 3] = Math.min(255, Math.round(a));
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c, { addressMode: 'repeat' });
}

/** Vertical depth gradient - the water column behind everything else. */
export function makeDepthTexture(height = 512): Texture {
  const { c, ctx } = canvas(4, height);
  const g = ctx.createLinearGradient(0, 0, 0, height);
  g.addColorStop(0, '#0d5f8f');
  g.addColorStop(0.28, '#0a4a74');
  g.addColorStop(0.62, '#06304f');
  g.addColorStop(1, '#021a2e');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, height);
  return toTexture(c);
}

/** Faint grid used to sell motion across the open water. */
export function makeGridTexture(size = 256): Texture {
  const { c, ctx } = canvas(size);
  ctx.strokeStyle = 'rgba(190,240,255,0.10)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0.5, 0);
  ctx.lineTo(0.5, size);
  ctx.moveTo(0, 0.5);
  ctx.lineTo(size, 0.5);
  ctx.stroke();
  return toTexture(c, { addressMode: 'repeat' });
}

export interface TextureSet {
  blob: Texture;
  gloss: Texture;
  shade: Texture;
  glow: Texture;
  food: Texture;
  bubble: Texture;
  noise: Texture;
  caustics: Texture;
  depth: Texture;
  grid: Texture;
}

export function buildTextures(): TextureSet {
  return {
    blob: makeBlobTexture(),
    gloss: makeGlossTexture(),
    shade: makeShadeTexture(),
    glow: makeGlowTexture(),
    food: makeFoodTexture(),
    bubble: makeBubbleTexture(),
    noise: makeNoiseTexture(),
    caustics: makeCausticsTexture(),
    depth: makeDepthTexture(),
    grid: makeGridTexture(),
  };
}

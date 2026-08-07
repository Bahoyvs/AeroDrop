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
 * Fades a texture out before its own boundary. The drop's silhouette is a
 * deforming soft body, so anything baked with a hard circular edge would show
 * up as a second, perfectly round outline sitting inside the wobbling surface.
 * Edge treatment belongs to the threshold shader, which follows the real
 * (and merged) surface - these sprites carry interior lighting only.
 */
function featherEdge(ctx: CanvasRenderingContext2D, size: number, inner = 0.55, outer = 0.9): void {
  const r = size / 2;
  const mask = ctx.createRadialGradient(r, r, r * inner, r, r, r * outer);
  mask.addColorStop(0, 'rgba(255,255,255,1)');
  mask.addColorStop(0.7, 'rgba(255,255,255,0.55)');
  mask.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = mask;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'source-over';
}

/**
 * Specular pass: the broad sheen, the big top-left highlight and a tight
 * sparkle. Drawn in white so it sits over any body tint with an additive
 * blend, and never rotated by the renderer - the key light is fixed, which is
 * what keeps a stretching, wobbling drop reading as glass.
 */
export function makeGlossTexture(size = 512): Texture {
  const { c, ctx } = canvas(size);
  const r = size / 2;

  // Broad sheen across the upper half.
  const sheen = ctx.createLinearGradient(0, 0, 0, size);
  sheen.addColorStop(0, 'rgba(255,255,255,0.62)');
  sheen.addColorStop(0.42, 'rgba(255,255,255,0.1)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, size, size);

  // Main elliptical highlight, top-left. Blown right out to white in the
  // middle: the Vista-era "wet plastic" read comes from a highlight that
  // clips rather than one that politely rolls off.
  ctx.save();
  ctx.translate(r * 0.66, r * 0.55);
  ctx.scale(1, 0.62);
  const hi = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.56);
  hi.addColorStop(0, 'rgba(255,255,255,1)');
  hi.addColorStop(0.34, 'rgba(255,255,255,0.9)');
  hi.addColorStop(0.62, 'rgba(255,255,255,0.4)');
  hi.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hi;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.56, 0, Math.PI * 2);
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

  featherEdge(ctx, size, 0.5, 0.92);
  return toTexture(c);
}

/**
 * Volume shading: light pools opposite the key light, giving the drop a sense
 * of thickness that a rim alone can't. No edge darkening - the shader owns the
 * shell - so this can never fight the deforming silhouette.
 *
 * Frutiger Aero shadows are never neutral black: the fill light in these
 * renders is the sky, so the shaded side goes cool blue and stays luminous.
 */
export function makeShadeTexture(size = 512): Texture {
  const { c, ctx } = canvas(size);
  const r = size / 2;

  ctx.save();
  ctx.translate(r * 1.24, r * 1.3);
  ctx.scale(1, 0.86);
  const pool = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.82);
  pool.addColorStop(0, 'rgba(16,74,124,0.24)');
  pool.addColorStop(0.6, 'rgba(16,74,124,0.1)');
  pool.addColorStop(1, 'rgba(16,74,124,0)');
  ctx.fillStyle = pool;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.82, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Bounce light coming back up off the bright water below - the giveaway of
  // an overexposed, high-key scene rather than a dim one.
  ctx.save();
  ctx.translate(r, r * 1.42);
  ctx.scale(1, 0.5);
  const bounce = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.7);
  bounce.addColorStop(0, 'rgba(226,252,255,0.4)');
  bounce.addColorStop(1, 'rgba(226,252,255,0)');
  ctx.fillStyle = bounce;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  featherEdge(ctx, size, 0.45, 0.88);
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

/**
 * Rising background bubble. A real bubble is a thin shell: almost nothing in
 * the middle, a tight bright ring where the film turns away from the viewer, a
 * specular dot up-left and a dimmer bounce down-right.
 */
export function makeBubbleTexture(size = 128): Texture {
  const { c, ctx } = canvas(size);
  const r = size / 2;
  const edge = r * 0.94;

  // Shell: transparent core, bright thin ring right at the boundary. The film
  // is thin enough to split light, so the ring runs through a faint spectrum
  // instead of staying white - that iridescence is what makes it a soap
  // bubble rather than a circle.
  const shell = ctx.createRadialGradient(r, r, 0, r, r, edge);
  shell.addColorStop(0, 'rgba(214,248,255,0.03)');
  shell.addColorStop(0.6, 'rgba(214,248,255,0.06)');
  shell.addColorStop(0.8, 'rgba(196,255,246,0.16)');
  shell.addColorStop(0.89, 'rgba(255,236,190,0.3)');
  shell.addColorStop(0.945, 'rgba(255,255,255,0.92)');
  shell.addColorStop(0.975, 'rgba(198,226,255,0.5)');
  shell.addColorStop(1, 'rgba(214,248,255,0)');
  ctx.fillStyle = shell;
  ctx.fillRect(0, 0, size, size);

  ctx.save();
  ctx.beginPath();
  ctx.arc(r, r, edge, 0, Math.PI * 2);
  ctx.clip();

  // Pink/violet swirl across the film, the other half of the interference.
  ctx.save();
  ctx.translate(r * 0.5, r * 1.2);
  ctx.rotate(-0.7);
  ctx.scale(1, 0.45);
  const swirl = ctx.createRadialGradient(0, 0, r * 0.15, 0, 0, r * 0.85);
  swirl.addColorStop(0, 'rgba(255,196,236,0)');
  swirl.addColorStop(0.55, 'rgba(255,196,236,0.16)');
  swirl.addColorStop(1, 'rgba(196,214,255,0)');
  ctx.fillStyle = swirl;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.85, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Specular cap, up and to the left of centre.
  ctx.save();
  ctx.translate(r * 0.64, r * 0.56);
  ctx.rotate(-0.5);
  ctx.scale(1, 0.52);
  const hi = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.3);
  hi.addColorStop(0, 'rgba(255,255,255,0.92)');
  hi.addColorStop(0.55, 'rgba(255,255,255,0.28)');
  hi.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hi;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Light bouncing back through the far wall.
  ctx.save();
  ctx.translate(r * 1.34, r * 1.36);
  ctx.scale(1, 0.7);
  const bounce = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.34);
  bounce.addColorStop(0, 'rgba(200,244,255,0.34)');
  bounce.addColorStop(1, 'rgba(200,244,255,0)');
  ctx.fillStyle = bounce;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.34, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.restore();
  return toTexture(c);
}

/**
 * Refraction map for one drop, in the RG-offset form DisplacementFilter wants:
 * 128 means "no shift", and the offset points back toward the centre so the
 * water magnifies whatever is behind it. Strength climbs toward the rim, the
 * way it does through a real lens, and the alpha feathers out at the boundary
 * so the sprite blends into the neutral grey map without a visible seam.
 */
export function makeLensTexture(size = 256): Texture {
  const { c, ctx } = canvas(size);
  const img = ctx.createImageData(size, size);
  const r = size / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const dx = (x + 0.5 - r) / r;
      const dy = (y + 0.5 - r) / r;
      const q = Math.hypot(dx, dy);

      if (q >= 1) {
        img.data[i] = 128;
        img.data[i + 1] = 128;
        img.data[i + 2] = 128;
        img.data[i + 3] = 0;
        continue;
      }

      // Bend hardly at all through the middle, hardest just inside the rim,
      // then release to nothing exactly at the surface.
      const falloff = 1 - smoothstep(0.78, 1, q);
      const strength = Math.pow(q, 1.5) * falloff;
      const nx = q > 0.0001 ? -(dx / q) * strength : 0;
      const ny = q > 0.0001 ? -(dy / q) * strength : 0;

      img.data[i] = Math.round(128 + 127 * nx);
      img.data[i + 1] = Math.round(128 + 127 * ny);
      img.data[i + 2] = 128;
      img.data[i + 3] = Math.round(255 * (1 - smoothstep(0.93, 1, q)));
    }
  }

  ctx.putImageData(img, 0, 0);
  return toTexture(c);
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
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
 *
 * Pure white and much stronger than a physically plausible caustic would be.
 * The whole Frutiger Aero look is built on blown-out white light dancing over
 * saturated colour, so the crests are pushed until they clip.
 */
export function makeCausticsTexture(size = 512): Texture {
  const { c, ctx } = canvas(size);
  const n = fbm(size, 4, 5, 20040);
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const ridge = 1 - Math.abs(n[i]! * 2 - 1);
    // A high exponent leaves only the thin bright crests, which is what reads
    // as light refracting through a surface rather than as a web of lightning
    // across the whole screen.
    const a = Math.pow(ridge, 13) * 320;
    img.data[i * 4 + 0] = 255;
    img.data[i * 4 + 1] = 255;
    img.data[i * 4 + 2] = 255;
    img.data[i * 4 + 3] = Math.min(255, Math.round(a));
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c, { addressMode: 'repeat' });
}

/**
 * The sky column behind everything. Not a depth gradient into darkness any
 * more: this is the Vista wallpaper read, sunlit water at the top rolling down
 * into saturated tropical turquoise, and it never gets anywhere near black.
 *
 * It also never gets anywhere near white. The arena has to stay a mid-value
 * field, because the drops are the bright objects in this scene and they have
 * nothing to read against if the water is already blown out.
 */
export function makeDepthTexture(height = 512): Texture {
  const { c, ctx } = canvas(4, height);
  const g = ctx.createLinearGradient(0, 0, 0, height);
  g.addColorStop(0, '#8fe6ff');
  g.addColorStop(0.16, '#63d3f9');
  g.addColorStop(0.42, '#31b9ef');
  g.addColorStop(0.7, '#1c9fdd');
  g.addColorStop(1, '#1187cb');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, height);
  return toTexture(c);
}

/** Faint grid used to sell motion across the open water. */
export function makeGridTexture(size = 256): Texture {
  const { c, ctx } = canvas(size);
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0.5, 0);
  ctx.lineTo(0.5, size);
  ctx.moveTo(0, 0.5);
  ctx.lineTo(size, 0.5);
  ctx.stroke();
  return toTexture(c, { addressMode: 'repeat' });
}

/**
 * God rays. Shafts of sunlight raking down from the surface - the single most
 * recognisable Frutiger Aero motif after the bubbles.
 *
 * Tiles horizontally only. The slant is baked in (a per-row phase shift, which
 * leaves the pattern periodic in x), and the vertical fade is baked in too, so
 * the caller stretches exactly one tile over the screen height and repeats
 * sideways forever.
 */
export function makeSunbeamTexture(size = 512): Texture {
  const { c, ctx } = canvas(size);
  const img = ctx.createImageData(size, size);
  // Integer frequencies keep every harmonic seamless across the x wrap.
  const shafts = [
    { freq: 3, amp: 1, phase: 0 },
    { freq: 5, amp: 0.55, phase: 1.9 },
    { freq: 8, amp: 0.32, phase: 4.1 },
    { freq: 13, amp: 0.16, phase: 2.4 },
  ];

  for (let y = 0; y < size; y++) {
    const v = y / size;
    // Bright at the surface, gone before the bottom of the screen.
    const fade = Math.pow(1 - smoothstep(0, 0.82, v), 1.6);
    // Rays lean as they descend, the way they do under a rippled surface.
    const slant = v * 0.55;
    for (let x = 0; x < size; x++) {
      const u = x / size + slant;
      let n = 0;
      for (const s of shafts) n += Math.sin((u * s.freq + s.phase) * Math.PI * 2) * s.amp;
      // Fold to positive and sharpen: broad soft shafts, not a sine wash.
      const beam = Math.pow(Math.max(0, n / 2.03) , 2.2);
      const i = (y * size + x) * 4;
      img.data[i] = 255;
      img.data[i + 1] = 255;
      img.data[i + 2] = 255;
      img.data[i + 3] = Math.min(255, Math.round(beam * fade * 255));
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c, { addressMode: 'repeat' });
}

/**
 * Sun bloom hanging just above the top of the screen - the light source the
 * god rays and the caustics are supposedly coming from.
 */
export function makeSunGlowTexture(size = 512): Texture {
  const { c, ctx } = canvas(size);
  const r = size / 2;
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.6)');
  g.addColorStop(0.42, 'rgba(226,250,255,0.24)');
  g.addColorStop(0.72, 'rgba(196,240,255,0.07)');
  g.addColorStop(1, 'rgba(180,232,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return toTexture(c);
}

export interface TextureSet {
  blob: Texture;
  gloss: Texture;
  shade: Texture;
  glow: Texture;
  food: Texture;
  bubble: Texture;
  lens: Texture;
  noise: Texture;
  caustics: Texture;
  depth: Texture;
  grid: Texture;
  sunbeam: Texture;
  sunGlow: Texture;
}

export function buildTextures(): TextureSet {
  return {
    blob: makeBlobTexture(),
    gloss: makeGlossTexture(),
    shade: makeShadeTexture(),
    glow: makeGlowTexture(),
    food: makeFoodTexture(),
    bubble: makeBubbleTexture(),
    lens: makeLensTexture(),
    noise: makeNoiseTexture(),
    caustics: makeCausticsTexture(),
    depth: makeDepthTexture(),
    grid: makeGridTexture(),
    sunbeam: makeSunbeamTexture(),
    sunGlow: makeSunGlowTexture(),
  };
}

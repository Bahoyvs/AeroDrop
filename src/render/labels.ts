import { Texture } from 'pixi.js';
import { toTexture } from './textures';

/**
 * Name tags are rasterised small and then upscaled with nearest-neighbour
 * filtering, which is what gives them the chunky pixel-font look called for in
 * the design doc - white fill, thin black outline - without shipping a font.
 */

const FONT = 'bold 13px Tahoma, Verdana, Geneva, "DejaVu Sans", sans-serif';
const PAD = 5;
const HEIGHT = 20;

const cache = new Map<string, Texture>();
let measureCtx: CanvasRenderingContext2D | null = null;

function measure(text: string): number {
  if (!measureCtx) {
    const c = document.createElement('canvas');
    measureCtx = c.getContext('2d');
  }
  if (!measureCtx) return text.length * 8;
  measureCtx.font = FONT;
  return measureCtx.measureText(text).width;
}

export function labelTexture(text: string): Texture {
  const cached = cache.get(text);
  if (cached) return cached;

  const width = Math.max(8, Math.ceil(measure(text))) + PAD * 2;
  const c = document.createElement('canvas');
  c.width = width;
  c.height = HEIGHT;
  const ctx = c.getContext('2d');
  if (!ctx) return Texture.EMPTY;

  ctx.font = FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;

  // A deep marine outline rather than black: pure black is the one value that
  // never appears anywhere else in this palette and it shows.
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = 'rgba(5,52,86,0.94)';
  ctx.strokeText(text, width / 2, HEIGHT / 2 + 0.5);

  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, width / 2, HEIGHT / 2 + 0.5);

  const texture = toTexture(c, { scaleMode: 'nearest' });
  cache.set(text, texture);
  return texture;
}

/** Drops the cache between matches so bot names don't accumulate forever. */
export function clearLabelCache(): void {
  for (const texture of cache.values()) texture.destroy(true);
  cache.clear();
}

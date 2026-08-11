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

  const textWidth = Math.max(8, Math.ceil(measure(text)));
  const width = textWidth + PAD * 3;
  const c = document.createElement('canvas');
  c.width = width;
  c.height = HEIGHT;
  const ctx = c.getContext('2d');
  if (!ctx) return Texture.EMPTY;

  // Dark semi-transparent pill backdrop for guaranteed contrast against water & pellets
  ctx.fillStyle = 'rgba(3, 18, 32, 0.78)';
  const radius = 6;
  ctx.beginPath();
  ctx.roundRect(1, 1, width - 2, HEIGHT - 2, radius);
  ctx.fill();

  ctx.font = FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;

  // Deep dark stroke + crisp white fill
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(1, 10, 20, 0.95)';
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

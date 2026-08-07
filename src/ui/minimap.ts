import { WORLD } from '../core/config';
import { findColor } from '../game/cosmetics';
import type { World } from '../game/world';

/**
 * Small 2D-canvas radar. Kept off the WebGL path on purpose - it redraws a few
 * dozen dots per frame and would otherwise cost a render-target switch.
 */
export class Minimap {
  private ctx: CanvasRenderingContext2D | null;
  private dpr = Math.min(window.devicePixelRatio || 1, 2);
  private size = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d');
  }

  /**
   * The canvas is built while the HUD is still hidden (clientWidth 0) and the
   * CSS size changes with the breakpoint, so the backing store is matched to
   * the laid-out size here rather than once in the constructor.
   */
  private ensureSize(): number {
    const css = this.canvas.clientWidth || 132;
    if (css !== this.size && this.ctx) {
      this.size = css;
      this.canvas.width = Math.round(css * this.dpr);
      this.canvas.height = Math.round(css * this.dpr);
      // Resizing a canvas resets its transform, so re-apply the DPR scale.
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }
    return this.size;
  }

  draw(world: World, viewHalfW: number, viewHalfH: number, camX: number, camY: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const size = this.ensureSize();
    const sx = size / WORLD.width;
    const sy = size / WORLD.height;

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = 'rgba(4, 32, 54, 0.55)';
    ctx.fillRect(0, 0, size, size);

    // Camera viewport rectangle.
    ctx.strokeStyle = 'rgba(216, 251, 255, 0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(
      (camX - viewHalfW) * sx,
      (camY - viewHalfH) * sy,
      viewHalfW * 2 * sx,
      viewHalfH * 2 * sy,
    );

    for (const drop of world.drops) {
      if (!drop.alive || drop.isPlayer) continue;
      const r = Math.max(1.4, drop.radius * sx * 1.6);
      ctx.fillStyle = colorToCss(findColor(drop.colorId).tint, 0.7);
      ctx.beginPath();
      ctx.arc(drop.x * sx, drop.y * sy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    const player = world.player;
    if (player.alive) {
      const r = Math.max(2.6, player.radius * sx * 1.8);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(player.x * sx, player.y * sy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0, 40, 70, 0.8)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }
}

function colorToCss(color: number, alpha: number): string {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

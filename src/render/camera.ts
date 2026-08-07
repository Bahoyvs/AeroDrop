import { CAMERA } from '../core/config';
import { clamp, damp } from '../core/math';

/**
 * Follows the player and pulls back as they grow - the zoom is what sells the
 * sense of scale as a drop goes from speck to leviathan.
 */
export class Camera {
  x = 0;
  y = 0;
  scale = 1;

  private screenW = 1;
  private screenH = 1;

  resize(width: number, height: number): void {
    this.screenW = width;
    this.screenH = height;
  }

  snapTo(x: number, y: number, radius: number): void {
    this.x = x;
    this.y = y;
    this.scale = this.scaleFor(radius);
  }

  private scaleFor(radius: number): number {
    const halfView = CAMERA.baseView + radius * CAMERA.perRadius;
    // Frame against the short screen axis, so a wide monitor shows more arena
    // rather than a bigger drop. Below roughly a phone's width that rule alone
    // shrinks the drop into an unreadable dot, so small screens tighten up and
    // trade visible arena for a drop you can actually see.
    const minor = Math.max(1, Math.min(this.screenW, this.screenH));
    const fit = (minor / 2) * clamp(CAMERA.smallScreenReference / minor, 1, 1.7);
    return clamp(fit / halfView, CAMERA.minScale, CAMERA.maxScale);
  }

  update(targetX: number, targetY: number, radius: number, dt: number): void {
    this.x = damp(this.x, targetX, CAMERA.followLerp, dt);
    this.y = damp(this.y, targetY, CAMERA.followLerp, dt);
    this.scale = damp(this.scale, this.scaleFor(radius), CAMERA.zoomLerp, dt);
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return {
      x: (sx - this.screenW / 2) / this.scale + this.x,
      y: (sy - this.screenH / 2) / this.scale + this.y,
    };
  }

  /** Half-extents of the visible area in world units, with a small margin. */
  viewHalf(margin = 80): { w: number; h: number } {
    return {
      w: this.screenW / 2 / this.scale + margin,
      h: this.screenH / 2 / this.scale + margin,
    };
  }
}

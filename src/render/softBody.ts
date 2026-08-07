import { Mesh, MeshGeometry, type Texture } from 'pixi.js';
import { SOFTBODY } from '../core/config';
import { clamp } from '../core/math';

/**
 * Soft-body drop outline.
 *
 * A ring of points sits around the drop. Each one is held to the rest circle by
 * a spring, damped, and coupled to its two neighbours - so an impulse on one
 * side travels around the surface as a wave instead of denting it locally. A
 * change in the drop's velocity is injected as an impulse along each point's
 * normal, which flattens the leading edge and bulges the trailing one: the
 * water-balloon wobble, and a teardrop while accelerating.
 *
 * Offsets are stored as a fraction of the current radius, so the wobble looks
 * the same whether the drop is a speck or a leviathan, and the mesh can be
 * rebuilt from scratch every frame without re-tuning anything.
 */
export class SoftBody {
  readonly mesh: Mesh;

  private geometry: MeshGeometry;
  private positions: Float32Array;
  private offsets: Float32Array;
  private velocities: Float32Array;
  private cos: Float32Array;
  private sin: Float32Array;
  private lastVx = 0;
  private lastVy = 0;
  private primed = false;
  private readonly points: number;

  constructor(texture: Texture, points = SOFTBODY.points) {
    this.points = points;
    const n = points;

    // Vertex 0 is the centre; 1..n walk the rim, drawn as a triangle fan.
    this.positions = new Float32Array((n + 1) * 2);
    const uvs = new Float32Array((n + 1) * 2);
    const indices = new Uint32Array(n * 3);

    this.offsets = new Float32Array(n);
    this.velocities = new Float32Array(n);
    this.cos = new Float32Array(n);
    this.sin = new Float32Array(n);

    uvs[0] = 0.5;
    uvs[1] = 0.5;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.cos[i] = Math.cos(a);
      this.sin[i] = Math.sin(a);
      // The rim maps to the edge of the radial texture, so the fill stretches
      // with the deformation instead of sliding under it.
      uvs[(i + 1) * 2] = 0.5 + 0.5 * this.cos[i]!;
      uvs[(i + 1) * 2 + 1] = 0.5 + 0.5 * this.sin[i]!;

      indices[i * 3] = 0;
      indices[i * 3 + 1] = i + 1;
      indices[i * 3 + 2] = ((i + 1) % n) + 1;
    }

    this.geometry = new MeshGeometry({ positions: this.positions, uvs, indices });
    this.mesh = new Mesh({ geometry: this.geometry, texture });
  }

  /** Drops all deformation - used when a drop respawns somewhere else. */
  reset(): void {
    this.offsets.fill(0);
    this.velocities.fill(0);
    this.primed = false;
  }

  /** Fires a radial impulse outward from the drop's centre. */
  kick(strength: number): void {
    for (let i = 0; i < this.points; i++) {
      this.velocities[i]! += strength;
    }
  }

  /**
   * Advances the springs and rebuilds the mesh.
   * `vx`/`vy` are the drop's full velocity including any boost impulse.
   * Returns the mean radius factor, so callers can size the crisp overlay to
   * match the wobbling body.
   */
  update(dt: number, radius: number, vx: number, vy: number, time: number, phase: number): number {
    const n = this.points;

    if (!this.primed) {
      this.lastVx = vx;
      this.lastVy = vy;
      this.primed = true;
    }

    // --- Inertia. The velocity delta since last frame *is* the impulse, so
    // this stays correct at any frame rate without a dt factor.
    const dvx = vx - this.lastVx;
    const dvy = vy - this.lastVy;
    this.lastVx = vx;
    this.lastVy = vy;
    const drive = SOFTBODY.drive;
    if (dvx !== 0 || dvy !== 0) {
      for (let i = 0; i < n; i++) {
        const push = this.cos[i]! * dvx + this.sin[i]! * dvy;
        this.velocities[i]! -= push * drive;
      }
    }

    // --- Springs. Substepped on long frames so a hitch can't blow it up.
    const steps = dt > 0.025 ? 2 : 1;
    const h = dt / steps;
    for (let s = 0; s < steps; s++) {
      for (let i = 0; i < n; i++) {
        const prev = this.offsets[(i + n - 1) % n]!;
        const next = this.offsets[(i + 1) % n]!;
        const here = this.offsets[i]!;
        const accel =
          -SOFTBODY.stiffness * here +
          SOFTBODY.tension * (prev + next - 2 * here) -
          SOFTBODY.damping * this.velocities[i]!;
        this.velocities[i]! += accel * h;
      }
      for (let i = 0; i < n; i++) {
        this.offsets[i] = clamp(
          this.offsets[i]! + this.velocities[i]! * h,
          SOFTBODY.minOffset,
          SOFTBODY.maxOffset,
        );
      }
    }

    // --- Steady-state teardrop: elongate along the direction of travel.
    const speed = Math.hypot(vx, vy);
    const stretch = speed > 1 ? clamp(speed / SOFTBODY.stretchSpeed, 0, 1) * SOFTBODY.stretch : 0;
    const dirX = speed > 1 ? vx / speed : 1;
    const dirY = speed > 1 ? vy / speed : 0;
    const alongScale = 1 + stretch;
    const acrossScale = 1 - stretch * 0.62;

    // --- Rebuild the fan.
    const pos = this.positions;
    pos[0] = 0;
    pos[1] = 0;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const shimmer =
        Math.sin(time * SOFTBODY.idleSpeed + phase + (i / n) * Math.PI * 2 * SOFTBODY.idleWaves) *
        SOFTBODY.idleAmount;
      const factor = 1 + this.offsets[i]! + shimmer;
      sum += factor;

      const nx = this.cos[i]! * factor;
      const ny = this.sin[i]! * factor;
      // Split into components along and across the heading, then scale each.
      const along = nx * dirX + ny * dirY;
      const acrossX = nx - along * dirX;
      const acrossY = ny - along * dirY;

      pos[(i + 1) * 2] = (dirX * along * alongScale + acrossX * acrossScale) * radius;
      pos[(i + 1) * 2 + 1] = (dirY * along * alongScale + acrossY * acrossScale) * radius;
    }

    this.geometry.getBuffer('aPosition').update();
    return sum / n;
  }

  destroy(): void {
    this.mesh.destroy();
    this.geometry.destroy();
  }
}

import { Container, Sprite } from 'pixi.js';
import { rng } from '../core/rng';
import type { TextureSet } from './textures';

interface Particle {
  sprite: Sprite;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  grow: number;
  spin: number;
}

/**
 * Pooled additive particles: splash droplets when a drop bursts, expanding
 * rings for the shockwave, and little sparkles when food is absorbed.
 */
export class Fx {
  readonly container = new Container();

  private pool: Particle[] = [];
  private active: Particle[] = [];

  constructor(private textures: TextureSet) {
    this.container.blendMode = 'add';
  }

  private take(texture: 'glow' | 'bubble' | 'food'): Particle {
    const particle = this.pool.pop();
    if (particle) {
      particle.sprite.texture = this.textures[texture];
      particle.sprite.visible = true;
      this.active.push(particle);
      return particle;
    }
    const sprite = new Sprite(this.textures[texture]);
    sprite.anchor.set(0.5);
    sprite.blendMode = 'add';
    this.container.addChild(sprite);
    const fresh: Particle = {
      sprite,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0,
      maxLife: 1,
      size: 10,
      grow: 0,
      spin: 0,
    };
    this.active.push(fresh);
    return fresh;
  }

  /** A drop just got eaten: ring plus a spray of droplets. */
  burst(x: number, y: number, tint: number, radius: number): void {
    const ring = this.take('bubble');
    ring.x = x;
    ring.y = y;
    ring.vx = 0;
    ring.vy = 0;
    ring.life = ring.maxLife = 0.55;
    ring.size = radius * 2.1;
    ring.grow = radius * 9;
    ring.spin = 0;
    ring.sprite.tint = tint;

    const count = Math.min(26, 8 + Math.floor(radius / 6));
    for (let i = 0; i < count; i++) {
      const p = this.take('food');
      const angle = rng.range(0, Math.PI * 2);
      const speed = rng.range(90, 320) * (0.6 + radius / 90);
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.life = p.maxLife = rng.range(0.4, 0.95);
      p.size = rng.range(radius * 0.16, radius * 0.42) + 4;
      p.grow = -p.size * 0.6;
      p.spin = 0;
      p.sprite.tint = tint;
    }
  }

  /** Small pop when a pellet is absorbed. */
  pop(x: number, y: number, tint: number, size: number): void {
    const p = this.take('glow');
    p.x = x;
    p.y = y;
    p.vx = rng.range(-30, 30);
    p.vy = rng.range(-30, 30);
    p.life = p.maxLife = 0.24;
    p.size = size * 4.5;
    p.grow = size * 5;
    p.spin = 0;
    p.sprite.tint = tint;
  }

  /** Wake puff left behind by a Jet Boost. */
  boostPuff(x: number, y: number, dirX: number, dirY: number, tint: number, radius: number): void {
    for (let i = 0; i < 7; i++) {
      const p = this.take('glow');
      const spread = rng.range(-0.6, 0.6);
      const cos = Math.cos(spread);
      const sin = Math.sin(spread);
      const dx = dirX * cos - dirY * sin;
      const dy = dirX * sin + dirY * cos;
      const speed = rng.range(60, 240);
      p.x = x - dirX * radius * 0.7;
      p.y = y - dirY * radius * 0.7;
      p.vx = -dx * speed;
      p.vy = -dy * speed;
      p.life = p.maxLife = rng.range(0.25, 0.5);
      p.size = radius * rng.range(0.5, 1.1);
      p.grow = radius * 1.6;
      p.spin = 0;
      p.sprite.tint = tint;
    }
  }

  update(dt: number): void {
    let write = 0;
    for (let i = 0; i < this.active.length; i++) {
      const p = this.active[i]!;
      p.life -= dt;
      if (p.life <= 0) {
        p.sprite.visible = false;
        this.pool.push(p);
        continue;
      }
      const t = p.life / p.maxLife;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      // Droplets slow down in water rather than flying forever.
      const drag = Math.exp(-3.4 * dt);
      p.vx *= drag;
      p.vy *= drag;
      const size = p.size + p.grow * (1 - t);
      p.sprite.position.set(p.x, p.y);
      p.sprite.width = size;
      p.sprite.height = size;
      p.sprite.alpha = t * t;
      this.active[write++] = p;
    }
    this.active.length = write;
  }

  clear(): void {
    for (const p of this.active) {
      p.sprite.visible = false;
      this.pool.push(p);
    }
    this.active.length = 0;
  }
}

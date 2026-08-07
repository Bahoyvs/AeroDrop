import { Container, Sprite, TilingSprite } from 'pixi.js';
import { WORLD } from '../core/config';
import { Rng } from '../core/rng';
import type { Camera } from './camera';
import type { TextureSet } from './textures';

interface Bubble {
  sprite: Sprite;
  x: number;
  y: number;
  size: number;
  speed: number;
  drift: number;
  phase: number;
  parallax: number;
}

const BUBBLE_COUNT = 62;

/**
 * The water column: a depth gradient, two layers of scrolling caustics, a faint
 * world grid and a field of rising bubbles. Everything lives in screen space
 * and fakes depth with parallax, which costs a handful of draw calls instead of
 * a second world pass.
 */
export class Background {
  readonly container = new Container();

  private depth: Sprite;
  private causticsA: TilingSprite;
  private causticsB: TilingSprite;
  private grid: TilingSprite;
  private bubbleLayer = new Container();
  private bubbles: Bubble[] = [];
  private rng = new Rng(0xa3d0c0de);
  private width = 1;
  private height = 1;

  constructor(textures: TextureSet) {
    this.depth = new Sprite(textures.depth);
    this.depth.anchor.set(0);

    this.grid = new TilingSprite({ texture: textures.grid, width: 1, height: 1 });
    this.grid.alpha = 0.5;

    this.causticsA = new TilingSprite({ texture: textures.caustics, width: 1, height: 1 });
    this.causticsA.blendMode = 'add';
    this.causticsA.alpha = 0.1;
    this.causticsA.tileScale.set(1.5);

    this.causticsB = new TilingSprite({ texture: textures.caustics, width: 1, height: 1 });
    this.causticsB.blendMode = 'add';
    this.causticsB.alpha = 0.05;
    this.causticsB.tileScale.set(0.85);
    this.causticsB.tint = 0x9ee6ff;

    for (let i = 0; i < BUBBLE_COUNT; i++) {
      const sprite = new Sprite(textures.bubble);
      sprite.anchor.set(0.5);
      sprite.blendMode = 'add';
      this.bubbleLayer.addChild(sprite);
      this.bubbles.push(this.makeBubble(sprite, true));
    }

    this.container.addChild(this.depth, this.grid, this.causticsA, this.causticsB, this.bubbleLayer);
  }

  private makeBubble(sprite: Sprite, initial: boolean): Bubble {
    const parallax = this.rng.range(0.25, 0.9);
    return {
      sprite,
      x: this.rng.range(-60, this.width + 60),
      y: initial ? this.rng.range(-40, this.height + 40) : this.height + this.rng.range(20, 160),
      size: this.rng.range(5, 26) * (0.6 + parallax * 0.7),
      speed: this.rng.range(18, 62) * (0.5 + parallax),
      drift: this.rng.range(-14, 14),
      phase: this.rng.range(0, Math.PI * 2),
      parallax,
    };
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.depth.width = width;
    this.depth.height = height;
    for (const layer of [this.grid, this.causticsA, this.causticsB]) {
      layer.width = width;
      layer.height = height;
    }
    for (const bubble of this.bubbles) {
      if (bubble.x > width + 80) bubble.x = this.rng.range(0, width);
      if (bubble.y > height + 200) bubble.y = this.rng.range(0, height);
    }
  }

  update(camera: Camera, dt: number, time: number): void {
    // Caustics drift on their own while also sliding against camera movement.
    this.causticsA.tilePosition.set(
      -camera.x * 0.32 * camera.scale + Math.sin(time * 0.11) * 90 + time * 7,
      -camera.y * 0.32 * camera.scale + Math.cos(time * 0.09) * 70 + time * 4,
    );
    this.causticsB.tilePosition.set(
      -camera.x * 0.55 * camera.scale - time * 11,
      -camera.y * 0.55 * camera.scale + Math.sin(time * 0.13) * 120,
    );
    this.causticsA.alpha = 0.1 + Math.sin(time * 0.5) * 0.025;
    this.causticsB.alpha = 0.055 + Math.cos(time * 0.37) * 0.02;

    // The grid tracks the world exactly, so it doubles as a speed reference.
    const cell = 256 * camera.scale;
    this.grid.tileScale.set(camera.scale);
    this.grid.tilePosition.set(
      (-camera.x * camera.scale + this.width / 2) % cell,
      (-camera.y * camera.scale + this.height / 2) % cell,
    );
    this.grid.alpha = 0.35 * Math.min(1, camera.scale * 1.4);

    for (const bubble of this.bubbles) {
      bubble.y -= bubble.speed * dt;
      bubble.x += Math.sin(time * 0.9 + bubble.phase) * bubble.drift * dt;
      if (bubble.y < -60) {
        const sprite = bubble.sprite;
        Object.assign(bubble, this.makeBubble(sprite, false));
      }
      const px = bubble.x - camera.x * camera.scale * bubble.parallax * 0.12;
      const py = bubble.y - camera.y * camera.scale * bubble.parallax * 0.12;
      bubble.sprite.position.set(wrap(px, this.width), py);
      bubble.sprite.width = bubble.size;
      bubble.sprite.height = bubble.size;
      bubble.sprite.alpha = 0.1 + bubble.parallax * 0.2;
    }
  }

  /** Border glow drawn in world space by the renderer needs these bounds. */
  static worldBounds(): { x: number; y: number; w: number; h: number } {
    return { x: 0, y: 0, w: WORLD.width, h: WORLD.height };
  }
}

function wrap(value: number, span: number): number {
  const margin = 80;
  const total = span + margin * 2;
  let v = (value + margin) % total;
  if (v < 0) v += total;
  return v - margin;
}

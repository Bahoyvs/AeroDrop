import { Graphics, Texture, type Renderer } from 'pixi.js';
import { TAU } from '../core/math';
import type { InnerItemId } from '../game/cosmetics';

/**
 * The core items floating inside each drop. They're drawn as vectors and baked
 * to textures once, so a drop only ever costs one extra sprite.
 *
 * Everything is authored inside a 128x128 box centred on (0,0).
 */
const R = 52;

function star(g: Graphics): void {
  const pts: number[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * TAU) / 10;
    const rad = i % 2 === 0 ? R : R * 0.44;
    pts.push(Math.cos(a) * rad, Math.sin(a) * rad);
  }
  g.poly(pts).fill({ color: 0xfff3a8 });
  g.poly(pts).stroke({ width: 6, color: 0xffb32e, alignment: 0.5 });
  // Little inner sheen so it reads as glossy plastic, not flat vector.
  g.ellipse(-R * 0.16, -R * 0.3, R * 0.24, R * 0.14).fill({ color: 0xffffff, alpha: 0.75 });
}

function bubble(g: Graphics): void {
  g.circle(0, 0, R * 0.9).fill({ color: 0xd8f8ff, alpha: 0.32 });
  g.circle(0, 0, R * 0.9).stroke({ width: 7, color: 0xffffff, alpha: 0.85 });
  g.ellipse(-R * 0.3, -R * 0.34, R * 0.22, R * 0.14).fill({ color: 0xffffff, alpha: 0.9 });
}

function smiley(g: Graphics): void {
  g.circle(0, 0, R * 0.92).fill({ color: 0xffe45c });
  g.circle(0, 0, R * 0.92).stroke({ width: 6, color: 0xd99b00 });
  g.ellipse(-R * 0.32, -R * 0.2, R * 0.11, R * 0.17).fill({ color: 0x3a2600 });
  g.ellipse(R * 0.32, -R * 0.2, R * 0.11, R * 0.17).fill({ color: 0x3a2600 });
  g.arc(0, R * 0.02, R * 0.52, 0.32 * Math.PI, 0.68 * Math.PI).stroke({
    width: 9,
    color: 0x3a2600,
    cap: 'round',
  });
}

function floppy(g: Graphics): void {
  g.roundRect(-R * 0.86, -R * 0.86, R * 1.72, R * 1.72, 7).fill({ color: 0x2b2f3a });
  g.roundRect(-R * 0.86, -R * 0.86, R * 1.72, R * 1.72, 7).stroke({ width: 5, color: 0x11141c });
  // Metal shutter.
  g.rect(-R * 0.34, -R * 0.86, R * 0.68, R * 0.62).fill({ color: 0xc9d2dd });
  g.rect(-R * 0.1, -R * 0.82, R * 0.2, R * 0.5).fill({ color: 0x7e8895 });
  // Paper label.
  g.rect(-R * 0.62, R * 0.06, R * 1.24, R * 0.72).fill({ color: 0xf2f2e8 });
  g.rect(-R * 0.5, R * 0.2, R * 1.0, R * 0.1).fill({ color: 0xa8b0bb });
  g.rect(-R * 0.5, R * 0.4, R * 0.7, R * 0.1).fill({ color: 0xa8b0bb });
}

function radioactive(g: Graphics): void {
  g.circle(0, 0, R * 0.95).fill({ color: 0xffe95c });
  g.circle(0, 0, R * 0.95).stroke({ width: 6, color: 0xb99400 });
  for (let i = 0; i < 3; i++) {
    const base = -Math.PI / 2 + (i * TAU) / 3;
    const half = 0.28;
    const inner = R * 0.26;
    const outer = R * 0.86;
    const pts: number[] = [];
    pts.push(Math.cos(base - half) * inner, Math.sin(base - half) * inner);
    for (let t = -half; t <= half; t += 0.08) {
      pts.push(Math.cos(base + t) * outer, Math.sin(base + t) * outer);
    }
    pts.push(Math.cos(base + half) * inner, Math.sin(base + half) * inner);
    g.poly(pts).fill({ color: 0x1a1a1a });
  }
  g.circle(0, 0, R * 0.17).fill({ color: 0x1a1a1a });
}

function yinyang(g: Graphics): void {
  g.circle(0, 0, R * 0.94).fill({ color: 0xffffff });
  // Dark half.
  g.arc(0, 0, R * 0.94, -Math.PI / 2, Math.PI / 2).fill({ color: 0x14181f });
  g.circle(0, -R * 0.47, R * 0.47).fill({ color: 0xffffff });
  g.circle(0, R * 0.47, R * 0.47).fill({ color: 0x14181f });
  g.circle(0, -R * 0.47, R * 0.16).fill({ color: 0x14181f });
  g.circle(0, R * 0.47, R * 0.16).fill({ color: 0xffffff });
  g.circle(0, 0, R * 0.94).stroke({ width: 5, color: 0x0a0d12, alpha: 0.6 });
}

function disc(g: Graphics): void {
  g.circle(0, 0, R * 0.95).fill({ color: 0xdfe9f2 });
  for (let i = 0; i < 5; i++) {
    const colors = [0xff9ad0, 0xa8e6ff, 0xc7ffd6, 0xffe9a8, 0xd3b8ff];
    g.circle(0, 0, R * (0.9 - i * 0.14)).stroke({
      width: R * 0.13,
      color: colors[i]!,
      alpha: 0.75,
    });
  }
  g.circle(0, 0, R * 0.3).fill({ color: 0xf4fbff });
  g.circle(0, 0, R * 0.14).fill({ color: 0x0d2a3d, alpha: 0.35 });
  g.circle(0, 0, R * 0.95).stroke({ width: 4, color: 0x8fa8bb });
}

function bolt(g: Graphics): void {
  const pts = [0.16, -0.95, -0.52, 0.1, -0.1, 0.1, -0.3, 0.95, 0.55, -0.18, 0.1, -0.18].map(
    (v) => v * R,
  );
  g.poly(pts).fill({ color: 0xfff05c });
  g.poly(pts).stroke({ width: 6, color: 0xff9d00, join: 'round' });
}

function heart(g: Graphics): void {
  // Chunky pixel heart, 2000s forum-avatar style.
  const px = R * 0.24;
  const rows = [
    '01100110',
    '11111111',
    '11111111',
    '11111111',
    '01111110',
    '00111100',
    '00011000',
  ];
  const w = 8;
  const h = rows.length;
  for (let y = 0; y < h; y++) {
    const row = rows[y]!;
    for (let x = 0; x < w; x++) {
      if (row[x] !== '1') continue;
      const cx = (x - w / 2) * px;
      const cy = (y - h / 2) * px;
      const tone = y < 2 ? 0xff8fb4 : y < 5 ? 0xff4d80 : 0xd82f5e;
      g.rect(cx, cy, px + 0.5, px + 0.5).fill({ color: tone });
    }
  }
}

const DRAWERS: Record<Exclude<InnerItemId, 'none'>, (g: Graphics) => void> = {
  star,
  bubble,
  smiley,
  floppy,
  radioactive,
  yinyang,
  disc,
  bolt,
  heart,
};

/**
 * Bakes every core item to a texture. Called once at boot; the renderer needs
 * to exist first because we render vectors into textures with the GPU.
 */
export function buildInnerItemTextures(renderer: Renderer): Map<InnerItemId, Texture> {
  const out = new Map<InnerItemId, Texture>();
  for (const [id, draw] of Object.entries(DRAWERS)) {
    const g = new Graphics();
    draw(g);
    const texture = renderer.generateTexture({
      target: g,
      resolution: 2,
      antialias: true,
    });
    out.set(id as InnerItemId, texture);
    g.destroy();
  }
  return out;
}

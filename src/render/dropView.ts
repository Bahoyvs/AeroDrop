import { Container, Sprite, Texture } from 'pixi.js';
import { RENDER } from '../core/config';
import { clamp, damp } from '../core/math';
import { findColor, type InnerItemId } from '../game/cosmetics';
import type { Drop } from '../game/entities';
import { labelTexture } from './labels';
import type { TextureSet } from './textures';

/**
 * The three-layer drop from the design doc, split across two render layers:
 *
 *  - `blob` lives in the metaball container (blur + alpha threshold + jelly
 *    displacement), so silhouettes fuse into liquid bridges when drops touch;
 *  - everything else lives in the crisp overlay above it, where the baked
 *    specular/inner-shadow sprites, the core item and the name tag stay sharp.
 */
export class DropView {
  readonly blob: Sprite;
  readonly overlay: Container;

  private shade: Sprite;
  private gloss: Sprite;
  private flash: Sprite;
  private shield: Sprite;
  private itemPivot: Container;
  private itemSprite: Sprite;
  private label: Sprite;

  private itemX = 0;
  private itemY = 0;
  private stretch = 0;
  private itemId: InnerItemId = 'none';
  private labelName = '';

  constructor(
    textures: TextureSet,
    private itemTextures: Map<InnerItemId, Texture>,
  ) {
    this.blob = new Sprite(textures.blob);
    this.blob.anchor.set(0.5);

    this.overlay = new Container();

    this.shade = new Sprite(textures.shade);
    this.shade.anchor.set(0.5);

    this.gloss = new Sprite(textures.gloss);
    this.gloss.anchor.set(0.5);
    this.gloss.blendMode = 'add';

    this.flash = new Sprite(textures.glow);
    this.flash.anchor.set(0.5);
    this.flash.blendMode = 'add';
    this.flash.alpha = 0;

    this.shield = new Sprite(textures.bubble);
    this.shield.anchor.set(0.5);
    this.shield.blendMode = 'add';
    this.shield.alpha = 0;

    this.itemPivot = new Container();
    this.itemSprite = new Sprite(Texture.EMPTY);
    this.itemSprite.anchor.set(0.5);
    this.itemPivot.addChild(this.itemSprite);

    this.label = new Sprite(Texture.EMPTY);
    this.label.anchor.set(0.5);

    this.overlay.addChild(this.shield, this.itemPivot, this.shade, this.gloss, this.flash, this.label);
  }

  setVisible(visible: boolean): void {
    this.blob.visible = visible;
    this.overlay.visible = visible;
  }

  update(drop: Drop, dt: number, time: number, cameraScale: number): void {
    const color = findColor(drop.colorId);
    const r = drop.radius;

    // --- Silhouette. Drawn slightly fat so blur + threshold lands on the
    // true gameplay radius, and stretched along the direction of travel.
    const vx = drop.vx + drop.bvx;
    const vy = drop.vy + drop.bvy;
    const speed = Math.hypot(vx, vy);
    const targetStretch = clamp(speed / 1400, 0, 0.22) + drop.boostFlash * 0.1;
    this.stretch = damp(this.stretch, targetStretch, 9, dt);

    const wobble = Math.sin(time * 2.1 + drop.wobblePhase) * 0.012;
    const blobR = r * RENDER.blobOversize;
    this.blob.position.set(drop.x, drop.y);
    this.blob.rotation = speed > 6 ? Math.atan2(vy, vx) : this.blob.rotation;
    this.blob.width = blobR * 2 * (1 + this.stretch + wobble);
    this.blob.height = blobR * 2 * (1 - this.stretch * 0.62 - wobble);
    this.blob.tint = color.tint;
    this.blob.alpha = drop.isPlayer ? 1 : 0.97;

    // --- Crisp pass. Highlights never rotate: the key light is fixed, which
    // is what keeps a stretched drop reading as glass rather than a decal.
    this.overlay.position.set(drop.x, drop.y);

    const size = r * 2;
    this.shade.width = size;
    this.shade.height = size;
    this.shade.tint = color.tint;

    this.gloss.width = size;
    this.gloss.height = size;
    this.gloss.tint = color.accent;
    this.gloss.alpha = 0.85;

    this.flash.width = size * 2.6;
    this.flash.height = size * 2.6;
    this.flash.tint = color.accent;
    this.flash.alpha = drop.boostFlash * 0.5;

    if (drop.protection > 0) {
      const pulse = 0.45 + Math.sin(time * 9) * 0.18;
      this.shield.alpha = clamp(drop.protection, 0, 1) * pulse;
      this.shield.width = size * 1.28;
      this.shield.height = size * 1.28;
      this.shield.tint = 0xd8fbff;
    } else {
      this.shield.alpha = 0;
    }

    // --- Core item: trails behind the drop's motion and squashes along it,
    // like something suspended in liquid rather than glued to the sprite.
    if (drop.itemId !== this.itemId) {
      this.itemId = drop.itemId;
      const texture = this.itemTextures.get(drop.itemId);
      this.itemSprite.texture = texture ?? Texture.EMPTY;
      this.itemPivot.visible = !!texture;
    }
    if (this.itemPivot.visible) {
      const lagX = -clamp(vx / 900, -0.3, 0.3) * r * 0.5;
      const lagY = -clamp(vy / 900, -0.3, 0.3) * r * 0.5;
      this.itemX = damp(this.itemX, lagX, 6, dt);
      this.itemY = damp(this.itemY, lagY, 6, dt);
      const bob = Math.sin(time * 1.7 + drop.wobblePhase) * r * 0.03;

      const itemSize = r * 0.92;
      this.itemPivot.position.set(this.itemX, this.itemY + bob);
      this.itemPivot.rotation = speed > 6 ? Math.atan2(vy, vx) : this.itemPivot.rotation;
      this.itemPivot.scale.set(1 + this.stretch * 1.1, 1 - this.stretch * 0.7);
      this.itemSprite.rotation = -this.itemPivot.rotation;
      this.itemSprite.width = itemSize;
      this.itemSprite.height = itemSize;
      this.itemSprite.alpha = 0.95;
    }

    // --- Name tag. Hidden once the drop is too small on screen to read.
    const screenR = r * cameraScale;
    if (screenR < 13) {
      this.label.visible = false;
    } else {
      this.label.visible = true;
      if (this.labelName !== drop.name) {
        this.labelName = drop.name;
        this.label.texture = labelTexture(drop.name);
      }
      // Pick the on-screen size first, snap it to a half-pixel step, then
      // convert back to world units - that keeps the nearest-neighbour
      // upscale from shimmering as the camera zooms.
      const screenScale = clamp(screenR / 46, 0.8, RENDER.maxLabelScale * 2.6);
      const snapped = Math.max(0.75, Math.round(screenScale * 2) / 2);
      const worldScale = snapped / cameraScale;
      this.label.scale.set(worldScale);
      this.label.position.set(0, -r - this.label.texture.height * worldScale * 0.6 - 4);
      this.label.alpha = 0.95;
    }
  }

  reset(name: string): void {
    this.labelName = name;
    this.label.texture = labelTexture(name);
    this.itemX = 0;
    this.itemY = 0;
    this.stretch = 0;
  }

  destroy(): void {
    this.blob.destroy();
    this.overlay.destroy({ children: true });
  }
}

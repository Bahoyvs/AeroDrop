import { Container, Sprite, Texture, type Mesh } from 'pixi.js';
import { RENDER, SOFTBODY } from '../core/config';
import { clamp, damp } from '../core/math';
import { findColor, type InnerItemId } from '../game/cosmetics';
import type { Drop } from '../game/entities';
import { labelTexture } from './labels';
import { SoftBody } from './softBody';
import type { TextureSet } from './textures';

/**
 * One drop, split across four render layers:
 *
 *  - `lens` feeds the refraction pass below everything, bending the water and
 *    caustics behind the drop like a magnifier;
 *  - `shadow` sits under the liquid pass, a soft blue pool offset down-right
 *    from the fixed key light. It is what plants the drop *in* the water
 *    instead of leaving it floating as a decal over it, and it is most of what
 *    keeps a pale drop legible against pale water;
 *  - `body` is a spring-driven soft-body mesh living in the metaball container
 *    (displacement -> blur -> glass threshold), so silhouettes wobble like a
 *    water balloon and fuse into liquid bridges when drops touch;
 *  - `overlay` holds everything that must stay crisp and, crucially, *still*:
 *    the specular highlight never rotates with the body, because a highlight
 *    that slides around the surface stops reading as a fixed light source.
 */
export class DropView {
  readonly body: Mesh;
  readonly overlay: Container;
  readonly lens: Sprite;
  readonly shadow: Sprite;

  private soft: SoftBody;
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
  private lastBoostFlash = 0;

  constructor(
    textures: TextureSet,
    private itemTextures: Map<InnerItemId, Texture>,
  ) {
    this.soft = new SoftBody(textures.blob);
    this.body = this.soft.mesh;

    this.lens = new Sprite(textures.lens);
    this.lens.anchor.set(0.5);

    this.shadow = new Sprite(textures.glow);
    this.shadow.anchor.set(0.5);
    this.shadow.tint = 0x020d18;
    this.shadow.alpha = RENDER.shadowAlpha * 1.4;

    this.overlay = new Container();

    this.shade = new Sprite(textures.shade);
    this.shade.anchor.set(0.5);
    this.shade.alpha = 0.42;

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

    this.overlay.addChild(
      this.shield,
      this.itemPivot,
      this.shade,
      this.gloss,
      this.flash,
      this.label,
    );
  }

  setVisible(visible: boolean): void {
    this.body.visible = visible;
    this.overlay.visible = visible;
    this.lens.visible = visible;
    this.shadow.visible = visible;
  }

  update(drop: Drop, dt: number, time: number, cameraScale: number): void {
    const color = findColor(drop.colorId);
    const r = drop.radius;
    const vx = drop.vx + drop.bvx;
    const vy = drop.vy + drop.bvy;
    const speed = Math.hypot(vx, vy);

    // A Jet Boost punches the surface outward; the spring ring turns that into
    // a shockwave that runs around the drop and settles.
    if (drop.boostFlash > this.lastBoostFlash) this.soft.kick(SOFTBODY.boostKick);
    this.lastBoostFlash = drop.boostFlash;

    // --- Soft-body silhouette. Drawn slightly fat so blur + threshold land on
    // the true gameplay radius.
    const bodyRadius = r * RENDER.blobOversize;
    const swell = this.soft.update(dt, bodyRadius, vx, vy, time, drop.wobblePhase);
    this.body.position.set(drop.x, drop.y);
    this.body.tint = color.tint;
    this.body.alpha = drop.isPlayer ? 1 : 0.97;

    // --- Refraction footprint, kept just inside the wobbling surface.
    this.lens.position.set(drop.x, drop.y);
    this.lens.width = r * 2 * swell;
    this.lens.height = r * 2 * swell;

    // --- Contact shadow. Offset down-right to match the fixed top-left key,
    // and drawn generously wide because the falloff texture is mostly feather.
    const shadowSize = r * 2 * swell * RENDER.shadowScale * 1.9;
    this.shadow.position.set(
      drop.x + r * RENDER.shadowOffset,
      drop.y + r * RENDER.shadowOffset,
    );
    this.shadow.width = shadowSize;
    this.shadow.height = shadowSize;

    // --- Crisp pass. Highlights track the body's size but never its rotation:
    // the key light is fixed, which is what keeps a stretched, wobbling drop
    // reading as glass rather than a decal.
    this.overlay.position.set(drop.x, drop.y);
    const size = r * 2 * swell;

    this.shade.width = size;
    this.shade.height = size;
    this.shade.tint = color.tint;

    this.gloss.width = size;
    this.gloss.height = size;
    this.gloss.tint = color.accent;
    // Short of full strength: the highlight should sit on the body colour, not
    // bleach it. Small drops are almost entirely highlight otherwise.
    this.gloss.alpha = 0.78;

    this.flash.width = size * 2.6;
    this.flash.height = size * 2.6;
    this.flash.tint = color.accent;
    this.flash.alpha = drop.boostFlash * 0.5;

    if (drop.protection > 0) {
      const pulse = 0.45 + Math.sin(time * 9) * 0.18;
      this.shield.alpha = clamp(drop.protection, 0, 1) * pulse;
      this.shield.width = size * 1.3;
      this.shield.height = size * 1.3;
      this.shield.tint = 0xd8fbff;
    } else {
      this.shield.alpha = 0;
    }

    // --- Core item: trails behind the drop's motion and squashes along it,
    // like something suspended in liquid rather than glued to the sprite.
    const targetStretch = clamp(speed / 1400, 0, 0.22) + drop.boostFlash * 0.1;
    this.stretch = damp(this.stretch, targetStretch, 9, dt);

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
      const labelText = drop.brain ? `${drop.brain.badge} ${drop.name}` : drop.name;
      if (this.labelName !== labelText) {
        this.labelName = labelText;
        this.label.texture = labelTexture(labelText);
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
    this.lastBoostFlash = 0;
    this.soft.reset();
  }

  destroy(): void {
    this.soft.destroy();
    this.lens.destroy();
    this.shadow.destroy();
    this.overlay.destroy({ children: true });
  }
}

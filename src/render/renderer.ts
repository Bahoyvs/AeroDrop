import {
  Application,
  BlurFilter,
  Container,
  DisplacementFilter,
  Graphics,
  RenderTexture,
  Sprite,
  Texture,
} from 'pixi.js';
import { RENDER, WORLD } from '../core/config';
import { clamp } from '../core/math';
import type { InnerItemId } from '../game/cosmetics';
import type { Drop } from '../game/entities';
import type { World } from '../game/world';
import { Background } from './background';
import { Camera } from './camera';
import { DropView } from './dropView';
import { Fx } from './fx';
import { buildInnerItemTextures } from './innerItems';
import { MetaballFilter } from './metaballFilter';
import { buildTextures, type TextureSet } from './textures';

/**
 * Owns the PixiJS application and the hybrid liquid pipeline:
 *
 *   world layer
 *     ├── border + food        (crisp, cheap)
 *     ├── metaball layer       (displacement -> blur -> alpha threshold)
 *     ├── overlay layer        (baked specular / shade / core item / name)
 *     └── fx layer             (additive particles)
 *
 * The metaball pass runs in screen space, so its blur and displacement are
 * rescaled by the camera zoom every frame to keep a constant look in world
 * units.
 */
export class GameRenderer {
  readonly app = new Application();
  readonly camera = new Camera();

  private textures!: TextureSet;
  private itemTextures!: Map<InnerItemId, Texture>;

  private background!: Background;
  private fx!: Fx;

  private worldLayer = new Container();
  private borderGfx = new Graphics();
  private pelletLayer = new Container();
  private shadowLayer = new Container();
  private metaLayer = new Container();
  private overlayLayer = new Container();

  private blurFilter!: BlurFilter;
  private metaFilter!: MetaballFilter;
  private displacementFilter!: DisplacementFilter;
  private displacementSprite!: Sprite;

  /** Refraction: drop lenses are drawn to an offscreen map that warps the water. */
  private lensLayer = new Container();
  private lensTexture!: RenderTexture;
  private lensSprite!: Sprite;
  private refractionFilter!: DisplacementFilter;

  private pelletSprites: Sprite[] = [];
  private views = new Map<number, DropView>();
  private world: World | null = null;
  private time = 0;

  async init(host: HTMLElement): Promise<void> {
    await this.app.init({
      resizeTo: host,
      antialias: true,
      background: 0x5cd6fb,
      // The metaball threshold is a hand-written GLSL filter, and the brief
      // targets WebGL, so pin the backend instead of letting WebGPU win.
      preference: 'webgl',
      powerPreference: 'high-performance',
      // Capped below full retina density: the metaball pass is fill-rate bound
      // and 2x costs four times the pixels for a barely visible gain.
      resolution: Math.min(window.devicePixelRatio || 1, 1.5),
      autoDensity: true,
    });
    host.appendChild(this.app.canvas);
    this.app.canvas.classList.add('game-canvas');

    this.textures = buildTextures();
    this.itemTextures = buildInnerItemTextures(this.app.renderer);

    this.background = new Background(this.textures);
    this.fx = new Fx(this.textures);

    this.displacementSprite = new Sprite(this.textures.noise);
    this.displacementSprite.anchor.set(0.5);
    this.displacementSprite.width = 460;
    this.displacementSprite.height = 460;

    this.displacementFilter = new DisplacementFilter({
      sprite: this.displacementSprite,
      scale: RENDER.displacementScale,
    });
    this.blurFilter = new BlurFilter({
      strength: RENDER.metaBlur,
      quality: RENDER.metaBlurQuality,
    });
    this.metaFilter = new MetaballFilter({
      cutoff: RENDER.metaThresholdCutoff,
      softness: 0.08,
      centerAlpha: RENDER.centerAlpha,
      edgeAlpha: RENDER.edgeAlpha,
      rimDepth: RENDER.rimDepth,
      edgeDarken: RENDER.edgeDarken,
      rimLight: RENDER.rimLight,
      bodyLift: RENDER.bodyLift,
    });
    this.metaLayer.filters = [this.displacementFilter, this.blurFilter, this.metaFilter];

    // Refraction. Every drop stamps a lens into an offscreen map, and the
    // background is displaced by it - so the water, caustics and bubbles
    // behind a drop bend the way they would through real glass.
    this.lensTexture = RenderTexture.create({
      width: Math.max(1, this.app.screen.width),
      height: Math.max(1, this.app.screen.height),
      // The map is low frequency; half resolution is free quality.
      resolution: 0.5,
    });
    this.lensSprite = new Sprite(this.lensTexture);
    this.refractionFilter = new DisplacementFilter({
      sprite: this.lensSprite,
      scale: RENDER.refractionScale,
    });
    this.background.container.filters = [this.refractionFilter];

    // Shadows go in their own layer under the liquid: anything added to the
    // metaball container instead would get blurred and thresholded into the
    // surface itself and come out as part of the drop.
    this.worldLayer.addChild(
      this.borderGfx,
      this.pelletLayer,
      this.shadowLayer,
      this.metaLayer,
      this.overlayLayer,
      this.fx.container,
    );
    // The displacement sprites are never drawn; they only need live transforms.
    this.app.stage.addChild(
      this.background.container,
      this.worldLayer,
      this.displacementSprite,
      this.lensSprite,
    );

    this.drawBorder();
    this.handleResize();
    this.app.renderer.on('resize', () => this.handleResize());
  }

  private handleResize(): void {
    const { width, height } = this.app.screen;
    this.camera.resize(width, height);
    this.background.resize(width, height);
    // The lens map is screen aligned, so it has to track the viewport exactly.
    this.lensTexture.resize(Math.max(1, width), Math.max(1, height));
    this.lensSprite.width = width;
    this.lensSprite.height = height;
  }

  private drawBorder(): void {
    const g = this.borderGfx;
    g.clear();

    // Everything outside the arena washes out into bright haze. The background
    // is drawn in screen space, so without this the water past the wall looks
    // identical to the playfield and the boundary reads as a stray line.
    // Fogging out rather than darkening keeps the scene high-key throughout.
    const pad = 6000;
    const outside = 0xf2ffff;
    const alpha = 0.62;
    g.rect(-pad, -pad, WORLD.width + pad * 2, pad).fill({ color: outside, alpha });
    g.rect(-pad, WORLD.height, WORLD.width + pad * 2, pad).fill({ color: outside, alpha });
    g.rect(-pad, 0, pad, WORLD.height).fill({ color: outside, alpha });
    g.rect(WORLD.width, 0, pad, WORLD.height).fill({ color: outside, alpha });

    // Three concentric strokes make a glassy Aero bezel: a saturated core
    // between a white outer highlight and a white inner one.
    const inset = 6;
    g.roundRect(0, 0, WORLD.width, WORLD.height, 54);
    g.stroke({ width: 26, color: 0xffffff, alpha: 0.75 });
    g.roundRect(inset, inset, WORLD.width - inset * 2, WORLD.height - inset * 2, 48);
    g.stroke({ width: 10, color: 0x21a9e8, alpha: 0.55 });
    g.roundRect(inset * 3, inset * 3, WORLD.width - inset * 6, WORLD.height - inset * 6, 40);
    g.stroke({ width: 3, color: 0xffffff, alpha: 0.85 });
  }

  // ------------------------------------------------------------------ world

  attachWorld(world: World): void {
    this.detachWorld();
    this.world = world;
    for (const drop of world.drops) this.addView(drop);
    this.camera.snapTo(world.player.x, world.player.y, world.player.radius);
    this.syncPelletPool(world.pellets.length);
  }

  detachWorld(): void {
    for (const view of this.views.values()) view.destroy();
    this.views.clear();
    this.fx.clear();
    this.world = null;
  }

  private addView(drop: Drop): DropView {
    const view = new DropView(this.textures, this.itemTextures);
    view.reset(drop.name);
    this.shadowLayer.addChild(view.shadow);
    this.metaLayer.addChild(view.body);
    this.overlayLayer.addChild(view.overlay);
    this.lensLayer.addChild(view.lens);
    this.views.set(drop.id, view);
    return view;
  }

  private syncPelletPool(count: number): void {
    while (this.pelletSprites.length < count) {
      const sprite = new Sprite(this.textures.food);
      sprite.anchor.set(0.5);
      this.pelletLayer.addChild(sprite);
      this.pelletSprites.push(sprite);
    }
  }

  // ----------------------------------------------------------------- frame

  render(dt: number, followX: number, followY: number, followRadius: number): void {
    this.time += dt;
    this.camera.update(followX, followY, followRadius, dt);

    const scale = this.camera.scale;
    const { width, height } = this.app.screen;
    this.worldLayer.scale.set(scale);
    this.worldLayer.position.set(
      width / 2 - this.camera.x * scale,
      height / 2 - this.camera.y * scale,
    );

    // Keep blur/displacement constant in world units as the camera zooms.
    const blurPx = clamp(RENDER.metaBlur * scale, 2.5, RENDER.metaBlur * 1.4);
    this.blurFilter.strength = blurPx;
    this.metaFilter.setSoftnessForBlur(blurPx);
    this.displacementFilter.scale.x = RENDER.displacementScale * clamp(scale, 0.35, 1.2);
    this.displacementFilter.scale.y = this.displacementFilter.scale.x;
    // Scrolling the map is what turns a static warp into a jelly wobble.
    this.displacementSprite.position.set(
      width / 2 + Math.sin(this.time * 0.37) * RENDER.displacementDrift + this.time * 9,
      height / 2 + Math.cos(this.time * 0.29) * RENDER.displacementDrift - this.time * 6,
    );

    this.background.update(this.camera, dt, this.time);
    this.fx.update(dt);

    if (this.world) {
      this.renderPellets(this.world);
      this.renderDrops(this.world, dt, scale);
    }

    this.renderLensMap(scale);
  }

  /**
   * Stamps every visible drop's lens into the offscreen refraction map. It is
   * cleared to neutral grey (128,128) because that is DisplacementFilter's
   * "no shift" value - clearing to transparent black would drag the whole
   * background half a screen sideways.
   */
  private renderLensMap(scale: number): void {
    this.lensLayer.scale.set(this.worldLayer.scale.x);
    this.lensLayer.position.copyFrom(this.worldLayer.position);

    this.app.renderer.render({
      container: this.lensLayer,
      target: this.lensTexture,
      clear: true,
      clearColor: [0.5, 0.5, 0.5, 1],
    });

    // Keep the bend proportional to zoom, so a pulled-back camera doesn't
    // smear the whole seabed.
    this.refractionFilter.scale.x = RENDER.refractionScale * clamp(scale, 0.4, 1.2);
    this.refractionFilter.scale.y = this.refractionFilter.scale.x;
  }

  private renderPellets(world: World): void {
    this.syncPelletPool(world.pellets.length);
    const view = this.camera.viewHalf(60);
    const camX = this.camera.x;
    const camY = this.camera.y;

    for (let i = 0; i < this.pelletSprites.length; i++) {
      const sprite = this.pelletSprites[i]!;
      const pellet = world.pellets[i];
      if (!pellet) {
        sprite.visible = false;
        continue;
      }
      // Cheap AABB cull - most of the 850 pellets are off screen at any time.
      if (
        Math.abs(pellet.x - camX) > view.w ||
        Math.abs(pellet.y - camY) > view.h
      ) {
        sprite.visible = false;
        continue;
      }
      sprite.visible = true;
      const bob = pellet.ejecta ? 0 : Math.sin(pellet.phase * 1.6) * 0.12;
      // Drawn larger than the collision radius: a molecule the size of its
      // hitbox is a two-pixel speck once the camera pulls back at all.
      const size = pellet.radius * RENDER.foodDrawScale * (pellet.ejecta ? 1.1 : 1 + bob);
      sprite.position.set(pellet.x, pellet.y);
      sprite.width = size;
      sprite.height = size;
      sprite.tint = pellet.tint;
      sprite.alpha = pellet.ejecta ? 1 : 0.95;
    }
  }

  private renderDrops(world: World, dt: number, scale: number): void {
    const view = this.camera.viewHalf(260);
    for (const drop of world.drops) {
      let dropView = this.views.get(drop.id);
      if (!dropView) dropView = this.addView(drop);

      if (!drop.alive) {
        dropView.setVisible(false);
        continue;
      }
      if (
        Math.abs(drop.x - this.camera.x) > view.w + drop.radius ||
        Math.abs(drop.y - this.camera.y) > view.h + drop.radius
      ) {
        dropView.setVisible(false);
        continue;
      }
      dropView.setVisible(true);
      dropView.update(drop, dt, this.time, scale);
    }
  }

  // --------------------------------------------------------------- effects

  burst(x: number, y: number, tint: number, radius: number): void {
    this.fx.burst(x, y, tint, radius);
  }

  pop(x: number, y: number, tint: number, size: number): void {
    this.fx.pop(x, y, tint, size);
  }

  boostPuff(drop: Drop, tint: number): void {
    const len = Math.hypot(drop.aimX, drop.aimY) || 1;
    this.fx.boostPuff(drop.x, drop.y, drop.aimX / len, drop.aimY / len, tint, drop.radius);
  }

  /** Refreshes a view after a revive so the name tag and item re-seat. */
  resetView(drop: Drop): void {
    this.views.get(drop.id)?.reset(drop.name);
  }

  screenToWorld(x: number, y: number): { x: number; y: number } {
    return this.camera.screenToWorld(x, y);
  }

  /**
   * Rasterises each core item to a plain 2D canvas so the DOM shop and lobby
   * can show the exact art the game renders, without redrawing it by hand.
   */
  itemPreviewCanvases(): Map<InnerItemId, HTMLCanvasElement> {
    const out = new Map<InnerItemId, HTMLCanvasElement>();
    for (const [id, texture] of this.itemTextures) {
      const sprite = new Sprite(texture);
      sprite.width = 64;
      sprite.height = 64;
      try {
        const canvas = this.app.renderer.extract.canvas(sprite);
        if (canvas instanceof HTMLCanvasElement) out.set(id, canvas);
      } catch (error) {
        console.warn('[AeroDrop] could not extract item preview', id, error);
      }
      sprite.destroy();
    }
    return out;
  }

  get screen(): { width: number; height: number } {
    return { width: this.app.screen.width, height: this.app.screen.height };
  }
}

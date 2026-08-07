import {
  Application,
  BlurFilter,
  Container,
  DisplacementFilter,
  Graphics,
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
  private metaLayer = new Container();
  private overlayLayer = new Container();

  private blurFilter!: BlurFilter;
  private metaFilter!: MetaballFilter;
  private displacementFilter!: DisplacementFilter;
  private displacementSprite!: Sprite;

  private pelletSprites: Sprite[] = [];
  private views = new Map<number, DropView>();
  private world: World | null = null;
  private time = 0;

  async init(host: HTMLElement): Promise<void> {
    await this.app.init({
      resizeTo: host,
      antialias: true,
      background: 0x021a2e,
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
    });
    this.metaLayer.filters = [this.displacementFilter, this.blurFilter, this.metaFilter];

    this.worldLayer.addChild(
      this.borderGfx,
      this.pelletLayer,
      this.metaLayer,
      this.overlayLayer,
      this.fx.container,
    );
    // The displacement map is never drawn; it only needs a live transform.
    this.app.stage.addChild(this.background.container, this.worldLayer, this.displacementSprite);

    this.drawBorder();
    this.handleResize();
    this.app.renderer.on('resize', () => this.handleResize());
  }

  private handleResize(): void {
    const { width, height } = this.app.screen;
    this.camera.resize(width, height);
    this.background.resize(width, height);
  }

  private drawBorder(): void {
    const g = this.borderGfx;
    g.clear();

    // Darken everything outside the arena. The background is drawn in screen
    // space, so without this the water past the wall looks identical to the
    // playfield and the boundary reads as a stray line.
    const pad = 6000;
    const outside = 0x02101e;
    const alpha = 0.55;
    g.rect(-pad, -pad, WORLD.width + pad * 2, pad).fill({ color: outside, alpha });
    g.rect(-pad, WORLD.height, WORLD.width + pad * 2, pad).fill({ color: outside, alpha });
    g.rect(-pad, 0, pad, WORLD.height).fill({ color: outside, alpha });
    g.rect(WORLD.width, 0, pad, WORLD.height).fill({ color: outside, alpha });

    const inset = 6;
    g.roundRect(inset, inset, WORLD.width - inset * 2, WORLD.height - inset * 2, 48);
    g.stroke({ width: 10, color: 0x7fe9ff, alpha: 0.45 });
    g.roundRect(0, 0, WORLD.width, WORLD.height, 54);
    g.stroke({ width: 26, color: 0x0a3352, alpha: 0.55 });
    g.roundRect(inset * 3, inset * 3, WORLD.width - inset * 6, WORLD.height - inset * 6, 40);
    g.stroke({ width: 2, color: 0xd8fbff, alpha: 0.3 });
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
    this.metaLayer.addChild(view.blob);
    this.overlayLayer.addChild(view.overlay);
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
      sprite.alpha = pellet.ejecta ? 0.95 : 0.82;
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

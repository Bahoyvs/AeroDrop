import { sfx } from '../audio/sfx';
import { AD, BOOST, MASS, MATCH, MOVE, WORLD } from '../core/config';
import { clamp, formatMass } from '../core/math';
import { platform } from '../platform/crazygames';
import { profile } from '../save';
import type { GameRenderer } from '../render/renderer';
import { Minimap } from '../ui/minimap';
import type { Ui } from '../ui/ui';
import { findColor, type InnerItemId } from './cosmetics';
import type { Drop } from './entities';
import { Input } from './input';
import { sanitizeName } from './names';
import { World } from './world';

type Phase = 'lobby' | 'playing' | 'dead' | 'finished';

/**
 * Match flow and the glue between simulation, renderer, UI and ads.
 *
 * Rounds are five minutes. Dying opens the second-chance screen (one rewarded
 * revive per round); the timer running out ends the round properly and shows
 * final standings, with an interstitial on the way back to the lobby.
 */
export class Game {
  private world: World | null = null;
  private input = new Input();
  private minimap: Minimap;

  private phase: Phase = 'lobby';
  private timeLeft = MATCH.durationSec;
  private revivesLeft = AD.revivesPerMatch;
  private startBoostArmed = false;
  private foodStreak = 0;
  private streakTimer = 0;
  private lastCountdownSecond = -1;
  private massAtDeath = 0;
  private adBusy = false;
  /** Camera target while dead, so the view doesn't snap to the origin. */
  private ghostX = 0;
  private ghostY = 0;
  private ghostRadius = 40;

  constructor(
    private renderer: GameRenderer,
    private ui: Ui,
    minimapCanvas: HTMLCanvasElement,
  ) {
    this.minimap = new Minimap(minimapCanvas);
    this.input.attach(document.body);
  }

  // ------------------------------------------------------------- match flow

  startMatch(): void {
    sfx.unlock();
    const name = sanitizeName(this.ui.playerName);
    profile.patch({ name });
    this.ui.setPlayerName(name);

    const startMass = this.startBoostArmed ? MASS.start * AD.startBoostFactor : MASS.start;
    this.startBoostArmed = false;

    this.world = new World(
      name,
      profile.value.colorId,
      profile.value.itemId as InnerItemId,
      startMass,
      {
        onFood: (pellet, eater) => this.handleFood(pellet.x, pellet.y, pellet.tint, pellet.radius, eater),
        onEat: (event) => {
          this.renderer.burst(event.x, event.y, event.tint, event.radius);
          if (event.byPlayer) {
            sfx.eatDrop();
            platform.happytime();
          }
        },
        onKill: (event) => this.handleKill(event.victim, event.killer),
        onBoost: (drop) => this.handleBoost(drop),
      },
    );

    this.renderer.attachWorld(this.world);
    this.timeLeft = MATCH.durationSec;
    this.revivesLeft = AD.revivesPerMatch;
    this.foodStreak = 0;
    this.lastCountdownSecond = -1;
    this.phase = 'playing';

    this.input.clear();
    this.ui.clearKillfeed();
    this.ui.show('hud');
    sfx.spawn();
    sfx.startAmbient();
    platform.gameplayStart();
  }

  returnToLobby(): void {
    this.phase = 'lobby';
    sfx.stopAmbient();
    platform.gameplayStop();
    this.startAttract();
    this.ui.show('lobby');
  }

  /**
   * Attract mode: a live arena of bots swimming behind the menu. It is a real
   * World with the player's drop parked out of play, so the lobby shows the
   * same water, drops and collisions the match will.
   */
  startAttract(): void {
    this.phase = 'lobby';
    const world = new World('', profile.value.colorId, 'none', MASS.start, {
      onEat: (event) => this.renderer.burst(event.x, event.y, event.tint, event.radius),
      onBoost: (drop) => this.renderer.boostPuff(drop, findColor(drop.colorId).tint),
    });
    // Park the player: dead, and never scheduled to respawn.
    world.player.alive = false;
    world.player.respawnIn = Number.POSITIVE_INFINITY;
    this.world = world;
    this.renderer.attachWorld(world);
  }

  /** Round over by the clock: show standings, submit score, then interstitial. */
  private finishMatch(): void {
    if (!this.world || this.phase === 'finished') return;
    this.phase = 'finished';
    platform.gameplayStop();
    sfx.stopAmbient();

    const rank = this.world.playerRank();
    const mass = this.world.player.alive ? this.world.player.mass : this.massAtDeath;
    profile.recordRun(mass, rank);
    if (rank === 1) platform.happytime();

    this.ui.showResults(rank, this.world.leaderboard(8));
    this.ui.refreshStats();
    void this.submitLeaderboard(mass);
  }

  /** Called when the player leaves the results screen. */
  async leaveResults(next: 'lobby' | 'again'): Promise<void> {
    // The interstitial overlay covers the results screen while it runs, so
    // there's nothing to swap out first.
    await platform.showInterstitial();
    if (next === 'again') this.startMatch();
    else this.returnToLobby();
  }

  private async submitLeaderboard(mass: number): Promise<void> {
    const result = await platform.submitLeaderboardScore(mass);
    if (result.success) {
      this.ui.toast(`Leaderboard score submitted: ${result.score} pts!`);
    }
  }

  // ----------------------------------------------------------------- events

  private handleFood(x: number, y: number, tint: number, radius: number, eater: Drop): void {
    this.renderer.pop(x, y, tint, radius);
    if (!eater.isPlayer) return;
    this.foodStreak++;
    this.streakTimer = 1.4;
    sfx.eatFood(this.foodStreak);
  }

  private handleBoost(drop: Drop): void {
    this.renderer.boostPuff(drop, findColor(drop.colorId).tint);
    if (drop.isPlayer) sfx.boost();
  }

  private handleKill(victim: Drop, killer: Drop): void {
    // The killfeed belongs to the HUD; attract mode has no reader.
    if (this.phase !== 'playing' && this.phase !== 'dead') return;

    if (killer.isPlayer || victim.isPlayer) {
      this.ui.addKill(killer.name, victim.name, killer.isPlayer);
    } else if (victim.mass > 220) {
      // Only surface bot-on-bot kills when they're actually notable.
      this.ui.addKill(killer.name, victim.name, false);
    }

    if (!victim.isPlayer) return;

    this.massAtDeath = victim.mass;
    this.ghostX = victim.x;
    this.ghostY = victim.y;
    this.ghostRadius = victim.radius;
    this.phase = 'dead';
    sfx.death();
    platform.gameplayStop();
    this.ui.showDeath(killer.name, victim.mass, this.world?.playerRank() ?? 1, this.revivesLeft);
    void this.submitLeaderboard(victim.mass);
  }

  // -------------------------------------------------------------------- ads

  /** Rewarded: revive at half mass. Only granted when the ad truly completes. */
  async requestRevive(): Promise<void> {
    if (!this.world || this.phase !== 'dead' || this.revivesLeft <= 0 || this.adBusy) return;
    this.setAdBusy(true);
    const result = await platform.showRewarded('Second chance');
    this.setAdBusy(false);
    if (result !== 'reward') {
      this.ui.toast('Ad unavailable - try again in a moment');
      return;
    }

    this.revivesLeft--;
    this.world.revivePlayer(Math.max(MASS.start, this.massAtDeath * AD.reviveMassFactor));
    this.renderer.resetView(this.world.player);
    this.phase = 'playing';
    this.ui.show('hud');
    sfx.spawn();
    sfx.startAmbient();
    platform.gameplayStart();
    this.ui.toast(`Revived with ${formatMass(this.world.player.mass)} mass`);
  }

  /** Rewarded: arm the double-mass start for the next round. */
  async requestStartBoost(): Promise<void> {
    if (this.adBusy) return;
    this.setAdBusy(true);
    const result = await platform.showRewarded('Aero Drop Boost');
    this.setAdBusy(false);
    if (result !== 'reward') {
      this.ui.toast('Ad unavailable - try again in a moment');
      return;
    }
    this.startBoostArmed = true;
    sfx.reward();
    this.ui.toast('Aero Drop Boost armed - next round starts at double mass');
  }

  /** Rewarded: unlock a cosmetic permanently. */
  async requestUnlock(kind: 'color' | 'item', id: string): Promise<void> {
    if (this.adBusy) return;
    this.setAdBusy(true);
    const result = await platform.showRewarded('Unlock cosmetic');
    this.setAdBusy(false);
    if (result !== 'reward') {
      this.ui.toast('Ad unavailable - try again in a moment');
      return;
    }
    if (kind === 'color') {
      profile.unlockColor(id);
      profile.patch({ colorId: id });
    } else {
      profile.unlockItem(id);
      profile.patch({ itemId: id as InnerItemId });
    }
    sfx.reward();
    this.ui.show(this.ui.currentScreen === 'shop' ? 'shop' : 'lobby');
    this.ui.toast('Unlocked!');
  }

  private setAdBusy(busy: boolean): void {
    this.adBusy = busy;
    this.ui.setAdBusy(busy);
  }

  boostFromUi(): void {
    if (this.phase === 'playing') this.input.requestBoost();
  }

  // ------------------------------------------------------------------ frame

  update(dt: number): void {
    const world = this.world;

    if (world) {
      if (this.phase === 'playing') {
        this.applyInput(world);
        this.tickClock(dt);
      } else {
        // Bots keep swimming behind every menu - the lobby, the death screen
        // and the results - so the arena never freezes mid-frame.
        world.player.aimX = 0;
        world.player.aimY = 0;
      }
      world.update(dt);

      this.streakTimer -= dt;
      if (this.streakTimer <= 0) this.foodStreak = 0;
    }

    const follow = this.followTarget(world);
    this.renderer.render(dt, follow.x, follow.y, follow.radius);

    if (world && this.phase === 'playing') {
      this.updateHud(world);
      const view = this.renderer.camera.viewHalf(0);
      this.minimap.draw(world, view.w, view.h, this.renderer.camera.x, this.renderer.camera.y);
    }
  }

  private followTarget(world: World | null): { x: number; y: number; radius: number } {
    if (!world || this.phase === 'lobby') {
      // Slow drift across the arena while the menus are up.
      const t = performance.now() / 1000;
      return {
        x: WORLD.width / 2 + Math.cos(t * 0.06) * WORLD.width * 0.2,
        y: WORLD.height / 2 + Math.sin(t * 0.05) * WORLD.height * 0.2,
        radius: 150,
      };
    }
    const player = world.player;
    if (player.alive) return { x: player.x, y: player.y, radius: player.radius };
    return { x: this.ghostX, y: this.ghostY, radius: Math.max(60, this.ghostRadius) };
  }

  private applyInput(world: World): void {
    const player = world.player;
    if (!player.alive) return;

    const keyboard = this.input.keyboardAim();
    if (keyboard) {
      player.aimX = keyboard.x;
      player.aimY = keyboard.y;
    } else if (this.input.hasPointer) {
      const screen = this.renderer.screen;
      const dx = this.input.pointerX - screen.width / 2;
      const dy = this.input.pointerY - screen.height / 2;
      const len = Math.hypot(dx, dy);
      if (len < MOVE.cursorDeadzone) {
        // Cursor on top of the drop: coast instead of jittering.
        player.aimX = 0;
        player.aimY = 0;
      } else {
        // Throttle ramps up over the first ~180px so small cursor moves give
        // fine control and a flick across the screen gives full speed.
        const throttle = clamp((len - MOVE.cursorDeadzone) / 180, 0, 1);
        player.aimX = (dx / len) * throttle;
        player.aimY = (dy / len) * throttle;
      }
    }

    if (this.input.consumeBoost()) player.wantsBoost = true;
  }

  private tickClock(dt: number): void {
    this.timeLeft -= dt;
    const second = Math.ceil(this.timeLeft);
    if (second <= 5 && second !== this.lastCountdownSecond && second > 0) {
      this.lastCountdownSecond = second;
      sfx.countdown();
    }
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.finishMatch();
    }
  }

  private updateHud(world: World): void {
    const player = world.player;
    const charge = 1 - clamp(player.boostCooldown / BOOST.cooldown, 0, 1);
    this.ui.updateHud(player.mass, world.playerRank(), this.timeLeft, charge);
    this.ui.setLeaderboard(world.leaderboard(10));
  }

  get isPlaying(): boolean {
    return this.phase === 'playing';
  }

  get currentPhase(): Phase {
    return this.phase;
  }
}

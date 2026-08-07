import { BOOST, BOT, MASS, MATCH, MOVE, SPAWN, WORLD } from '../core/config';
import { clamp, damp, dist2 } from '../core/math';
import { rng } from '../core/rng';
import { updateBot, makeBrain } from './bot';
import { BOT_COLOR_IDS, findColor, type InnerItemId } from './cosmetics';
import { makeBotNames } from './names';
import { makeDrop, makePellet, radiusForMass, type Drop, type Pellet } from './entities';

export interface EatEvent {
  x: number;
  y: number;
  radius: number;
  tint: number;
  /** True when the local player was the one doing the eating. */
  byPlayer: boolean;
}

export interface KillEvent {
  victim: Drop;
  killer: Drop;
}

export interface WorldEvents {
  onFood?: (pellet: Pellet, eater: Drop) => void;
  onEat?: (event: EatEvent) => void;
  onKill?: (event: KillEvent) => void;
  onBoost?: (drop: Drop) => void;
}

export interface LeaderboardRow {
  name: string;
  mass: number;
  isPlayer: boolean;
  rank: number;
}

const GRID_CELL = 160;

/**
 * The whole simulation: drops, food, and the uniform grid that keeps food
 * lookups cheap. Rendering never mutates anything in here.
 */
export class World {
  readonly drops: Drop[] = [];
  readonly pellets: Pellet[] = [];
  player: Drop;

  private grid = new Map<number, Pellet[]>();
  private gridCols = Math.ceil(WORLD.width / GRID_CELL);
  private events: WorldEvents;
  private botNames: string[];
  private scratch: Pellet[] = [];

  constructor(
    playerName: string,
    playerColorId: string,
    playerItemId: InnerItemId,
    startMass: number,
    events: WorldEvents = {},
  ) {
    this.events = events;
    this.botNames = makeBotNames(MATCH.botCount);

    for (let i = 0; i < MATCH.foodCount; i++) this.spawnFood();

    this.player = makeDrop({
      name: playerName,
      x: WORLD.width / 2,
      y: WORLD.height / 2,
      mass: startMass,
      colorId: playerColorId,
      itemId: playerItemId,
      isPlayer: true,
      protection: SPAWN.protection,
    });
    this.drops.push(this.player);

    for (let i = 0; i < MATCH.botCount; i++) this.spawnBot(this.botNames[i]!);
    // Give bots a spread of starting sizes so there's always prey and predators.
    for (const bot of this.drops) {
      if (bot.isPlayer) continue;
      this.setMass(bot, MASS.start * rng.range(0.7, 2.5));
    }

    // Place the player last, once the bots exist and their sizes are settled -
    // otherwise a heavyweight can spawn straight on top of a fresh drop.
    const spot = this.findSafeSpot(this.player.radius);
    this.player.x = spot.x;
    this.player.y = spot.y;
  }

  // ---------------------------------------------------------------- spawning

  private spawnFood(x?: number, y?: number): void {
    const px = x ?? rng.range(24, WORLD.width - 24);
    const py = y ?? rng.range(24, WORLD.height - 24);
    const hue = rng.next();
    const tint =
      hue < 0.34 ? 0x8ef0ff : hue < 0.62 ? 0xa8ffd8 : hue < 0.85 ? 0xbfe4ff : 0xfff3b0;
    const pellet = makePellet({
      x: px,
      y: py,
      vx: 0,
      vy: 0,
      mass: MASS.food * rng.range(0.8, 1.25),
      tint,
      ejecta: false,
      ownerId: 0,
      arm: 0,
      life: Infinity,
    });
    this.pellets.push(pellet);
    this.addToGrid(pellet);
  }

  private spawnBot(name: string): Drop {
    const pos = this.findSafeSpot(radiusForMass(MASS.start));
    const bot = makeDrop({
      name,
      x: pos.x,
      y: pos.y,
      mass: MASS.start * rng.range(0.9, 1.6),
      colorId: rng.pick(BOT_COLOR_IDS),
      itemId: rng.chance(0.55) ? rng.pick(['star', 'bubble', 'smiley', 'disc'] as const) : 'none',
      protection: SPAWN.protection,
      brain: makeBrain(),
    });
    bot.radius = radiusForMass(bot.mass);
    this.drops.push(bot);
    return bot;
  }

  /** Finds a spot far enough from anything that could immediately eat us. */
  findSafeSpot(radius: number): { x: number; y: number } {
    let best = { x: WORLD.width / 2, y: WORLD.height / 2 };
    let bestScore = -Infinity;
    for (let i = 0; i < SPAWN.safeTries; i++) {
      const x = rng.range(180, WORLD.width - 180);
      const y = rng.range(180, WORLD.height - 180);
      let score = Infinity;
      for (const other of this.drops) {
        if (!other.alive) continue;
        if (other.radius < radius * MASS.eatRatio) continue;
        score = Math.min(score, Math.sqrt(dist2(x, y, other.x, other.y)));
      }
      if (score >= SPAWN.safeDistance) return { x, y };
      if (score > bestScore) {
        bestScore = score;
        best = { x, y };
      }
    }
    return best;
  }

  /** Puts the player back in play (used by the rewarded-ad revive). */
  revivePlayer(mass: number): void {
    const p = this.player;
    const spot = this.findSafeSpot(radiusForMass(mass));
    p.alive = true;
    p.x = spot.x;
    p.y = spot.y;
    p.vx = 0;
    p.vy = 0;
    p.bvx = 0;
    p.bvy = 0;
    p.protection = SPAWN.reviveProtection;
    p.boostCooldown = 0;
    this.setMass(p, Math.max(MASS.start, mass));
  }

  // ------------------------------------------------------------------- grid

  private cellKey(x: number, y: number): number {
    const cx = clamp(Math.floor(x / GRID_CELL), 0, this.gridCols - 1);
    const cy = clamp(Math.floor(y / GRID_CELL), 0, Math.ceil(WORLD.height / GRID_CELL) - 1);
    return cy * this.gridCols + cx;
  }

  private addToGrid(pellet: Pellet): void {
    const key = this.cellKey(pellet.x, pellet.y);
    const bucket = this.grid.get(key);
    if (bucket) bucket.push(pellet);
    else this.grid.set(key, [pellet]);
  }

  private rebuildGrid(): void {
    this.grid.clear();
    for (const pellet of this.pellets) this.addToGrid(pellet);
  }

  /** Collects pellets within `range` of a point into a reused scratch array. */
  private queryPellets(x: number, y: number, range: number): Pellet[] {
    const out = this.scratch;
    out.length = 0;
    const rows = Math.ceil(WORLD.height / GRID_CELL);
    const minX = clamp(Math.floor((x - range) / GRID_CELL), 0, this.gridCols - 1);
    const maxX = clamp(Math.floor((x + range) / GRID_CELL), 0, this.gridCols - 1);
    const minY = clamp(Math.floor((y - range) / GRID_CELL), 0, rows - 1);
    const maxY = clamp(Math.floor((y + range) / GRID_CELL), 0, rows - 1);
    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        const bucket = this.grid.get(cy * this.gridCols + cx);
        if (!bucket) continue;
        for (const pellet of bucket) out.push(pellet);
      }
    }
    return out;
  }

  // ------------------------------------------------------------------ update

  setMass(drop: Drop, mass: number): void {
    drop.mass = clamp(mass, MASS.min, MASS.max);
    drop.radius = radiusForMass(drop.mass);
  }

  update(dt: number): void {
    this.rebuildGrid();

    for (const drop of this.drops) {
      if (!drop.alive) {
        drop.respawnIn -= dt;
        if (!drop.isPlayer && drop.respawnIn <= 0) this.respawnBot(drop);
        continue;
      }

      if (drop.brain) {
        const vision = BOT.vision + drop.radius * BOT.visionPerRadius;
        const nearby = this.queryPellets(drop.x, drop.y, Math.min(vision, 620));
        updateBot(drop, dt, this.drops, nearby);
      }

      this.applyBoost(drop, dt);
      this.integrate(drop, dt);
      this.eatFood(drop);

      if (drop.mass > MASS.decayAbove) {
        this.setMass(drop, drop.mass * (1 - MASS.decayPerSec * dt));
      }
      drop.protection = Math.max(0, drop.protection - dt);
      drop.boostCooldown = Math.max(0, drop.boostCooldown - dt);
      drop.boostFlash = Math.max(0, drop.boostFlash - dt * 2.6);
      drop.wobblePhase += dt * (1.4 + Math.hypot(drop.vx, drop.vy) * 0.004);
    }

    this.updatePellets(dt);
    this.resolveDropCollisions();
    this.topUpFood(dt);
  }

  private applyBoost(drop: Drop, _dt: number): void {
    if (!drop.wantsBoost) return;
    drop.wantsBoost = false;
    if (drop.boostCooldown > 0) return;
    const cost = Math.max(BOOST.minCost, drop.mass * BOOST.massCost);
    if (drop.mass - cost < MASS.min) return;

    let ax = drop.aimX;
    let ay = drop.aimY;
    const len = Math.hypot(ax, ay);
    if (len < 0.001) {
      // No aim yet (e.g. keyboard-only boost before the mouse moved): reuse
      // the current heading so the dash still goes somewhere sensible.
      const speed = Math.hypot(drop.vx, drop.vy);
      if (speed < 1) return;
      ax = drop.vx / speed;
      ay = drop.vy / speed;
    } else {
      ax /= len;
      ay /= len;
    }

    this.setMass(drop, drop.mass - cost);
    drop.boostCooldown = BOOST.cooldown;
    drop.boostFlash = 1;
    // Boosting is a commitment: it drops spawn protection immediately.
    drop.protection = 0;

    const impulse = clamp(
      BOOST.impulse * (MOVE.referenceRadius / drop.radius) ** BOOST.impulseFalloff,
      BOOST.minImpulse,
      BOOST.impulse,
    );
    drop.bvx += ax * impulse;
    drop.bvy += ay * impulse;

    // The price of the dash is flung out behind you - the risk half of the
    // risk/reward loop, and free food for whoever is chasing.
    const spawnDist = drop.radius + radiusForMass(cost) + 4;
    const pellet = makePellet({
      x: drop.x - ax * spawnDist,
      y: drop.y - ay * spawnDist,
      vx: -ax * BOOST.ejectSpeed + drop.vx * 0.25,
      vy: -ay * BOOST.ejectSpeed + drop.vy * 0.25,
      mass: cost,
      tint: findColor(drop.colorId).tint,
      ejecta: true,
      ownerId: drop.id,
      arm: BOOST.ejectArmTime,
      life: BOOST.ejectLifetime,
    });
    this.pellets.push(pellet);
    this.addToGrid(pellet);
    this.events.onBoost?.(drop);
  }

  private integrate(drop: Drop, dt: number): void {
    const maxSpeed = clamp(
      MOVE.baseSpeed * (MOVE.referenceRadius / drop.radius) ** MOVE.speedFalloff,
      MOVE.minSpeed,
      MOVE.baseSpeed * 1.12,
    );
    const throttle = clamp(Math.hypot(drop.aimX, drop.aimY), 0, 1);
    const dirLen = throttle > 0.0001 ? throttle : 1;
    const targetVx = (drop.aimX / dirLen) * maxSpeed * throttle;
    const targetVy = (drop.aimY / dirLen) * maxSpeed * throttle;

    // Heavier drops accelerate more slowly: the "thick, full" feel.
    const response = clamp(
      MOVE.steerResponse * (MOVE.referenceRadius / drop.radius) ** MOVE.steerResponseFalloff,
      MOVE.minSteerResponse,
      MOVE.maxSteerResponse,
    );
    drop.vx = damp(drop.vx, targetVx, response, dt);
    drop.vy = damp(drop.vy, targetVy, response, dt);

    // Boost velocity is a separate, faster-decaying layer.
    const decay = Math.exp(-MOVE.drag * 2.6 * dt);
    drop.bvx *= decay;
    drop.bvy *= decay;

    drop.x += (drop.vx + drop.bvx) * dt;
    drop.y += (drop.vy + drop.bvy) * dt;

    // Soft walls: push back instead of hard-clamping, so hitting the edge
    // feels like drifting into a current rather than a brick wall.
    const r = drop.radius;
    if (drop.x < r) {
      drop.x = damp(drop.x, r, 12, dt);
      drop.vx += WORLD.wallPush * dt;
    } else if (drop.x > WORLD.width - r) {
      drop.x = damp(drop.x, WORLD.width - r, 12, dt);
      drop.vx -= WORLD.wallPush * dt;
    }
    if (drop.y < r) {
      drop.y = damp(drop.y, r, 12, dt);
      drop.vy += WORLD.wallPush * dt;
    } else if (drop.y > WORLD.height - r) {
      drop.y = damp(drop.y, WORLD.height - r, 12, dt);
      drop.vy -= WORLD.wallPush * dt;
    }
    drop.x = clamp(drop.x, 0, WORLD.width);
    drop.y = clamp(drop.y, 0, WORLD.height);
  }

  private eatFood(drop: Drop): void {
    const reach = drop.radius + 22;
    const nearby = this.queryPellets(drop.x, drop.y, reach);
    for (const pellet of nearby) {
      if (pellet.mass <= 0) continue;
      if (pellet.ejecta && pellet.ownerId === drop.id && pellet.arm > 0) continue;
      const limit = drop.radius - pellet.radius * 0.2;
      if (dist2(drop.x, drop.y, pellet.x, pellet.y) > limit * limit) continue;
      this.setMass(drop, drop.mass + pellet.mass);
      drop.score += pellet.mass;
      pellet.mass = -1; // tombstone; swept in updatePellets
      this.events.onFood?.(pellet, drop);
    }
  }

  private updatePellets(dt: number): void {
    let write = 0;
    let removedFood = 0;
    for (let i = 0; i < this.pellets.length; i++) {
      const pellet = this.pellets[i]!;
      if (pellet.mass < 0) {
        if (!pellet.ejecta) removedFood++;
        continue;
      }
      if (pellet.ejecta) {
        pellet.arm = Math.max(0, pellet.arm - dt);
        pellet.life -= dt;
        const decay = Math.exp(-BOOST.ejectDrag * dt);
        pellet.vx *= decay;
        pellet.vy *= decay;
        pellet.x = clamp(pellet.x + pellet.vx * dt, 4, WORLD.width - 4);
        pellet.y = clamp(pellet.y + pellet.vy * dt, 4, WORLD.height - 4);
        if (pellet.life <= 0) {
          // Stale ejecta settles into ordinary food rather than vanishing.
          pellet.ejecta = false;
          pellet.life = Infinity;
          pellet.vx = 0;
          pellet.vy = 0;
        }
      } else {
        pellet.phase += dt;
      }
      this.pellets[write++] = pellet;
    }
    this.pellets.length = write;
    for (let i = 0; i < removedFood; i++) this.spawnFood();
  }

  private topUpFood(dt: number): void {
    // Slow trickle keeps density stable even while ejecta is in flight.
    if (this.pellets.length < MATCH.foodCount && rng.chance(dt * 6)) this.spawnFood();
  }

  private resolveDropCollisions(): void {
    const drops = this.drops;
    for (let i = 0; i < drops.length; i++) {
      const a = drops[i]!;
      if (!a.alive) continue;
      for (let j = i + 1; j < drops.length; j++) {
        const b = drops[j]!;
        if (!b.alive || !a.alive) continue;

        const d2 = dist2(a.x, a.y, b.x, b.y);
        const maxR = Math.max(a.radius, b.radius);
        if (d2 > maxR * maxR) continue;

        let predator: Drop;
        let victim: Drop;
        if (a.radius >= b.radius * MASS.eatRatio) {
          predator = a;
          victim = b;
        } else if (b.radius >= a.radius * MASS.eatRatio) {
          predator = b;
          victim = a;
        } else {
          continue;
        }

        if (victim.protection > 0 || predator.protection > 0) continue;
        // The predator has to actually cover the victim, not just touch it.
        const limit = predator.radius - victim.radius * MASS.eatOverlap;
        if (d2 > limit * limit) continue;

        this.consume(predator, victim);
      }
    }
  }

  private consume(predator: Drop, victim: Drop): void {
    this.setMass(predator, predator.mass + victim.mass);
    predator.score += victim.mass;
    victim.alive = false;
    victim.respawnIn = MATCH.botRespawnDelay;
    this.events.onEat?.({
      x: victim.x,
      y: victim.y,
      radius: victim.radius,
      tint: findColor(victim.colorId).tint,
      byPlayer: predator.isPlayer,
    });
    this.events.onKill?.({ victim, killer: predator });
  }

  private respawnBot(bot: Drop): void {
    const spot = this.findSafeSpot(radiusForMass(MASS.start));
    bot.alive = true;
    bot.x = spot.x;
    bot.y = spot.y;
    bot.vx = 0;
    bot.vy = 0;
    bot.bvx = 0;
    bot.bvy = 0;
    bot.protection = SPAWN.protection;
    bot.score = 0;
    bot.colorId = rng.pick(BOT_COLOR_IDS);
    bot.brain = makeBrain();
    this.setMass(bot, MASS.start * rng.range(0.9, 1.8));
  }

  // -------------------------------------------------------------- reporting

  leaderboard(limit = 10): LeaderboardRow[] {
    const rows = this.drops
      .filter((d) => d.alive)
      .map((d) => ({ name: d.name, mass: d.mass, isPlayer: d.isPlayer, rank: 0 }))
      .sort((a, b) => b.mass - a.mass);
    rows.forEach((row, i) => (row.rank = i + 1));
    return rows.slice(0, limit);
  }

  playerRank(): number {
    if (!this.player.alive) return this.drops.filter((d) => d.alive).length + 1;
    let rank = 1;
    for (const drop of this.drops) {
      if (drop.alive && drop !== this.player && drop.mass > this.player.mass) rank++;
    }
    return rank;
  }

  aliveCount(): number {
    return this.drops.reduce((n, d) => n + (d.alive ? 1 : 0), 0);
  }
}

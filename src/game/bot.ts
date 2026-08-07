import { BOT, MASS, WORLD } from '../core/config';
import { dist2 } from '../core/math';
import { rng } from '../core/rng';
import type { BotBrain, Drop, Pellet } from './entities';

export function makeBrain(): BotBrain {
  return {
    wanderAngle: rng.range(0, Math.PI * 2),
    attackCooldown: rng.range(0, BOT.attackCooldown),
    aggression: rng.range(0.55, 1.35),
    caution: rng.range(0.7, 1.4),
    reaction: rng.range(0.08, 0.22),
    thinkTimer: rng.range(0, 0.2),
    targetX: 0,
    targetY: 0,
    boostIntent: false,
  };
}

/**
 * Steering AI, exactly the three-rule behaviour from the design doc:
 *   1. head for the nearest food,
 *   2. run from anything at least 10% bigger that enters the vision cone,
 *   3. boost-charge anything small enough to swallow.
 * Threat handling always wins over greed, and the edge of the map counts as a
 * mild threat so bots don't pin themselves against the wall.
 */
export function updateBot(
  bot: Drop,
  dt: number,
  drops: readonly Drop[],
  nearbyPellets: readonly Pellet[],
): void {
  const brain = bot.brain;
  if (!brain) return;

  brain.attackCooldown = Math.max(0, brain.attackCooldown - dt);
  brain.thinkTimer -= dt;
  brain.boostIntent = false;

  const vision = BOT.vision + bot.radius * BOT.visionPerRadius;

  // --- Threats: anything that could eat us, weighted by how close it is.
  let threatX = 0;
  let threatY = 0;
  let threatWeight = 0;
  let prey: Drop | null = null;
  let preyD2 = Infinity;

  for (const other of drops) {
    if (other === bot || !other.alive) continue;
    const d2 = dist2(bot.x, bot.y, other.x, other.y);
    if (d2 > vision * vision) continue;

    if (other.radius >= bot.radius * MASS.eatRatio) {
      const fleeRange = vision * BOT.fleeRange * brain.caution;
      if (d2 < fleeRange * fleeRange) {
        const d = Math.max(1, Math.sqrt(d2));
        // Closer threats pull much harder than distant ones.
        const w = (1 - d / fleeRange) ** 2 * (other.radius / bot.radius);
        threatX += ((bot.x - other.x) / d) * w;
        threatY += ((bot.y - other.y) / d) * w;
        threatWeight += w;
      }
    } else if (
      other.protection <= 0 &&
      bot.radius >= other.radius * BOT.preyRatio &&
      d2 < preyD2
    ) {
      prey = other;
      preyD2 = d2;
    }
  }

  // --- Walls behave like a threat so bots stay in play.
  const margin = BOT.edgeMargin;
  if (bot.x < margin) {
    const w = 1 - bot.x / margin;
    threatX += w * 1.4;
    threatWeight += w;
  } else if (bot.x > WORLD.width - margin) {
    const w = 1 - (WORLD.width - bot.x) / margin;
    threatX -= w * 1.4;
    threatWeight += w;
  }
  if (bot.y < margin) {
    const w = 1 - bot.y / margin;
    threatY += w * 1.4;
    threatWeight += w;
  } else if (bot.y > WORLD.height - margin) {
    const w = 1 - (WORLD.height - bot.y) / margin;
    threatY -= w * 1.4;
    threatWeight += w;
  }

  let dirX = 0;
  let dirY = 0;

  if (threatWeight > 0.02) {
    // Flee. Panic-boost when the pressure is high and we can afford it.
    dirX = threatX;
    dirY = threatY;
    const panic = threatWeight > 0.55 * brain.caution;
    if (panic && brain.attackCooldown <= 0 && bot.mass > MASS.min * 2.2) {
      brain.boostIntent = true;
      brain.attackCooldown = BOT.attackCooldown * 0.7;
    }
  } else if (prey) {
    const p: Drop = prey;
    const d = Math.max(1, Math.sqrt(preyD2));
    // Lead the target a little; bots that aim at the current position never hit.
    const lead = Math.min(0.55, d / 900);
    dirX = p.x + p.vx * lead - bot.x;
    dirY = p.y + p.vy * lead - bot.y;
    const attackRange = BOT.attackRange + bot.radius * 2.2;
    if (
      d < attackRange &&
      brain.attackCooldown <= 0 &&
      bot.mass > MASS.min * 2.6 &&
      rng.chance(0.55 * brain.aggression)
    ) {
      brain.boostIntent = true;
      brain.attackCooldown = BOT.attackCooldown / brain.aggression;
    }
  } else {
    // Graze. Score food by distance so bots prefer dense clusters nearby.
    let best: Pellet | null = null;
    let bestScore = Infinity;
    for (const pellet of nearbyPellets) {
      const d2 = dist2(bot.x, bot.y, pellet.x, pellet.y);
      const score = d2 / (pellet.mass + 0.4);
      if (score < bestScore) {
        bestScore = score;
        best = pellet;
      }
    }
    if (best) {
      dirX = best.x - bot.x;
      dirY = best.y - bot.y;
    } else {
      if (rng.chance(BOT.wanderRate * dt)) {
        brain.wanderAngle += rng.range(-1.2, 1.2);
      }
      dirX = Math.cos(brain.wanderAngle);
      dirY = Math.sin(brain.wanderAngle);
      // Drift back toward the middle when there's nothing to do out here.
      dirX += (WORLD.width / 2 - bot.x) * 0.0006;
      dirY += (WORLD.height / 2 - bot.y) * 0.0006;
    }
  }

  const len = Math.hypot(dirX, dirY);
  if (len > 0.0001) {
    bot.aimX = dirX / len;
    bot.aimY = dirY / len;
  }
  bot.wantsBoost = brain.boostIntent;
}

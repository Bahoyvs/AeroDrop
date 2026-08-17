import { BOT, MASS, WORLD } from '../core/config';
import { dist2 } from '../core/math';
import { rng } from '../core/rng';
import type { BotBrain, BotPersonality, Drop, Pellet } from './entities';

const PERSONALITY_TYPES: BotPersonality[] = ['aggressive', 'defensive', 'noob', 'tactical', 'sneaky', 'apex'];

export const PERSONALITY_CONFIG: Record<BotPersonality, { badge: string; tag: string }> = {
  aggressive: { badge: '⚔️', tag: 'AGG' },
  defensive: { badge: '🛡️', tag: 'DEF' },
  noob: { badge: '🐣', tag: 'NOOB' },
  tactical: { badge: '🧠', tag: 'TAC' },
  sneaky: { badge: '⚡', tag: 'SNK' },
  apex: { badge: '👑', tag: 'APEX' },
};

export function makeBrain(forcedType?: BotPersonality): BotBrain {
  const personality = forcedType ?? rng.pick(PERSONALITY_TYPES);
  const cfg = PERSONALITY_CONFIG[personality];

  let aggression = 1.0;
  let caution = 1.0;
  let reaction = 0.15;

  switch (personality) {
    case 'apex':
      aggression = rng.range(1.9, 2.5);
      caution = rng.range(0.8, 1.2);
      reaction = rng.range(0.02, 0.06);
      break;
    case 'aggressive':
      aggression = rng.range(1.4, 1.95);
      caution = rng.range(0.5, 0.8);
      reaction = rng.range(0.05, 0.12);
      break;
    case 'defensive':
      aggression = rng.range(0.3, 0.6);
      caution = rng.range(1.4, 2.1);
      reaction = rng.range(0.1, 0.2);
      break;
    case 'noob':
      aggression = rng.range(0.5, 1.0);
      caution = rng.range(0.6, 1.0);
      reaction = rng.range(0.25, 0.45);
      break;
    case 'tactical':
      aggression = rng.range(0.9, 1.3);
      caution = rng.range(1.0, 1.4);
      reaction = rng.range(0.08, 0.16);
      break;
    case 'sneaky':
      aggression = rng.range(1.2, 1.6);
      caution = rng.range(0.9, 1.3);
      reaction = rng.range(0.06, 0.14);
      break;
  }

  return {
    personality,
    badge: cfg.badge,
    tag: cfg.tag,
    isRival: personality === 'apex',
    wanderAngle: rng.range(0, Math.PI * 2),
    attackCooldown: rng.range(0, BOT.attackCooldown),
    aggression,
    caution,
    reaction,
    thinkTimer: rng.range(0, reaction),
    targetX: 0,
    targetY: 0,
    boostIntent: false,
    misfireTimer: personality === 'noob' ? rng.range(4, 10) : undefined,
  };
}

/**
 * Enhanced Steering AI with Archetype Personalities & Leader Bounty Hunting:
 *   - Apex (👑): Apex predator. Ultra-fast reaction, relentless pursuit of #1 leader, optimal boost timing.
 *   - Aggressive (⚔️): Relentless hunter, long-range lead targeting, frequent boost attacks.
 *   - Defensive (🛡️): Highly alert to big predators, early flee response, sticks to safe zones.
 *   - Noob (🐣): Erratic movement, delayed reactions, no lead targeting, occasional random boost misfires.
 *   - Tactical (🧠): Prioritizes dense clusters & ejected food, strikes only high-probability prey.
 *   - Sneaky (⚡): Approached quietly then fires surprise close-range boost dashes.
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

  // Personality vision modifier
  const visionMult =
    brain.personality === 'apex'
      ? 1.5
      : brain.personality === 'aggressive'
      ? 1.25
      : brain.personality === 'tactical'
      ? 1.15
      : brain.personality === 'noob'
      ? 0.85
      : 1.0;

  const vision = (BOT.vision + bot.radius * BOT.visionPerRadius) * visionMult;

  // --- Noob misfire check
  if (brain.personality === 'noob' && brain.misfireTimer !== undefined) {
    brain.misfireTimer -= dt;
    if (brain.misfireTimer <= 0) {
      brain.misfireTimer = rng.range(6, 14);
      if (bot.mass > MASS.min * 2.0 && brain.attackCooldown <= 0) {
        brain.boostIntent = true;
        brain.attackCooldown = BOT.attackCooldown;
      }
    }
  }

  // Find overall leader in drops
  let leader: Drop | null = null;
  let maxMass = 0;
  for (const d of drops) {
    if (d.alive && d.mass > maxMass) {
      maxMass = d.mass;
      leader = d;
    }
  }

  // --- Threats: anything larger that could swallow us
  let threatX = 0;
  let threatY = 0;
  let threatWeight = 0;
  let prey: Drop | null = null;
  let preyD2 = Infinity;

  const preyMinRatio =
    brain.personality === 'tactical'
      ? BOT.preyRatio * 1.08
      : brain.personality === 'aggressive' || brain.personality === 'apex'
      ? BOT.preyRatio * 0.94
      : BOT.preyRatio;

  // Leader Bounty Targeting logic
  let bountyTarget: Drop | null = null;
  if (
    leader &&
    leader !== bot &&
    leader.alive &&
    (brain.personality === 'apex' || brain.personality === 'aggressive' || brain.personality === 'tactical')
  ) {
    const d2ToLeader = dist2(bot.x, bot.y, leader.x, leader.y);
    // Apex and Aggressive bots sense the #1 leader from double distance!
    const huntDist = vision * (brain.personality === 'apex' ? 2.2 : 1.6);
    if (d2ToLeader < huntDist * huntDist) {
      if (bot.radius >= leader.radius * preyMinRatio) {
        bountyTarget = leader;
      }
    }
  }

  for (const other of drops) {
    if (other === bot || !other.alive) continue;
    const d2 = dist2(bot.x, bot.y, other.x, other.y);
    if (d2 > vision * vision) continue;

    if (other.radius >= bot.radius * MASS.eatRatio) {
      const fleeRange = vision * BOT.fleeRange * brain.caution;
      if (d2 < fleeRange * fleeRange) {
        const d = Math.max(1, Math.sqrt(d2));
        const w = (1 - d / fleeRange) ** 2 * (other.radius / bot.radius);
        threatX += ((bot.x - other.x) / d) * w;
        threatY += ((bot.y - other.y) / d) * w;
        threatWeight += w * brain.caution;
      }
    } else if (
      other.protection <= 0 &&
      bot.radius >= other.radius * preyMinRatio &&
      d2 < preyD2
    ) {
      prey = other;
      preyD2 = d2;
    }
  }

  // Override prey with bounty target if available and eligible
  if (bountyTarget) {
    prey = bountyTarget;
    preyD2 = dist2(bot.x, bot.y, bountyTarget.x, bountyTarget.y);
  }

  // --- Map edges behave as a threat to keep bots in play
  const margin = BOT.edgeMargin * (brain.personality === 'defensive' ? 1.3 : 1.0);
  if (bot.x < margin) {
    const w = 1 - bot.x / margin;
    threatX += w * 1.5;
    threatWeight += w;
  } else if (bot.x > WORLD.width - margin) {
    const w = 1 - (WORLD.width - bot.x) / margin;
    threatX -= w * 1.5;
    threatWeight += w;
  }
  if (bot.y < margin) {
    const w = 1 - bot.y / margin;
    threatY += w * 1.5;
    threatWeight += w;
  } else if (bot.y > WORLD.height - margin) {
    const w = 1 - (WORLD.height - bot.y) / margin;
    threatY -= w * 1.5;
    threatWeight += w;
  }

  let dirX = 0;
  let dirY = 0;

  if (threatWeight > 0.02) {
    // --- Flee state
    dirX = threatX;
    dirY = threatY;
    const panicLimit = brain.personality === 'defensive' ? 0.35 : 0.55 * brain.caution;
    if (threatWeight > panicLimit && brain.attackCooldown <= 0 && bot.mass > MASS.min * 2.2) {
      brain.boostIntent = true;
      brain.attackCooldown = BOT.attackCooldown * 0.6;
    }
  } else if (prey) {
    // --- Chase state
    const p: Drop = prey;
    const d = Math.max(1, Math.sqrt(preyD2));

    // Lead targeting: Apex leads target aggressively
    let leadFactor = 0.55;
    if (brain.personality === 'noob') leadFactor = 0;
    else if (brain.personality === 'apex') leadFactor = 0.88;
    else if (brain.personality === 'aggressive') leadFactor = 0.75;
    else if (brain.personality === 'tactical') leadFactor = 0.65;

    const lead = Math.min(leadFactor, d / 750);
    dirX = p.x + p.vx * lead - bot.x;
    dirY = p.y + p.vy * lead - bot.y;

    const attackRange =
      brain.personality === 'apex'
        ? BOT.attackRange + bot.radius * 3.0
        : brain.personality === 'sneaky'
        ? 240 + bot.radius * 1.8
        : BOT.attackRange + bot.radius * 2.2;

    const attackChance =
      brain.personality === 'apex'
        ? 0.95
        : brain.personality === 'aggressive'
        ? 0.85
        : brain.personality === 'sneaky'
        ? 0.9
        : 0.55 * brain.aggression;

    if (
      d < attackRange &&
      brain.attackCooldown <= 0 &&
      bot.mass > MASS.min * 2.2 &&
      rng.chance(attackChance)
    ) {
      brain.boostIntent = true;
      brain.attackCooldown = (BOT.attackCooldown * 0.7) / brain.aggression;
    }
  } else {
    // --- Graze state
    let best: Pellet | null = null;
    let bestScore = Infinity;

    for (const pellet of nearbyPellets) {
      const d2 = dist2(bot.x, bot.y, pellet.x, pellet.y);
      const ejectaBonus = (brain.personality === 'tactical' || brain.personality === 'apex') && pellet.ejecta ? 4.0 : 1.0;
      const score = d2 / (pellet.mass * ejectaBonus + 0.4);

      if (score < bestScore) {
        bestScore = score;
        best = pellet;
      }
    }

    if (best) {
      dirX = best.x - bot.x;
      dirY = best.y - bot.y;
    } else {
      const wanderRateMult = brain.personality === 'noob' ? 2.5 : 1.0;
      if (rng.chance(BOT.wanderRate * wanderRateMult * dt)) {
        const jitter = brain.personality === 'noob' ? 1.8 : 1.2;
        brain.wanderAngle += rng.range(-jitter, jitter);
      }
      dirX = Math.cos(brain.wanderAngle);
      dirY = Math.sin(brain.wanderAngle);

      const centerPull = brain.personality === 'defensive' ? 0.0003 : 0.0006;
      dirX += (WORLD.width / 2 - bot.x) * centerPull;
      dirY += (WORLD.height / 2 - bot.y) * centerPull;
    }
  }

  const len = Math.hypot(dirX, dirY);
  if (len > 0.0001) {
    bot.aimX = dirX / len;
    bot.aimY = dirY / len;
  }
  bot.wantsBoost = brain.boostIntent;
}

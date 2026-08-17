import { MOVE } from '../core/config';
import type { InnerItemId } from './cosmetics';

export function radiusForMass(mass: number): number {
  return Math.sqrt(mass) * MOVE.radiusScale;
}

export type BotPersonality = 'aggressive' | 'defensive' | 'noob' | 'tactical' | 'sneaky' | 'apex';

export interface BotBrain {
  personality: BotPersonality;
  badge: string;
  tag: string;
  isRival?: boolean;
  /** Current wander heading, used when nothing interesting is nearby. */
  wanderAngle: number;
  attackCooldown: number;
  /** Small per-bot personality spread so the arena doesn't feel uniform. */
  aggression: number;
  caution: number;
  reaction: number;
  /** Time until the bot re-evaluates targets (staggered to spread CPU cost). */
  thinkTimer: number;
  targetX: number;
  targetY: number;
  boostIntent: boolean;
  misfireTimer?: number;
}

export interface Drop {
  id: number;
  name: string;
  isPlayer: boolean;
  alive: boolean;

  x: number;
  y: number;
  /** Steering velocity - what the player/bot is actively driving. */
  vx: number;
  vy: number;
  /** Boost velocity - a decaying impulse layered on top of steering. */
  bvx: number;
  bvy: number;

  mass: number;
  radius: number;

  colorId: string;
  itemId: InnerItemId;

  /** Unit-ish aim vector; length 0..1 acts as a throttle. */
  aimX: number;
  aimY: number;
  wantsBoost: boolean;
  boostCooldown: number;
  /** Spawn / revive invulnerability, in seconds. */
  protection: number;

  brain: BotBrain | null;

  /** Presentation-only state, read by the renderer. */
  boostFlash: number;
  wobblePhase: number;
  score: number;
  respawnIn: number;
}

export interface Pellet {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  mass: number;
  radius: number;
  tint: number;
  /** Ejected blobs carry momentum and can't be re-eaten by their owner at once. */
  ejecta: boolean;
  ownerId: number;
  arm: number;
  life: number;
  /** Idle bob so the field of food feels alive. */
  phase: number;
}

let nextDropId = 1;
let nextPelletId = 1;

export function makeDrop(init: Partial<Drop> & Pick<Drop, 'name' | 'x' | 'y' | 'mass' | 'colorId'>): Drop {
  const mass = init.mass;
  return {
    id: nextDropId++,
    name: init.name,
    isPlayer: init.isPlayer ?? false,
    alive: true,
    x: init.x,
    y: init.y,
    vx: 0,
    vy: 0,
    bvx: 0,
    bvy: 0,
    mass,
    radius: radiusForMass(mass),
    colorId: init.colorId,
    itemId: init.itemId ?? 'none',
    aimX: 0,
    aimY: 0,
    wantsBoost: false,
    boostCooldown: 0,
    protection: init.protection ?? 0,
    brain: init.brain ?? null,
    boostFlash: 0,
    wobblePhase: Math.random() * Math.PI * 2,
    score: 0,
    respawnIn: 0,
  };
}

export function makePellet(init: Omit<Pellet, 'id' | 'radius' | 'phase'> & { radius?: number }): Pellet {
  return {
    ...init,
    id: nextPelletId++,
    radius: init.radius ?? radiusForMass(init.mass),
    phase: Math.random() * Math.PI * 2,
  };
}

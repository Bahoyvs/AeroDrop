/**
 * Every tunable number in AeroDrop lives here so balance passes stay a
 * one-file affair. Distances are world pixels, times are seconds.
 */

export const WORLD = {
  width: 5200,
  height: 5200,
  /** Soft wall: drops get pushed back once they cross the border. */
  wallPush: 900,
};

export const MATCH = {
  /** A round is a short 3-5 minute session, per the design brief. */
  durationSec: 300,
  botCount: 26,
  foodCount: 850,
  /** Bots respawn so the arena never empties out mid-round. */
  botRespawnDelay: 2.5,
};

export const MASS = {
  start: 26,
  min: 18,
  max: 90000,
  /**
   * Molecules are worth a real bite - roughly an eighth of a starting drop -
   * so the early game is about getting big fast rather than grinding.
   */
  food: 3.2,
  /** Big drops slowly bleed mass so nobody snowballs unopposed. */
  decayAbove: 420,
  decayPerSec: 0.0045,
  /** Predator must be this much larger (by radius) to swallow prey. */
  eatRatio: 1.1,
  /** How deep the predator has to overlap the prey to finish the meal. */
  eatOverlap: 0.42,
};

export const MOVE = {
  /** radius = sqrt(mass) * radiusScale */
  radiusScale: 3.25,
  baseSpeed: 340,
  minSpeed: 112,
  /** Speed falls off as (referenceRadius / radius) ^ speedFalloff. */
  speedFalloff: 0.42,
  referenceRadius: 16.6,
  /** Water drag: how quickly velocity converges on the desired velocity. */
  steerResponse: 7.6,
  steerResponseFalloff: 0.18,
  minSteerResponse: 2.4,
  maxSteerResponse: 9.5,
  /** Passive drag applied every frame - this is what makes it feel wet. */
  drag: 1.35,
  /** Deadzone (in screen px) around the cursor where the drop coasts. */
  cursorDeadzone: 26,
};

export const BOOST = {
  /** Fraction of current mass paid per activation. */
  massCost: 0.03,
  minCost: 1.4,
  cooldown: 0.42,
  /** Impulse velocity added toward the cursor. */
  impulse: 640,
  minImpulse: 240,
  impulseFalloff: 0.28,
  /** Ejected blob leaves at this speed, opposite the dash. */
  ejectSpeed: 430,
  ejectDrag: 2.1,
  /** Own ejecta can't be re-absorbed until this many seconds have passed. */
  ejectArmTime: 0.7,
  /** Ejecta despawn into regular food after this long. */
  ejectLifetime: 26,
};

export const SPAWN = {
  /** Seconds of invulnerability after a spawn or a revive. */
  protection: 3.4,
  reviveProtection: 3.4,
  /** Keep new spawns this far away from anything that could eat them. */
  safeDistance: 320,
  safeTries: 40,
};

export const CAMERA = {
  /**
   * Visible half-height in world units = base + radius * perRadius. Tuned so a
   * fresh drop fills a comfortable ~25px on screen and a monster still fits,
   * with the pull-back happening gradually the whole way up.
   */
  baseView: 180,
  perRadius: 5.2,
  minScale: 0.24,
  maxScale: 1.7,
  /** Short-axis size below which the camera starts zooming in for phones. */
  smallScreenReference: 680,
  /** Exponential smoothing rates. */
  followLerp: 9,
  zoomLerp: 2.4,
};

export const RENDER = {
  /** Metaball tuning: blur is expressed in world units and scaled by zoom. */
  metaBlur: 11,
  metaBlurQuality: 3,
  /** Alpha threshold applied after the blur (contrast, offset). */
  metaThresholdContrast: 26,
  metaThresholdCutoff: 0.46,
  /** Blobs are drawn slightly fat so blur+threshold lands on the true radius. */
  blobOversize: 1.16,
  /** Jelly wobble. */
  displacementScale: 9,
  displacementDrift: 26,
  maxLabelScale: 1.0,
  /** Food sprites are drawn this many times their collision radius. */
  foodDrawScale: 2.2,

  /**
   * Glass shading, all derived in the threshold shader from the blurred field,
   * so it follows the *merged* liquid surface rather than each circle.
   */
  /**
   * Opacity in the middle of a drop. High: against bright water a see-through
   * drop simply disappears, and the reference look is solid coloured gel with
   * light playing over it, not tinted glass.
   */
  centerAlpha: 0.88,
  // Opacity at the shell, where refraction piles the light up.
  edgeAlpha: 0.99,
  /** How far in the shell reaches, as a fraction of the field ramp. */
  rimDepth: 0.4,
  /** How much the shell darkens the body colour - the containing outline. */
  edgeDarken: 0.76,
  /** Strength of the bright line riding the outer surface. */
  rimLight: 0.38,
  /** Lift applied to the whole body - washes the colour toward the sky. */
  bodyLift: 0.04,
  /** Contact shadow cast on the water: size multiple, offset and opacity. */
  shadowScale: 1.12,
  shadowOffset: 0.16,
  shadowAlpha: 0.3,

  /** Max background displacement under a drop, in screen pixels. */
  refractionScale: 34,
};

/**
 * Spring-ring soft body. Each drop's outline is a ring of points held to a rest
 * circle by springs and coupled to their neighbours, so a change of direction
 * sends a wave travelling around the surface - the water-balloon wobble.
 */
export const SOFTBODY = {
  points: 20,
  /** Pull back to the rest circle. Higher = firmer, faster wobble. */
  stiffness: 105,
  /** Coupling between neighbours - this is what makes waves travel. */
  tension: 62,
  damping: 8.2,
  /**
   * How hard a change in velocity shoves the surface around. The impulse is
   * the raw velocity delta, so this is small: a Jet Boost lands ~620px/s in a
   * single frame, and peak deformation is roughly delta * drive / sqrt(stiffness).
   */
  drive: 0.0032,
  /** Extra radial kick fired into the surface when a Jet Boost goes off. */
  boostKick: 0.7,
  /** Idle shimmer so a parked drop still breathes. */
  idleAmount: 0.014,
  idleSpeed: 2.2,
  idleWaves: 3,
  /** Deformation limits, as a fraction of the rest radius. */
  minOffset: -0.24,
  maxOffset: 0.32,
  /** Steady-state elongation along the direction of travel. */
  stretch: 0.19,
  stretchSpeed: 1500,
};

export const BOT = {
  /** How far a bot can perceive the world around it. */
  vision: 620,
  visionPerRadius: 7.5,
  /** Danger has to be this close (relative to vision) before fleeing. */
  fleeRange: 0.85,
  /** Bots boost-attack prey inside this slice of their vision. */
  attackRange: 300,
  attackCooldown: 1.6,
  /** Chance per second a bot re-picks a wander direction. */
  wanderRate: 0.6,
  /** Bots only chase prey they can comfortably out-mass. */
  preyRatio: 1.18,
  /** Bots avoid the map edge from this distance inward. */
  edgeMargin: 260,
};

export const AD = {
  /** Revives allowed per match (design doc: one). */
  revivesPerMatch: 1,
  /** Mass returned on revive, as a fraction of mass at death. */
  reviveMassFactor: 0.5,
  /** Lobby rewarded ad: start the round at double mass. */
  startBoostFactor: 2,
  /** CrazyGames requires a gap between interstitials. */
  interstitialCooldownSec: 90,
};

export const LEADERBOARD = {
  /** CrazyGames 32-byte base64 encryption key. Replace with game key from Developer Portal. */
  encryptionKey: 'dGhpcyBpcyBhIDMyLWJ5dGUga2V5IGZvciB0ZXN0aW4=',
  scoreLabel: 'POINTS' as const,
  scoreSorting: 'DESC' as const,
  minValue: 0,
  maxValue: 500000,
  cooldownSeconds: 10,
  isIncremental: false,
  guide: 'Endless Mode - Grow your drop as big as possible',
};

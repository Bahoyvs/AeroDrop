# AeroDrop.io

A browser `.io` arena where cell-growing meets real fluid simulation: spring-based soft-body drops that deform, merge and refract the world behind them, contested by steering-AI bots.

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| **Language** | TypeScript 5.9 (strict, ~4,800 LOC) |
| **Rendering** | PixiJS 8 (WebGL) — custom GLSL metaball pass, `DisplacementFilter` refraction, mesh soft bodies |
| **Build** | Vite 7 (`tsc --noEmit` gates every build) |
| **Audio** | WebAudio synthesis — zero audio files |
| **Assets** | None. Every texture is generated on canvas at boot |
| **Platform SDK** | CrazyGames SDK v3, with a working local fallback |
| **Persistence** | `localStorage` profile (cosmetics, records, audio preference) |

**Architecture patterns:** simulation/render/UI separation, uniform spatial grid, deterministic PRNG (`mulberry32`), frame-rate-independent damping, single-source-of-truth tuning config.

---

## Core Mechanics & Features

- **Simulates water, not just movement.** Drops carry momentum and drag rather than snapping to a direction vector, so positioning is tactical: the cursor's distance from the drop acts as a throttle, and every turn costs inertia.
- **Trades mass for velocity via Jet Boost.** A risk-reward burst that spends mass for thrust on a cooldown — mistimed it leaves you smaller and exposed, correctly timed it closes a kill. This single mechanic carries the game's skill ceiling.
- **Renders liquid in three composited layers.** A screen-space refraction map bends the background behind each drop, a blurred metaball pass fuses nearby drops into a single continuous shell, and an unfiltered sharp layer carries specular highlights, core items and name labels on top.
- **Populates the arena with steering-AI bots** that run a three-rule decision loop every frame — seek food, flee anything ≥10% larger inside the vision cone, boost-charge swallowable prey — each with its own aggression, caution and reaction personality coefficients.

---

## Technical Architecture & Problem Solving

**The hardest problem was making many independent drops read as one body of liquid, in real time, in a browser.** The naïve approach — draw a blue circle per entity — never merges, never refracts, and never looks wet. The solution is a three-pass hybrid pipeline, and each pass had a non-obvious failure mode worth documenting.

*Refraction.* Every drop stamps its own lens texture into a screen-sized offscreen displacement map, and the background is bent through it, so caustics and bubbles magnify as they pass behind a drop. The map must be cleared to **neutral grey (128,128 = "zero displacement")** — clearing it to transparent black, the intuitive default, shifts the entire background by half a screen.

*Metaballs.* Drop silhouettes are collected into one container and pushed through displacement (micro-jitter) → blur → a glass threshold. Where two blurred alpha fields overlap enough to cross the threshold, a **liquid bridge** forms. PixiJS's stock `ColorMatrixFilter` cannot express this threshold: it re-premultiplies the result against the raised alpha and blows every drop out to white. The pass is therefore a hand-written GLSL shader (`metaballFilter.ts`). It also exploits a property of the blurred field — it is effectively a distance field, at threshold on the surface and climbing toward 1 inside — so a *single* value drives silhouette, dense refractive edge, transparent interior and thin rim light at once. Because that measurement runs on the **merged** field, two bridged drops receive one unbroken shell rather than two overlapping outlines. This also forced deleting the baked circular edges from the drop textures: with the silhouette now owned by the shader, a hard texture rim showed up as a ghost second circle inside the wobbling surface.

*Soft bodies.* Each drop's outline is a ring of 20 points, spring-held to a rest circle, damped, and **coupled to its two neighbours** — so an impulse travels around the surface as a wave rather than denting it locally. Velocity changes are injected as impulses along each point's normal, flattening the leading edge and bulging the trailing one, which produces the water-balloon wobble and a teardrop shape under acceleration. Offsets are stored as a *fraction of current radius*, so a speck and a leviathan wobble with identical character and the mesh can be rebuilt every frame without re-tuning. Long frames sub-step the spring integration to stay stable.

Since blur and displacement operate in screen space, both are rescaled against camera zoom every frame so the effect stays fixed in world units.

**On the simulation side**, food lookup runs through a uniform spatial grid keyed by integer cell index (`cy * cols + cx`) rather than string keys, and drop integration uses a frame-rate-independent `damp()` (exponential decay, not `lerp`) so physics behave identically at 60 and 144 Hz. Bot threat evaluation weights escape vectors by inverse-square proximity and treats **map edges as mild threats**, which prevents the classic `.io` failure of bots pinning themselves against a wall. Threat always outranks greed.

**Zero external assets** is a deliberate constraint, not an omission: textures (drop silhouette, specular, caustics, perlin noise, pellets, bubbles) are procedurally generated on canvas at boot, sounds are synthesised through WebAudio, and pixel-font labels are drawn small and upscaled nearest-neighbour. The game ships as a single JS + CSS bundle with no network fetches. Every balance number — world size, mass→radius and mass→speed curves, boost cost/impulse/cooldown, bot vision, camera zoom curve — lives in `src/core/config.ts`, so tuning never requires touching simulation code.

---

## Installation / How to Play

**Requirements:** Node.js 20+.

```bash
git clone https://github.com/Bahoyvs/AeroDrop.git
cd AeroDrop
npm install
npm run dev          # http://localhost:5173, hot reload
```

```bash
npm run build        # typecheck + production bundle to dist/
npm run preview      # serve dist/ locally
npm run typecheck    # tsc --noEmit only
```

The game is entirely client-side — no server, no backend, no external assets. `dist/` drops straight onto static hosting (or into a CrazyGames zip); `vite.config.ts` sets `base: './'` so subdirectory hosting works unchanged.

*Live build: **[link pending]***

### Controls

| Action | Desktop | Mobile |
| --- | --- | --- |
| Move | Mouse cursor (or `WASD` / arrow keys) | Touch and drag |
| Jet Boost | `Space` or right-click | `BOOST` button or double-tap |

Cursor distance from the drop acts as a throttle: small movements give precise control, a flick to the far edge of the screen gives full speed.

---

## Repository Layout

```
src/
  core/
    config.ts       every balance number in one file (world, mass, speed, boost, bot, ads)
    math.ts         clamp / lerp / frame-rate-independent damp / formatting
    rng.ts          deterministic mulberry32 PRNG
  game/
    world.ts        simulation: physics, collision, uniform food grid, spawns, leaderboard
    bot.ts          steering AI (seek / flee / boost-attack) with per-bot personality
    entities.ts     Drop & Pellet models · game.ts  match flow · input.ts  unified input
    cosmetics.ts    colour + core-item catalogue · names.ts  bot names, name sanitising
  render/
    renderer.ts     Pixi app + hybrid liquid pipeline
    softBody.ts     spring-mesh jelly physics
    metaballFilter.ts  hand-written GLSL threshold + glass shading (fresnel / rim / transparency)
    dropView.ts     soft body + specular + core item + label
    textures.ts     all textures generated at runtime · innerItems.ts  vector→texture bake
    background.ts   depth gradient, caustics, grid, rising bubbles
    camera.ts       mass-driven smooth zoom · fx.ts  pooled additive particles
    labels.ts       nearest-neighbour upscaled pixel labels
  ui/               all DOM interaction (the simulation never touches an element) + canvas minimap
  audio/sfx.ts      WebAudio-synthesised sound
  platform/crazygames.ts   SDK v3 wrapper with local fallback
  save.ts           localStorage profile
```

---

## Platform Integration

`src/platform/crazygames.ts` wraps SDK v3 and **works without it**: in local development a rewarded ad is replaced by a short countdown overlay and the reward still grants, so every reward path is testable off-platform. Rewards are only granted on genuine `adFinished`; audio is fully muted for the ad's duration and `gameplayStart` / `gameplayStop` signals are emitted around it.

---

## Project Status

Core loop is fully playable end to end: water physics, Jet Boost, bot simulation, metaball liquid rendering, cosmetics, 5-minute match flow and platform integration.

- [x] Core movement + water physics · Jet Boost (mass cost, impulse, cooldown)
- [x] Bot AI (seek / flee / boost-attack, personality distribution)
- [x] Spring soft bodies, metaball merging, glass shading, background refraction
- [x] Cosmetics (colour + core item) and localStorage profile
- [x] CrazyGames SDK integration (rewarded + interstitial, local fallback)
- [ ] Additional balance pass on the mass curve using long-session data
- [ ] More core items and seasonal cosmetics
- [ ] Low-spec profile (unfiltered "performance" mode)

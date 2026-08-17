# AeroDrop.io — Game Design Document (GDD)

**Version:** 1.0.0  
**Status:** Approved / Live Implementation  
**Target Platform:** Web Browsers (Desktop & Mobile HTML5 / WebGL) — CrazyGames Primary  
**Genre:** Casual .io / Real-Time Physics-Based Action  
**Visual Style:** Frutiger Eco / Helvetica Aqua Aero (2000s Skeuomorphic Web Aesthetic)  

---

## 1. Executive Summary & Vision

### 1.1 Overview
**AeroDrop.io** is a high-octane, single-player casual `.io` action game that modernizes classic cell-growing mechanics (pioneered by Agar.io) through **hydrodynamic water physics**, a high-stakes **Jet Boost** system, and a striking **2000s Frutiger Eco / Aqua Aero skeuomorphic design**.

The player controls a liquid water drop navigating an aquatic arena, absorbing smaller nutrient pellets and smaller drops while fleeing larger predators. Unlike traditional grid-aligned or linear cell games, AeroDrop introduces realistic fluid drag, momentum steering, and soft-body jelly deformation that makes every turn, collide, and dash feel organic and alive.

### 1.2 Core Pillars
1. **Fluid Tactility:** Movement isn't static; water momentum, drag, and jelly soft-body wobble make controlling the drop inherently satisfying.
2. **High-Stakes Mobility (Jet Boost):** Speed is bought with body mass. Ejecting mass to dash creates dynamic risk-reward combat scenarios.
3. **Nostalgic 2000s Aesthetic:** Vibrant aqua tones, skeuomorphic glass UI, specular reflections, and ambient caustics evoke the golden era of Web 2.0 and Windows Vista / Frutiger Eco design.
4. **Zero-Latency Bot Simulation:** Full client-side bot AI simulates an intense 27-player multiplayer arena with zero network latency, instant loading, and smooth performance on low-end mobile devices.

---

## 2. Target Audience & Session Model

* **Target Demographics:** 
  * Gamers who enjoy web `.io` games (Agar.io, Slither.io, Hole.io).
  * Nostalgia enthusiasts drawn to 2000s glossy, glassmorphic Frutiger Aero design.
  * Casual mobile/desktop players seeking quick, high-engagement game breaks.
* **Session Length:** Short 3–5 minute match sessions (`durationSec: 300`).
* **Monetization Model:** Free-to-play with non-intrusive Rewarded Ads (Extra Revive per match, Unlocking Exclusive Color Tints & Core Items) and Mid-roll Interstitial Ads managed via the CrazyGames SDK v3.

---

## 3. Gameplay Mechanics & Game Design

```
                     +---------------------------+
                     |    Spawn Safe in Arena    |
                     +-------------+-------------+
                                   |
                                   v
                     +---------------------------+
                     |  Feed on Organic Pellets  |
                     +-------------+-------------+
                                   |
                                   v
                     +---------------------------+
                     |  Mass & Radius Increase   |
                     +-------------+-------------+
                                   |
           +-----------------------+-----------------------+
           |                                               |
           v                                               v
+---------------------+                         +---------------------+
|   Jet Boost Dash    |                         |  Hunt & Swallow     |
| (Pays 3% Mass Cost) |                         |   Smaller Drops     |
+----------+----------+                         +----------+----------+
           |                                               |
           +-----------------------+-----------------------+
                                   |
                                   v
                      +---------------------------+
                      |     Reach #1 Peak Rank    |
                      +-------------+-------------+
                                   |
                     +-------------v-------------+
                     | Match Ends (Timeout/Eaten)|
                     +---------------------------+
```

### 3.1 Mass & Scaling Formulas
Every entity in AeroDrop is defined by its core **Mass**. Size, movement speed, camera distance, and steering response scale according to exact mathematical curves defined in `src/core/config.ts`:

* **Mass-to-Radius Formula:**
  $$\text{Radius} = \sqrt{\text{Mass}} \times 3.25$$
* **Starting Mass:** $26$ units ($\text{Radius} \approx 16.57$ px).
* **Mass Range:** Minimum $18$, Maximum $90,000$.
* **Mass Decay (Anti-Snowballing):**
  * Applies to drops with Mass $> 420$.
  * Bleeds mass continuously at $0.45\%$ per second ($\text{decayPerSec} = 0.0045$).
* **Pellet Feed Value:** Each nutrient pellet grants $+3.2$ mass (approx. $12\%$ of initial mass, allowing rapid early-game growth).

### 3.2 Movement & Water Drag Physics
Movement feels floaty yet responsive, mimicking a surface tension drop moving over a hydrophobic fluid layer.

* **Speed Falloff Equation:**
  $$\text{Base Speed} = 340 \text{ px/s}$$
  $$\text{Speed} = \text{max}\left(112, \, 340 \times \left(\frac{16.6}{\text{Radius}}\right)^{0.42}\right)$$
  * *Design Result:* Larger drops are naturally slower, creating a tactical dynamic where small drops can outrun giants unless the giant uses a Jet Boost.
* **Hydrodynamic Drag & Steering Response:**
  * Passive water drag: $1.35$ per second.
  * Steering response decays from $9.5$ (nimble for tiny drops) to $2.4$ (sluggish inertia for giant leviathans).
* **Cursor Deadzone:** A $26$px deadzone around the cursor allows drops to glide smoothly without jittering.

### 3.3 The Jet Boost System (Risk-Reward Mechanics)
The **Jet Boost** is AeroDrop’s central skill-differentiating action.

* **Activation:** Triggered by `Spacebar`, `Right-Click`, or tapping the mobile `BOOST` button / Double-Tap.
* **Mass Sacrifice:** Costs $3\%$ of current total mass ($\text{minCost} = 1.4$).
* **Propulsion Impulse:** Delivers an instant velocity kick of up to $+640$ px/s in the movement direction (decaying slightly with drop mass).
* **Ejected Mass Blob:**
  * When boosting, the drop ejects a blob of water backwards at $430$ px/s.
  * The ejected blob cannot be re-absorbed by the booster for $0.7$ seconds (`ejectArmTime`).
  * If uncollected, the blob turns into standard arena pellets after $26$ seconds (`ejectLifetime`).
* **Tactical Uses:**
  1. *Aggressive Ambush:* Dash forward to close distance rapidly and swallow a smaller prey drop before they can react.
  2. *Emergency Escape:* Sacrifice mass to burst away from an approaching giant predator.

### 3.4 Predation & Absorption Rules
* **Eat Ratio Requirement:** A predator must have a radius at least $1.1\times$ larger ($10\%$ larger radius) than the prey to swallow it.
* **Overlap Threshold:** Swallowing triggers when the predator overlaps at least $42\%$ of the prey's total volume.
* **Spawn Shield:** Spawning drops receive $3.4$ seconds of total invulnerability (`SPAWN.protection`), indicated visually by a pulsating protective shimmer.

---

## 4. Bot Steering AI Engine

Because AeroDrop operates as a single-player game simulating a 27-player arena, the **Bot AI** (`src/game/bot.ts`) is designed to mirror human player decision-making.

```
                  +-------------------------+
                  |    Perception Phase     |
                  | (Vision = 620 + 7.5*R)  |
                  +------------+------------+
                               |
            +------------------+------------------+
            |                                     |
            v                                     v
+-----------------------+             +-----------------------+
|  Threat Level > 0.02  |             | Threat Level <= 0.02  |
|  (Predator / Wall)    |             | (Safe Environment)    |
+-----------+-----------+             +-----------+-----------+
            |                                     |
            v                                     v
+-----------------------+             +-----------------------+
| Flee / Panic Boost    |             |  Check Hunt Targets   |
+-----------------------+             +-----------+-----------+
                                                  |
                               +------------------+------------------+
                               |                                     |
                               v                                     v
                    +--------------------+                +--------------------+
                    | Prey in Attack Cone|                |  No Nearby Prey    |
                    | (Dist < 300px)     |                |                    |
                    +---------+----------+                +---------+----------+
                              |                                     |
                              v                                     v
                    +--------------------+                +--------------------+
                    | Boost-Charge Target|                | Seek Food Pellets /|
                    +--------------------+                | Wander Space       |
                    +--------------------+
```

### 4.1 AI Perception & Decision Pipeline
Each bot evaluates its environment every tick using distinct internal personality traits:
* **Perception Range:** $\text{Vision} = 620\text{px} + (\text{Radius} \times 7.5)$.
* **Personality Matrix:** Generated deterministically per bot via Mulberry32 PRNG:
  * `Aggression` ($0.55 - 1.35$)
  * `Caution` ($0.70 - 1.40$)
  * `Reaction Time` ($0.08 - 0.22\text{s}$)

### 4.2 Tri-Behavior Steering Model
1. **Threat Evasion (Highest Priority):** If a predator ($1.1\times$ larger) enters flee range ($85\%$ of vision), the bot steers away. If the threat is dangerously close, the bot will trigger a panic Jet Boost.
2. **Arena Edge Avoidance:** Arena borders act as virtual threats within $260$px to prevent bots from trapping themselves against soft walls.
3. **Predator Hunting & Boost Charges:** If a smaller prey ($1.18\times$ smaller) is detected within an attack range of $300$px, the bot launches a targeted Jet Boost attack.
4. **Foraging & Wandering:** In the absence of threats or prey, the bot seeks out high-density food pellet clusters or wanders smoothly.

---

## 5. Visual Aesthetics & Rendering Engine

AeroDrop's defining feature is its **Frutiger Eco / Helvetica Aqua Aero** skeuomorphic visual style.

### 5.1 The 3-Pass Hybrid Fluid Renderer
Built on **PixiJS v8** and custom GLSL WebGL shaders (`src/render/`):

1. **Pass 1: Refraction & Background Displacement Layer**
   * Drops stamp a refractive lens texture onto an offscreen neutral-gray ($128, 128$) map.
   * A custom `DisplacementFilter` distorts the background grid, aquatic depth gradient, caustics light patterns, and floating air bubbles as they pass behind the drop, creating a true **3D magnifying lens effect**.
2. **Pass 2: Metaball Fusion & Glass Surface Threshold Shader**
   * All drop silhouettes are drawn to a single offscreen container, softened with a multi-pass `BlurFilter`, and processed by a custom GLSL shader (`metaballFilter.ts`).
   * When two drops approach each other, their blurred alpha fields merge, creating a organic **liquid surface bridge** before they merge completely.
   * The shader computes Fresnel edge darkness ($0.76$), translucent core glass transparency ($0.88$), and a bright rim light ($0.38$) over the unified surface boundary.
3. **Pass 3: Crisp Detail & Overlay Layer**
   * Specular highlights, volume drop shadows ($30\%$ opacity, $1.12\times$ scale), suspended vector core items, and nearest-neighbor pixel name labels are rendered crystal-clear on top without blur artifacts.

```
+-----------------------------------------------------------------------+
|                         CAMERA & CANVAS WINDOW                        |
|                                                                       |
|  +-----------------------------------------------------------------+  |
|  | PASS 3: CRISP OVERLAY                                           |  |
|  | - Constant-angle Specular Highlight                               |  |
|  | - Suspended Core Item (e.g. Floppy Disk, Shiny Star)             |  |
|  | - Pixel-crisp Name Label                                        |  |
|  +-----------------------------------------------------------------+  |
|                                  |                                    |
|  +-----------------------------------------------------------------+  |
|  | PASS 2: METABALL SHADER & LIQUID BRIDGES                        |  |
|  | - Blurred Alpha Thresholding                                    |  |
|  | - Unified Surface Boundary & Fresnel Rim Darkness               |  |
|  | - Glass Body Color & Translucency                               |  |
|  +-----------------------------------------------------------------+  |
|                                  |                                    |
|  +-----------------------------------------------------------------+  |
|  | PASS 1: BACKGROUND & REFRACTION LENS MAP                        |  |
|  | - Distorted Aquatic Caustics & Grid Lines                       |  |
|  | - Dynamic Deep Ocean Blue Gradient                               |  |
|  +-----------------------------------------------------------------+  |
|                                                                       |
+-----------------------------------------------------------------------+
```

### 5.2 Jelly Soft-Body Physics (`softBody.ts`)
Each drop's outer edge is simulated as a **20-point spring-mass ring network**:
* **Stiffness ($105$):** Controls radial pull back to rest circle.
* **Tension ($62$):** Couples neighboring points so impact forces travel around the drop circumference as a wave.
* **Dynamic Impulse Injection:** Velocity changes (like turning or Jet Boosting) deform the front and elongate the tail into a teardrop shape.

---

## 6. Customization & Cosmetics Catalogue

Players can personalize their drop with vibrant Frutiger Aero color tints and retro 2000s core icons suspended inside the water body (`src/game/cosmetics.ts`).

### 6.1 Drop Color Tints

| Color ID | Display Name | Hex Tint | Rim Accent | Unlock Requirement |
| :--- | :--- | :--- | :--- | :--- |
| `aqua` | **Aqua Blue** | `#00B4FF` | `#E0F7FF` | Default (Free) |
| `mint` | **Mint Fresh** | `#00E68A` | `#E0FFF2` | Default (Free) |
| `ice` | **Ice Cyan** | `#54E4FF` | `#FFFFFF` | Default (Free) |
| `sky` | **Sky Glass** | `#6E85FF` | `#EBF0FF` | Default (Free) |
| `neon` | **Neon Pink** | `#FF4DA6` | `#FFE6F4` | Rewarded Ad |
| `toxic` | **Toxic Green** | `#A2FF14` | `#F1FFD8` | Rewarded Ad |
| `mercury` | **Mercury Silver**| `#D0E0F0` | `#FFFFFF` | Rewarded Ad |
| `sunburst` | **Sunburst Gold** | `#FFA000` | `#FFF0D4` | Rewarded Ad |
| `violet` | **Deep Violet** | `#A052FF` | `#EFE2FF` | Rewarded Ad |
| `ember` | **Ember Red** | `#FF4D36` | `#FFE0D9` | Rewarded Ad |

### 6.2 Core Items (Suspended Retro Artifacts)

| Item ID | Display Name | Visual Concept | Status |
| :--- | :--- | :--- | :--- |
| `none` | **Empty Core** | Pure translucent water drop | Unlocked |
| `star` | **Shiny Star** | 2000s web vector star | Unlocked |
| `bubble` | **Air Pocket** | Trapped internal air bubble | Unlocked |
| `smiley` | **Happy Face** | Classic yellow web emoticon | Unlocked |
| `floppy` | **Floppy Disk** | 3.5" retro blue diskette | Rewarded Ad |
| `radioactive` | **Radioactive** | Hazard bio symbol | Rewarded Ad |
| `yinyang` | **Yin-Yang** | Balance symbol | Rewarded Ad |
| `disc` | **Burned CD** | Rainbow reflective optical disc | Rewarded Ad |
| `bolt` | **Lightning** | Electric yellow bolt | Rewarded Ad |
| `heart` | **Pixel Heart** | 8-bit red health heart | Rewarded Ad |

---

## 7. Audio System Architecture

All sound effects and ambient soundscapes in AeroDrop are **100% procedurally synthesized in real-time using the HTML5 WebAudio API** (`src/audio/sfx.ts`). There are zero external audio file downloads (`.mp3` or `.wav`), keeping initial bundle size minimal and guaranteeing zero loading lag.

### 7.1 Procedural Sound Synthesis Catalogue
1. **Pellet Absorption (`eat`):** Rapid sine-wave pitch frequency sweep ($400\text{Hz} \to 880\text{Hz}$) with bubble resonance.
2. **Jet Boost Dash (`boost`):** Low-frequency noise burst coupled with a pitch-bent triangle wave ($180\text{Hz} \to 45\text{Hz}$) recreating a hydro-thruster.
3. **Swallowing Prey (`swallow`):** Deep resonant sub-bass splash with a quick low-pass filter decay.
4. **Death / Eaten (`die`):** Descending pitch squelch with a decaying noise burst.
5. **Underwater Ambience:** Continuous dual-oscillator low-pass hum with randomized soft pop/bubble triggers.

---

## 8. User Interface & Experience (UI/UX)

The user interface matches the Frutiger Aero / Helvetica Aqua Aero theme: translucent glossy glass panels (`backdrop-filter: blur`), vibrant blue gradients, inner shadows, and high-shine pill buttons.

```
+-----------------------------------------------------------------------+
|                                SCREEN                                 |
|                                                                       |
|  [ 🏆 #1 PlayerName (4,250) ]                        [ 🗺️ MINIMAP ]   |
|  [ 🥈 BotAlpha   (2,100) ]                        [ (Canvas)   ]   |
|  [ 🥉 BotBeta    (1,850) ]                        +------------+   |
|  ...                                                                  |
|                                                                       |
|                             ( ARENA PLAY )                            |
|                                                                       |
|                                                                       |
|  +---------------------------+                +--------------------+  |
|  | MASS: 1,420 kg  | TIME: 2:45|                |   ⚡ JET BOOST    |  |
|  +---------------------------+                +--------------------+  |
+-----------------------------------------------------------------------+
```

### 8.1 UI Screen Flow
* **Lobby / Menu Screen:** Name input field, play button, cosmetic customization shop launcher, personal high score stats (`bestMass`, `totalKills`).
* **HUD Overlay:** 
  * Mass & Match Timer counter.
  * Minimap radar.
  * On-screen Touch Joystick & Boost Button (Mobile viewports).
* **Game Over & Results Screen:** Peak mass achieved, survival time, rank, kill count, "Revive with Ad" button (1 per match), and "Play Again" launcher.

---

## 9. Platform Integration & Technology Stack

### 9.1 Core Technology Stack
* **Language:** TypeScript 5.x (Strict Type-Safety).
* **Rendering Framework:** PixiJS v8 + Custom GLSL Shader Filters.
* **Bundler & Build Tool:** Vite (configured with `base: './'` for zero-config relative static hosting).
* **Audio Engine:** Custom Procedural WebAudio Synthesizer.
* **Storage:** Client-side `localStorage` for player profiles, high scores, and cosmetics inventory.

### 9.2 CrazyGames SDK v3 Integration (`src/platform/crazygames.ts`)
* **SDK Module Initialization:** Automatic detection of CrazyGames environment with silent local fallback for standalone hosting.
* **Ad Integration Touchpoints:**
  * *Mid-Roll Interstitial Ads:* Displayed upon match completion or before menu return.
  * *Rewarded Ads:* Unlocks 1 extra life per match (Revive at current mass) and unlocks premium drop colors & inner core cosmetics.
  * *Audio Ducking:* Automatic audio gain muting (`sfx.setDucked(true)`) during ad playback to meet platform compliance requirements.

---

## 10. Technical Performance & Optimization Standards

* **Target Framerate:** Solid 60 FPS on desktop & mid-tier mobile hardware.
* **Zero Asset Downloads:** All textures (drop gradients, glass shine, pellet textures, core vector icons) are generated programmatically at runtime on HTML5 Canvases.
* **Object Pooling:** Particles, pellets, and soft-body spring nodes are pooled to avoid Garbage Collection (GC) pauses during intense gameplay.
* **Spatial Hashing:** Collision queries between drops and nutrient pellets use spatial grid partitioning (`src/game/world.ts`) to maintain fast $O(1)$ query times.

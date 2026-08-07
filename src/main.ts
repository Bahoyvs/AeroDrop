import './style.css';
import { sfx } from './audio/sfx';
import { Game } from './game/game';
import type { InnerItemId } from './game/cosmetics';
import { platform } from './platform/crazygames';
import { GameRenderer } from './render/renderer';
import { profile } from './save';
import { Ui } from './ui/ui';

/**
 * Boot sequence: kick off the SDK handshake and the WebGL context in parallel,
 * wire the UI callbacks to the game, then hand the ticker to the game loop.
 */
async function boot(): Promise<void> {
  const host = document.getElementById('stage');
  const minimapCanvas = document.getElementById('minimap');
  if (!host || !(minimapCanvas instanceof HTMLCanvasElement)) {
    throw new Error('AeroDrop: page markup is missing #stage or #minimap');
  }

  const sdkReady = platform.init();

  const renderer = new GameRenderer();
  await renderer.init(host);

  // `game` is assigned right after the UI is built; the callbacks below only
  // ever fire from user input, which cannot happen before that.
  let game: Game;

  const ui = new Ui({
    onPlay: () => game.startMatch(),
    onPlayAgain: () => {
      if (game.currentPhase === 'finished') void game.leaveResults('again');
      else game.startMatch();
    },
    onLobby: () => {
      if (game.currentPhase === 'finished') void game.leaveResults('lobby');
      else game.returnToLobby();
    },
    onRevive: () => void game.requestRevive(),
    onStartBoost: () => void game.requestStartBoost(),
    onUnlockColor: (id) => void game.requestUnlock('color', id),
    onUnlockItem: (id: InnerItemId) => void game.requestUnlock('item', id),
    onBoostPressed: () => game.boostFromUi(),
  });

  game = new Game(renderer, ui, minimapCanvas);

  platform.setAdHost(ui.adHost);
  ui.setItemPreviews(renderer.itemPreviewCanvases());
  sfx.setMuted(profile.value.muted);

  // Dev-only handle for poking at the simulation from the console or a
  // browser test. `import.meta.env.DEV` is inlined as false for production,
  // so this block is dropped from the shipped bundle entirely.
  if (import.meta.env.DEV) {
    (window as unknown as { aerodrop: unknown }).aerodrop = { game, renderer, ui };
  }

  await sdkReady;
  platform.loadingFinished();

  // Attract mode fills the tank behind the menu before the first match.
  game.startAttract();
  ui.hideLoading();
  ui.show('lobby');

  // Fixed maximum step: a background tab can hand back a huge delta, and a
  // 3-second physics step would teleport every drop through the arena.
  renderer.app.ticker.add((ticker) => {
    const dt = Math.min(ticker.deltaMS / 1000, 1 / 20);
    game.update(dt);
  });

  // Browsers only allow audio after a gesture; the first one anywhere unlocks.
  const unlockAudio = () => sfx.unlock();
  window.addEventListener('pointerdown', unlockAudio, { once: true });
  window.addEventListener('keydown', unlockAudio, { once: true });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) sfx.setDucked(true);
    else sfx.setDucked(false);
  });
}

boot().catch((error: unknown) => {
  console.error('[AeroDrop] failed to start', error);
  const loading = document.getElementById('loading');
  if (loading) {
    loading.classList.remove('hidden', 'fading');
    loading.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'loading-box';
    const title = document.createElement('p');
    title.className = 'loading-text';
    title.textContent = 'Could not start AeroDrop';
    const detail = document.createElement('p');
    detail.style.cssText = 'font-size:12px;opacity:0.7;max-width:340px;margin:8px auto 0';
    detail.textContent =
      error instanceof Error ? error.message : 'WebGL may be unavailable in this browser.';
    box.append(title, detail);
    loading.appendChild(box);
  }
});

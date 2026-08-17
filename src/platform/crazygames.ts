import { AD } from '../core/config';
import { sfx } from '../audio/sfx';

/**
 * CrazyGames SDK v3 wrapper.
 *
 * The SDK only exists when the game is embedded on CrazyGames, so everything
 * here degrades to a local simulation: during development (and on any other
 * host) a rewarded ad becomes a short countdown overlay that still grants the
 * reward, which means the reward flows can be played and tested end to end.
 */

type AdType = 'rewarded' | 'midgame';

interface CrazyAdCallbacks {
  adStarted?: () => void;
  adFinished?: () => void;
  adError?: (error: unknown) => void;
}

interface CrazySdk {
  init?: () => Promise<void>;
  game: {
    gameplayStart: () => void;
    gameplayStop: () => void;
    loadingStart: () => void;
    loadingStop: () => void;
    happytime: () => void;
  };
  ad: {
    requestAd: (type: AdType, callbacks: CrazyAdCallbacks) => void;
  };
  user?: {
    getUser?: () => Promise<{ username?: string } | null>;
    submitScore?: (data: { encryptedScore: string; score: number }) => void | Promise<void>;
  };
}

declare global {
  interface Window {
    CrazyGames?: { SDK?: CrazySdk };
  }
}



export type AdResult = 'reward' | 'error' | 'unavailable';

const SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';
const SDK_TIMEOUT_MS = 5000;

export interface AdHost {
  /** Shows/hides the fallback ad overlay. Supplied by the UI layer. */
  show: (label: string, seconds: number) => void;
  hide: () => void;
  tick?: (secondsLeft: number) => void;
}

class CrazyGamesPlatform {
  private sdk: CrazySdk | null = null;
  private ready = false;
  private adInProgress = false;
  private lastInterstitial = -Infinity;
  private host: AdHost | null = null;
  private gameplayRunning = false;

  get available(): boolean {
    return this.sdk !== null;
  }

  setAdHost(host: AdHost): void {
    this.host = host;
  }

  /**
   * Loads the SDK if we're on a CrazyGames domain (or if it was injected by
   * their QA tool). Never rejects - a missing SDK is a normal, supported state.
   */
  async init(): Promise<void> {
    if (this.ready) return;
    this.ready = true;
    try {
      const sdk = await this.loadSdk();
      if (!sdk) return;
      await sdk.init?.();
      this.sdk = sdk;
      this.sdk.game.loadingStart();
    } catch (error) {
      console.warn('[AeroDrop] CrazyGames SDK unavailable, running standalone.', error);
      this.sdk = null;
    }
  }

  private loadSdk(): Promise<CrazySdk | null> {
    if (window.CrazyGames?.SDK) return Promise.resolve(window.CrazyGames.SDK);

    return new Promise((resolve) => {
      const script = document.createElement('script');
      let settled = false;
      const finish = (value: CrazySdk | null) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(value);
      };
      const timer = window.setTimeout(() => finish(null), SDK_TIMEOUT_MS);

      script.src = SDK_URL;
      script.async = true;
      script.addEventListener('load', () => finish(window.CrazyGames?.SDK ?? null));
      script.addEventListener('error', () => finish(null));
      document.head.appendChild(script);
    });
  }

  // ------------------------------------------------------- lifecycle events

  loadingFinished(): void {
    this.sdk?.game.loadingStop();
  }

  gameplayStart(): void {
    if (this.gameplayRunning) return;
    this.gameplayRunning = true;
    this.sdk?.game.gameplayStart();
  }

  gameplayStop(): void {
    if (!this.gameplayRunning) return;
    this.gameplayRunning = false;
    this.sdk?.game.gameplayStop();
  }

  /** Signals a peak moment (new personal best, big kill). */
  happytime(): void {
    this.sdk?.game.happytime();
  }



  // -------------------------------------------------------------------- ads

  /**
   * Rewarded ad. Resolves 'reward' only when the player actually earned it,
   * so callers can safely hand out the prize on that branch alone.
   */
  async showRewarded(label: string): Promise<AdResult> {
    if (!AD.enabled) return 'reward';
    if (this.adInProgress) return 'unavailable';
    this.adInProgress = true;
    const wasPlaying = this.gameplayRunning;
    if (wasPlaying) this.gameplayStop();
    sfx.setDucked(true);

    try {
      if (this.sdk) return await this.requestSdkAd('rewarded');
      return await this.simulateAd(label, 3);
    } finally {
      sfx.setDucked(false);
      this.host?.hide();
      this.adInProgress = false;
      if (wasPlaying) this.gameplayStart();
    }
  }

  /**
   * Interstitial between matches. Rate-limited so returning to the lobby a few
   * times in a row doesn't spam the player (and keeps within platform rules).
   */
  async showInterstitial(): Promise<AdResult> {
    if (!AD.enabled) return 'unavailable';
    const now = performance.now() / 1000;
    if (now - this.lastInterstitial < AD.interstitialCooldownSec) return 'unavailable';
    if (this.adInProgress) return 'unavailable';

    this.adInProgress = true;
    this.lastInterstitial = now;
    const wasPlaying = this.gameplayRunning;
    if (wasPlaying) this.gameplayStop();
    sfx.setDucked(true);

    try {
      if (this.sdk) return await this.requestSdkAd('midgame');
      return await this.simulateAd('Sponsor message', 2.5);
    } finally {
      sfx.setDucked(false);
      this.host?.hide();
      this.adInProgress = false;
    }
  }

  private requestSdkAd(type: AdType): Promise<AdResult> {
    return new Promise<AdResult>((resolve) => {
      let settled = false;
      const done = (result: AdResult) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };
      try {
        this.sdk?.ad.requestAd(type, {
          adFinished: () => done('reward'),
          adError: (error) => {
            console.warn('[AeroDrop] ad error', error);
            done('error');
          },
        });
      } catch (error) {
        console.warn('[AeroDrop] ad request threw', error);
        done('error');
      }
    });
  }

  /** Local stand-in so the reward loop is playable off-platform. */
  private simulateAd(label: string, seconds: number): Promise<AdResult> {
    return new Promise((resolve) => {
      if (!this.host) {
        window.setTimeout(() => resolve('reward'), 250);
        return;
      }
      this.host.show(label, seconds);
      // Driven off the clock rather than by counting ticks: on a loaded main
      // thread the interval fires late, and a tick-counting countdown would
      // stretch a 3 second placeholder into far longer.
      const endsAt = performance.now() + seconds * 1000;
      const timer = window.setInterval(() => {
        const left = (endsAt - performance.now()) / 1000;
        this.host?.tick?.(Math.max(0, left));
        if (left <= 0) {
          window.clearInterval(timer);
          resolve('reward');
        }
      }, 80);
    });
  }
}

export const platform = new CrazyGamesPlatform();

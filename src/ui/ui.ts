import { sfx } from '../audio/sfx';
import { formatMass, formatTime } from '../core/math';
import { DROP_COLORS, INNER_ITEMS, findColor, type InnerItemId } from '../game/cosmetics';
import type { LeaderboardRow } from '../game/world';
import type { AdHost } from '../platform/crazygames';
import { profile } from '../save';

export type ScreenName = 'loading' | 'lobby' | 'hud' | 'help' | 'shop' | 'death' | 'results';

export interface UiCallbacks {
  onPlay: () => void;
  onPlayAgain: () => void;
  onLobby: () => void;
  onRevive: () => void;
  onStartBoost: () => void;
  onUnlockColor: (id: string) => void;
  onUnlockItem: (id: InnerItemId) => void;
  onBoostPressed: () => void;
}

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`AeroDrop: missing #${id}`);
  return node as T;
}

/**
 * Everything DOM. The game core never touches elements directly - it calls
 * into here, which keeps the simulation testable and the markup in one place.
 */
export class Ui {
  private screens: Record<ScreenName, HTMLElement>;

  private nameInput = el<HTMLInputElement>('nameInput');
  private colorRow = el('colorRow');
  private itemRow = el('itemRow');
  private shopColors = el('shopColors');
  private shopItems = el('shopItems');

  private hudMass = el('hudMass');
  private hudRank = el('hudRank');
  private hudTimer = el('hudTimer');
  private boostFill = el('boostFill');
  private leaderboard = el<HTMLOListElement>('leaderboard');
  private killfeed = el('killfeed');
  private toastEl = el('toast');

  private killerName = el('killerName');
  private deathMass = el('deathMass');
  private deathRank = el('deathRank');
  private reviveBtn = el<HTMLButtonElement>('reviveBtn');
  private reviveSub = el('reviveSub');

  private resultRank = el('resultRank');
  private resultBoard = el<HTMLOListElement>('resultBoard');

  private adTitle = el('adTitle');
  private adFill = el('adFill');
  private adOverlay = el('adOverlay');

  private muteIcon = el('muteIcon');
  private toastTimer = 0;
  private itemPreviews = new Map<InnerItemId, HTMLCanvasElement>();
  private current: ScreenName = 'loading';
  private reviveEnabled = false;

  constructor(private callbacks: UiCallbacks) {
    this.screens = {
      loading: el('loading'),
      lobby: el('lobby'),
      hud: el('hud'),
      help: el('help'),
      shop: el('shop'),
      death: el('death'),
      results: el('results'),
    };

    this.bindButtons();
    this.nameInput.value = profile.value.name;
    this.nameInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && this.current === 'lobby') {
        event.preventDefault();
        this.callbacks.onPlay();
      }
    });
    this.refreshStats();
    this.setMuteIcon(profile.value.muted);
  }

  // ------------------------------------------------------------------ setup

  /** Item previews are extracted from the baked PixiJS textures. */
  setItemPreviews(previews: Map<InnerItemId, HTMLCanvasElement>): void {
    this.itemPreviews = previews;
    this.renderCosmetics();
  }

  private bindButtons(): void {
    const click = (id: string, handler: () => void) => {
      const node = el<HTMLButtonElement>(id);
      node.addEventListener('click', () => {
        sfx.unlock();
        sfx.click();
        handler();
      });
      node.addEventListener('pointerenter', () => sfx.hover());
    };

    click('playBtn', () => this.callbacks.onPlay());
    click('boostStartBtn', () => this.callbacks.onStartBoost());
    click('shopBtn', () => this.show('shop'));
    click('shopCloseBtn', () => this.show('lobby'));
    click('helpBtn', () => this.show('help'));
    click('helpCloseBtn', () => this.show('lobby'));
    click('leaderboardBtn', () => {
      this.toast('🏆 CrazyGames Leaderboards active! Top scores submitted automatically.');
    });
    click('reviveBtn', () => this.callbacks.onRevive());
    click('deathPlayBtn', () => this.callbacks.onPlayAgain());
    click('deathLobbyBtn', () => this.callbacks.onLobby());
    click('resultPlayBtn', () => this.callbacks.onPlayAgain());
    click('resultLobbyBtn', () => this.callbacks.onLobby());
    click('muteBtn', () => {
      const muted = !profile.value.muted;
      profile.patch({ muted });
      sfx.setMuted(muted);
      this.setMuteIcon(muted);
    });

    // The boost button is held-to-fire rather than click, so it responds on
    // the very first touch-down instead of waiting for the tap to complete.
    const boostBtn = el<HTMLButtonElement>('boostBtn');
    boostBtn.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      this.callbacks.onBoostPressed();
    });
  }

  private setMuteIcon(muted: boolean): void {
    this.muteIcon.textContent = muted ? '✕' : '♫';
    el('muteBtn').setAttribute('aria-pressed', String(muted));
  }

  // ---------------------------------------------------------------- screens

  show(screen: ScreenName): void {
    this.current = screen;
    for (const [name, node] of Object.entries(this.screens)) {
      // The loading screen owns its own fade-out; never yank it around here.
      if (name === 'loading') continue;
      const visible = name === screen;
      node.classList.toggle('hidden', !visible);
      if (name === 'hud') node.setAttribute('aria-hidden', String(!visible));
    }
    if (screen === 'lobby') {
      this.refreshStats();
      this.renderCosmetics();
    }
  }

  get currentScreen(): ScreenName {
    return this.current;
  }

  hideLoading(): void {
    const node = this.screens.loading;
    node.classList.add('fading');
    window.setTimeout(() => node.classList.add('hidden'), 500);
  }

  // -------------------------------------------------------------- cosmetics

  get playerName(): string {
    return this.nameInput.value;
  }

  setPlayerName(name: string): void {
    this.nameInput.value = name;
  }

  private renderCosmetics(): void {
    this.colorRow.replaceChildren();
    for (const color of DROP_COLORS) {
      const owned = profile.ownsColor(color.id);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'swatch';
      button.style.setProperty('--swatch', hex(color.tint));
      button.title = owned ? color.name : `${color.name} - click to unlock`;
      button.setAttribute('aria-label', button.title);
      if (!owned) button.classList.add('locked');
      if (profile.value.colorId === color.id) button.classList.add('selected');
      button.addEventListener('click', () => {
        sfx.unlock();
        sfx.click();
        if (owned) {
          profile.patch({ colorId: color.id });
          this.renderCosmetics();
        } else {
          this.callbacks.onUnlockColor(color.id);
        }
      });
      this.colorRow.appendChild(button);
    }

    this.itemRow.replaceChildren();
    for (const item of INNER_ITEMS) {
      const owned = profile.ownsItem(item.id);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'swatch item';
      button.title = owned ? item.name : `${item.name} - click to unlock`;
      button.setAttribute('aria-label', button.title);
      if (!owned) button.classList.add('locked');
      if (profile.value.itemId === item.id) button.classList.add('selected');
      const preview = this.previewFor(item.id);
      if (preview) button.appendChild(preview);
      else button.textContent = '∅';
      button.addEventListener('click', () => {
        sfx.unlock();
        sfx.click();
        if (owned) {
          profile.patch({ itemId: item.id });
          this.renderCosmetics();
        } else {
          this.callbacks.onUnlockItem(item.id);
        }
      });
      this.itemRow.appendChild(button);
    }

    this.renderShop();
  }

  private previewFor(id: InnerItemId): HTMLCanvasElement | null {
    const source = this.itemPreviews.get(id);
    if (!source) return null;
    // Each swatch needs its own node, so clone the baked preview.
    const copy = document.createElement('canvas');
    copy.width = source.width;
    copy.height = source.height;
    copy.getContext('2d')?.drawImage(source, 0, 0);
    return copy;
  }

  private renderShop(): void {
    this.shopColors.replaceChildren();
    for (const color of DROP_COLORS) {
      const owned = profile.ownsColor(color.id);
      const card = this.makeCard(color.name, owned, () => {
        if (owned) {
          profile.patch({ colorId: color.id });
          this.renderCosmetics();
        } else {
          this.callbacks.onUnlockColor(color.id);
        }
      });
      const preview = document.createElement('div');
      preview.className = 'shop-preview';
      preview.style.setProperty('--swatch', hex(color.tint));
      card.prepend(preview);
      if (profile.value.colorId === color.id) card.classList.add('owned');
      this.shopColors.appendChild(card);
    }

    this.shopItems.replaceChildren();
    for (const item of INNER_ITEMS) {
      const owned = profile.ownsItem(item.id);
      const card = this.makeCard(item.name, owned, () => {
        if (owned) {
          profile.patch({ itemId: item.id });
          this.renderCosmetics();
        } else {
          this.callbacks.onUnlockItem(item.id);
        }
      });
      const preview = document.createElement('div');
      preview.className = 'shop-preview';
      preview.style.setProperty('--swatch', hex(findColor(profile.value.colorId).tint));
      const canvas = this.previewFor(item.id);
      if (canvas) preview.appendChild(canvas);
      card.prepend(preview);
      this.shopItems.appendChild(card);
    }
  }

  private makeCard(name: string, owned: boolean, onClick: () => void): HTMLElement {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `shop-card${owned ? ' owned' : ''}`;

    const label = document.createElement('span');
    label.className = 'shop-name';
    label.textContent = name;

    const tag = document.createElement('span');
    tag.className = 'shop-tag';
    tag.textContent = owned ? 'OWNED' : 'UNLOCK';

    card.append(label, tag);
    card.addEventListener('click', () => {
      sfx.unlock();
      sfx.click();
      onClick();
    });
    return card;
  }

  refreshStats(): void {
    el('bestMass').textContent = formatMass(profile.value.bestMass);
    el('bestRank').textContent = profile.value.bestRank > 0 ? `#${profile.value.bestRank}` : '-';
    el('gamesPlayed').textContent = String(profile.value.gamesPlayed);
  }

  // -------------------------------------------------------------------- HUD

  updateHud(mass: number, rank: number, timeLeft: number, boostCharge: number): void {
    this.hudMass.textContent = formatMass(mass);
    this.hudRank.textContent = `#${rank}`;
    this.hudTimer.textContent = formatTime(timeLeft);
    this.hudTimer.classList.toggle('urgent', timeLeft <= 30);
    this.boostFill.style.width = `${Math.round(boostCharge * 100)}%`;
    this.boostFill.classList.toggle('charging', boostCharge < 1);
  }

  setLeaderboard(rows: LeaderboardRow[]): void {
    this.renderBoard(this.leaderboard, rows);
  }

  private renderBoard(list: HTMLOListElement, rows: LeaderboardRow[]): void {
    list.replaceChildren();
    for (const row of rows) {
      const li = document.createElement('li');
      if (row.isPlayer) li.classList.add('me');

      const rank = document.createElement('span');
      rank.className = 'rank';
      rank.textContent = `${row.rank}.`;

      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = row.name;

      const mass = document.createElement('span');
      mass.className = 'mass';
      mass.textContent = formatMass(row.mass);

      li.append(rank, name, mass);
      list.appendChild(li);
    }
  }

  /** Names come from player input, so the feed is built as text nodes only. */
  addKill(killer: string, victim: string, byPlayer: boolean): void {
    const node = document.createElement('div');
    node.className = `kill${byPlayer ? ' self' : ''}`;

    const killerEl = document.createElement('strong');
    killerEl.textContent = killer;
    const victimEl = document.createElement('strong');
    victimEl.textContent = victim;

    node.append(killerEl, document.createTextNode(' absorbed '), victimEl);
    this.killfeed.appendChild(node);
    while (this.killfeed.childElementCount > 4) this.killfeed.firstElementChild?.remove();
    window.setTimeout(() => node.remove(), 3600);
  }

  clearKillfeed(): void {
    this.killfeed.replaceChildren();
  }

  // ------------------------------------------------------------ end screens

  showDeath(killer: string, mass: number, rank: number, revivesLeft: number): void {
    this.killerName.textContent = killer;
    this.deathMass.textContent = formatMass(mass);
    this.deathRank.textContent = `#${rank}`;
    this.reviveEnabled = revivesLeft > 0;
    this.reviveBtn.disabled = !this.reviveEnabled;
    this.reviveSub.textContent = this.reviveEnabled
      ? `Revive with 50% of your mass (${revivesLeft} left)`
      : 'Already used this round';
    this.show('death');
  }

  showResults(rank: number, rows: LeaderboardRow[]): void {
    this.resultRank.textContent = `#${rank}`;
    this.renderBoard(this.resultBoard, rows);
    this.show('results');
  }

  // -------------------------------------------------------------------- ads

  get adHost(): AdHost {
    return {
      show: (label, seconds) => {
        this.adTitle.textContent = label;
        this.adFill.style.width = '0%';
        this.adOverlay.classList.remove('hidden');
        this.adOverlay.dataset.duration = String(seconds);
      },
      tick: (secondsLeft) => {
        const total = Number(this.adOverlay.dataset.duration ?? 1);
        const progress = total > 0 ? 1 - secondsLeft / total : 1;
        this.adFill.style.width = `${Math.round(progress * 100)}%`;
      },
      hide: () => {
        this.adOverlay.classList.add('hidden');
      },
    };
  }

  /** Locks the ad-triggering buttons while a request is in flight. */
  setAdBusy(busy: boolean): void {
    el<HTMLButtonElement>('boostStartBtn').disabled = busy;
    el<HTMLButtonElement>('playBtn').disabled = busy;
    // Revive stays disabled once the round's revive has been spent.
    this.reviveBtn.disabled = busy || !this.reviveEnabled;
  }

  toast(message: string): void {
    this.toastEl.textContent = message;
    this.toastEl.classList.add('show');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), 2400);
  }
}

function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

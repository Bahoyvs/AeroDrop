import { DROP_COLORS, INNER_ITEMS, type InnerItemId } from './game/cosmetics';

const KEY = 'aerodrop.profile.v1';

export interface Profile {
  name: string;
  colorId: string;
  itemId: InnerItemId;
  unlockedColors: string[];
  unlockedItems: string[];
  bestMass: number;
  bestRank: number;
  gamesPlayed: number;
  muted: boolean;
}

function defaults(): Profile {
  return {
    name: '',
    colorId: 'aqua',
    itemId: 'star',
    unlockedColors: DROP_COLORS.filter((c) => !c.locked).map((c) => c.id),
    unlockedItems: INNER_ITEMS.filter((i) => !i.locked).map((i) => i.id),
    bestMass: 0,
    bestRank: 0,
    gamesPlayed: 0,
    muted: false,
  };
}

/**
 * localStorage is best-effort: private-browsing modes and some embedded
 * portal frames throw on access, and a broken save must never break the game.
 */
function readRaw(): Partial<Profile> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Partial<Profile>) : {};
  } catch {
    return {};
  }
}

export class ProfileStore {
  private data: Profile;

  constructor() {
    const base = defaults();
    const saved = readRaw();
    this.data = { ...base, ...saved };
    // Free cosmetics are always owned, even if an older save predates them.
    const freeColors = DROP_COLORS.filter((c) => !c.locked).map((c) => c.id);
    const freeItems = INNER_ITEMS.filter((i) => !i.locked).map((i) => i.id);
    this.data.unlockedColors = unique([...(saved.unlockedColors ?? []), ...freeColors]);
    this.data.unlockedItems = unique([...(saved.unlockedItems ?? []), ...freeItems]);
    if (!this.ownsColor(this.data.colorId)) this.data.colorId = base.colorId;
    if (!this.ownsItem(this.data.itemId)) this.data.itemId = 'star';
  }

  get value(): Readonly<Profile> {
    return this.data;
  }

  ownsColor(id: string): boolean {
    return this.data.unlockedColors.includes(id);
  }

  ownsItem(id: string): boolean {
    return this.data.unlockedItems.includes(id);
  }

  patch(patch: Partial<Profile>): void {
    this.data = { ...this.data, ...patch };
    this.flush();
  }

  unlockColor(id: string): void {
    if (this.ownsColor(id)) return;
    this.data.unlockedColors.push(id);
    this.flush();
  }

  unlockItem(id: string): void {
    if (this.ownsItem(id)) return;
    this.data.unlockedItems.push(id);
    this.flush();
  }

  recordRun(mass: number, rank: number): void {
    this.data.gamesPlayed += 1;
    this.data.bestMass = Math.max(this.data.bestMass, Math.floor(mass));
    this.data.bestRank =
      this.data.bestRank === 0 ? rank : Math.min(this.data.bestRank, rank);
    this.flush();
  }

  private flush(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* storage unavailable - run in-memory only */
    }
  }
}

function unique(list: string[]): string[] {
  return Array.from(new Set(list));
}

export const profile = new ProfileStore();

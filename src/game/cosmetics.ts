/**
 * Cosmetic catalogue. Colours drive the drop tint, inner items are the little
 * retro icon suspended in the middle of the drop. Locked entries are opened
 * with a rewarded ad from the shop.
 */

export interface DropColor {
  id: string;
  name: string;
  /** Main body tint. */
  tint: number;
  /** Rim / specular accent, used by the crisp overlay pass. */
  accent: number;
  locked: boolean;
}

export type InnerItemId =
  | 'none'
  | 'star'
  | 'bubble'
  | 'smiley'
  | 'floppy'
  | 'radioactive'
  | 'yinyang'
  | 'disc'
  | 'bolt'
  | 'heart';

export interface InnerItem {
  id: InnerItemId;
  name: string;
  locked: boolean;
}

/**
 * Frutiger Aero colour rules: nothing muddy, nothing dark. Every tint is a
 * high-key, high-saturation candy colour that would sit happily on a Vista
 * wallpaper, and every accent is close to white so the specular pass blows out.
 */
export const DROP_COLORS: DropColor[] = [
  { id: 'aqua', name: 'Aqua Blue', tint: 0x00b4ff, accent: 0xe0f7ff, locked: false },
  { id: 'mint', name: 'Mint Fresh', tint: 0x00e68a, accent: 0xe0fff2, locked: false },
  { id: 'ice', name: 'Ice Cyan', tint: 0x54e4ff, accent: 0xffffff, locked: false },
  { id: 'sky', name: 'Sky Glass', tint: 0x6e85ff, accent: 0xebf0ff, locked: false },
  { id: 'neon', name: 'Neon Pink', tint: 0xff4da6, accent: 0xffe6f4, locked: true },
  { id: 'toxic', name: 'Toxic Green', tint: 0xa2ff14, accent: 0xf1ffd8, locked: true },
  { id: 'mercury', name: 'Mercury Silver', tint: 0xd0e0f0, accent: 0xffffff, locked: true },
  { id: 'sunburst', name: 'Sunburst Gold', tint: 0xffa000, accent: 0xfff0d4, locked: true },
  { id: 'violet', name: 'Deep Violet', tint: 0xa052ff, accent: 0xefe2ff, locked: true },
  { id: 'ember', name: 'Ember Red', tint: 0xff4d36, accent: 0xffe0d9, locked: true },
];

export const INNER_ITEMS: InnerItem[] = [
  { id: 'none', name: 'Empty Core', locked: false },
  { id: 'star', name: 'Shiny Star', locked: false },
  { id: 'bubble', name: 'Air Pocket', locked: false },
  { id: 'smiley', name: 'Happy Face', locked: false },
  { id: 'floppy', name: 'Floppy Disk', locked: true },
  { id: 'radioactive', name: 'Radioactive', locked: true },
  { id: 'yinyang', name: 'Yin-Yang', locked: true },
  { id: 'disc', name: 'Burned CD', locked: true },
  { id: 'bolt', name: 'Lightning', locked: true },
  { id: 'heart', name: 'Pixel Heart', locked: true },
];

export function findColor(id: string): DropColor {
  return DROP_COLORS.find((c) => c.id === id) ?? DROP_COLORS[0]!;
}

export function findItem(id: string): InnerItem {
  return INNER_ITEMS.find((i) => i.id === id) ?? INNER_ITEMS[0]!;
}

/** Palette bots pull from - free colours only, so the player's picks stay special. */
export const BOT_COLOR_IDS = ['aqua', 'mint', 'ice', 'sky', 'neon', 'toxic', 'sunburst', 'violet'];

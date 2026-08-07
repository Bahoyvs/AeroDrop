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

export const DROP_COLORS: DropColor[] = [
  { id: 'aqua', name: 'Aqua Blue', tint: 0x38b6ff, accent: 0xd6f4ff, locked: false },
  { id: 'mint', name: 'Mint Fresh', tint: 0x4fe3b0, accent: 0xdcfff2, locked: false },
  { id: 'ice', name: 'Ice Cyan', tint: 0x7fe9ff, accent: 0xeafcff, locked: false },
  { id: 'sky', name: 'Sky Glass', tint: 0x6f8cff, accent: 0xdfe6ff, locked: false },
  { id: 'neon', name: 'Neon Pink', tint: 0xff5fb4, accent: 0xffdcef, locked: true },
  { id: 'toxic', name: 'Toxic Green', tint: 0xa6ff3d, accent: 0xecffcd, locked: true },
  { id: 'mercury', name: 'Mercury Grey', tint: 0xb9c6d4, accent: 0xffffff, locked: true },
  { id: 'sunburst', name: 'Sunburst', tint: 0xffa227, accent: 0xffe9c4, locked: true },
  { id: 'violet', name: 'Deep Violet', tint: 0x9d5cff, accent: 0xe8d7ff, locked: true },
  { id: 'ember', name: 'Ember Red', tint: 0xff5340, accent: 0xffd7cf, locked: true },
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

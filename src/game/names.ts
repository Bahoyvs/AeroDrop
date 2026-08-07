import { rng } from '../core/rng';

/**
 * Bots are named like people were naming themselves in 2004 - the illusion of
 * a real lobby is most of what sells the fake multiplayer.
 */
const PREFIX = [
  'Cool', 'Aero', 'Glacier', 'Xx_', 'Dark', 'Neo', 'Cyber', 'Aqua', 'Turbo', 'Mega',
  'Frost', 'Hyper', 'Blue', 'Pixel', 'Sonic', 'Laser', 'Vista', 'Crystal', 'Storm',
  'Nano', 'Retro', 'Ultra', 'Silver', 'Neon', 'Chrome', 'Zero', 'Delta', 'Vapor',
];

const CORE = [
  'Boy', 'Master', 'Girl', 'Wolf', 'Rider', 'Hunter', 'Drop', 'Wave', 'Storm',
  'Blade', 'Ninja', 'Ghost', 'Angel', 'Dragon', 'Racer', 'Surfer', 'Pilot', 'Sniper',
  'Knight', 'Punk', 'Tide', 'Flow', 'Spark', 'Byte', 'Core', 'Splash',
];

const SUFFIX = ['', '', '', '99', '_12', '2000', 'X', '_XD', '07', '_TR', '1337', 'z', '_01', '88'];

const HANDPICKED = [
  'CoolBoy99', 'AeroMaster', 'Glacier_12', 'xX_Aqua_Xx', 'MSN_Legend', 'WinampFan',
  'DialUpKid', 'BubbleTea', 'H2O_Prime', 'FrutigerFan', 'Y2K_Survivor', 'CD_Burner',
  'ClippyLives', 'BlueScreen', 'Napster01',
];

/** Returns `count` unique names, seeded with a few hand-written classics. */
export function makeBotNames(count: number): string[] {
  const used = new Set<string>();
  const out: string[] = [];

  const classics = [...HANDPICKED].sort(() => rng.next() - 0.5);
  for (const name of classics) {
    if (out.length >= Math.min(count, 6)) break;
    used.add(name);
    out.push(name);
  }

  let guard = 0;
  while (out.length < count && guard++ < count * 40) {
    const name = `${rng.pick(PREFIX)}${rng.pick(CORE)}${rng.pick(SUFFIX)}`;
    if (used.has(name)) continue;
    used.add(name);
    out.push(name);
  }
  while (out.length < count) out.push(`Guest${1000 + out.length}`);
  return out;
}

/** Trims and sanitises a player-entered name. */
export function sanitizeName(raw: string): string {
  const cleaned = raw
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028\u2029\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 14);
  return cleaned.length > 0 ? cleaned : 'Anonymous';
}

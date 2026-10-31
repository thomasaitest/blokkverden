/**
 * Procedural 16×16 pixel-art icons for tools, weapons and armor (original art, no Mojang assets).
 * Before it14 every tool of a tier shared one atlas tile, so a pickaxe looked exactly like a sword
 * or an axe, and iron/diamond tools were a plain grey square / gem.
 * Legend: H = head (tier colour), h = head shade, S = stick, s = stick shade, D = dark detail, F = feather.
 */
import { ITEMS } from '../items/types';

type RGB = [number, number, number];
const TIER: Record<string, [RGB, RGB]> = {
  wood: [[176, 132, 70], [128, 92, 44]],
  stone: [[146, 146, 150], [96, 96, 102]],
  iron: [[226, 226, 232], [160, 160, 172]],
  diamond: [[92, 232, 236], [36, 160, 170]],
  leather: [[150, 96, 52], [104, 64, 32]],
  string: [[238, 238, 240], [176, 176, 186]],
  gunpowder: [[104, 104, 108], [58, 58, 64]],
  rotten: [[150, 104, 70], [96, 128, 62]],
};
const STICK: [RGB, RGB] = [[132, 90, 42], [86, 56, 24]];

const P = {
  pickaxe: [
    '................',
    '....hHHHHHHh....',
    '..hHHHHHHHHHHh..',
    '.hHHh..Ss..hHHh.',
    '.Hh....Ss....hH.',
    '.H.....Ss.....H.',
    '.......Ss.......',
    '.......Ss.......',
    '.......Ss.......',
    '.......Ss.......',
    '.......Ss.......',
    '.......Ss.......',
    '.......Ss.......',
    '.......Ss.......',
    '.......sD.......',
    '................',
  ],
  axe: [
    '................',
    '....hHH.........',
    '...hHHHHSs......',
    '..hHHHHHSs......',
    '..HHHHHHSs......',
    '..hHHHHHSs......',
    '...hHHh.Ss......',
    '........Ss......',
    '........Ss......',
    '........Ss......',
    '........Ss......',
    '........Ss......',
    '........Ss......',
    '........Ss......',
    '........sD......',
    '................',
  ],
  shovel: [
    '................',
    '......hHHh......',
    '.....hHHHHh.....',
    '.....HHHHHH.....',
    '.....HHHHHH.....',
    '.....hHHHHh.....',
    '......hSsh......',
    '.......Ss.......',
    '.......Ss.......',
    '.......Ss.......',
    '.......Ss.......',
    '.......Ss.......',
    '......DSsD......',
    '......DSsD......',
    '.......DD.......',
    '................',
  ],
  sword: [
    '.......hh.......',
    '......hHHh......',
    '......HHHh......',
    '......HHHh......',
    '......HHHh......',
    '......HHHh......',
    '......HHHh......',
    '......HHHh......',
    '......HHHh......',
    '......HHHh......',
    '...DDDDDDDDDD...',
    '...DDDDDDDDDD...',
    '.......Ss.......',
    '.......Ss.......',
    '......DSsD......',
    '.......DD.......',
  ],
  hoe: [
    '................',
    '..hHHHHHSs......',
    '..HHHHHHSs......',
    '..hh....Ss......',
    '........Ss......',
    '........Ss......',
    '........Ss......',
    '........Ss......',
    '........Ss......',
    '........Ss......',
    '........Ss......',
    '........Ss......',
    '........Ss......',
    '........Ss......',
    '........sD......',
    '................',
  ],
  arrow: [
    '................',
    '..........hHHh..',
    '...........HHh..',
    '..........SHHh..',
    '.........Ss.hh..',
    '........Ss......',
    '.......Ss.......',
    '......Ss........',
    '.....Ss.........',
    '....Ss..........',
    '..FSs...........',
    '.FFS............',
    '.FF.F...........',
    '..F.............',
    '................',
    '................',
  ],
  // it22: shears — two iron blades crossing at the pivot, dark handle loops lower-left
  shears: [
    '................',
    '...........Hh...',
    '..........HHh...',
    '.........HHh....',
    '........HHh.....',
    '...Hh..HHh......',
    '...HHhHHh.......',
    '....HHHh........',
    '.....hHh........',
    '....DDhHH.......',
    '...D..D.HHh.....',
    '...D..D..Hh.....',
    '..DDDD..........',
    '.D..D...........',
    '.D..D...........',
    '..DD............',
  ],
  // it23: buckets — iron pail; W/w = liquid inside (water or lava colours)
  bucket: [
    '................',
    '................',
    '................',
    '..hHHHHHHHHHHh..',
    '.hHDDDDDDDDDDHh.',
    '.hHDDDDDDDDDDHh.',
    '..hHDDDDDDDDHh..',
    '..hHHDDDDDDHHh..',
    '...hHHHHHHHHh...',
    '...hHHHHHHHHh...',
    '....hHHHHHHh....',
    '....hhHHHHhh....',
    '.....hhhhhh.....',
    '................',
    '................',
    '................',
  ],
  bucketFull: [
    '................',
    '................',
    '................',
    '..hHHHHHHHHHHh..',
    '.hHwwwwwwwwwwHh.',
    '.hHWWWWWWWWWWHh.',
    '..hHWWWWWWWWHh..',
    '..hHHWWWWWWHHh..',
    '...hHHHHHHHHh...',
    '...hHHHHHHHHh...',
    '....hHHHHHHh....',
    '....hhHHHHhh....',
    '.....hhhhhh.....',
    '................',
    '................',
    '................',
  ],
  bow: [
    '................',
    '.....SSs......D.',
    '.......SSs...D..',
    '.........Ss.D...',
    '..........SD....',
    '..........DS....',
    '.........D.Ss...',
    '........D..Ss...',
    '.......D...Ss...',
    '......D...Ss....',
    '.....D...Ss.....',
    '....D...Ss......',
    '...D..Ss........',
    '..DSSss.........',
    '.D..............',
    '................',
  ],
  head: [
    '................',
    '................',
    '................',
    '....hHHHHHHh....',
    '...hHHHHHHHHh...',
    '...HHHHHHHHHH...',
    '...HHhhhhhhHH...',
    '...HH......HH...',
    '...HH......HH...',
    '...hh......hh...',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ],
  string: [
    '................',
    '..........hH....',
    '.........H..h...',
    '........h...H...',
    '.......H...h....',
    '......h..hH.....',
    '......HhH.......',
    '.....h..........',
    '....H...........',
    '...h....hHh.....',
    '...H...H...h....',
    '....hHh.....H...',
    '............h...',
    '...........H....',
    '................',
    '................',
  ],
  gunpowder: [
    '................',
    '................',
    '................',
    '.......h........',
    '......hHh..h....',
    '....h.HHH.......',
    '.....hHHHHh.....',
    '....hHHHHHHh....',
    '...hHHHhHHHHh...',
    '...HHHHHHHHHH...',
    '..hHHHHHHHHHHh..',
    '..hhhhhhhhhhhh..',
    '................',
    '................',
    '................',
    '................',
  ],
  rotten: [
    '................',
    '................',
    '.......hHH......',
    '.....hHHhHH.....',
    '....HHhHHHhH....',
    '...hHHHHhHHH....',
    '...HhHHHHHhHh...',
    '...HHHhHHHHHH...',
    '....HHHHhHHH....',
    '....hHHHHHh.....',
    '.....DSSh.......',
    '....DSS.........',
    '...DSs..........',
    '...Ds...........',
    '................',
    '................',
  ],
  chest: [
    '................',
    '..hHHh....hHHh..',
    '.hHHHHhhhhHHHHh.',
    '.HHHHHHHHHHHHHH.',
    '.hHHHHHHHHHHHHh.',
    '..hHHHHHHHHHHh..',
    '...HHHHHHHHHH...',
    '...HHHHHHHHHH...',
    '...HHHHHHHHHH...',
    '...HHHHHHHHHH...',
    '...HHHHHHHHHH...',
    '...hHHHHHHHHh...',
    '...hhhhhhhhhh...',
    '................',
    '................',
    '................',
  ],
  legs: [
    '................',
    '....hHHHHHHh....',
    '....HHHHHHHH....',
    '....HHHHHHHH....',
    '....HHHhhHHH....',
    '....HHH..HHH....',
    '....HHH..HHH....',
    '....HHH..HHH....',
    '....HHH..HHH....',
    '....HHH..HHH....',
    '....HHH..HHH....',
    '....hhh..hhh....',
    '................',
    '................',
    '................',
    '................',
  ],
  feet: [
    '................',
    '................',
    '................',
    '................',
    '................',
    '...hHH....HHh...',
    '...HHH....HHH...',
    '...HHH....HHH...',
    '...HHH....HHH...',
    '..hHHH....HHHh..',
    '.hHHHH....HHHHh.',
    '.hhhhh....hhhhh.',
    '................',
    '................',
    '................',
    '................',
  ],
} as const;

/** Pattern + colours for an item, or null when the atlas tile should be used. */
export function itemPattern(itemId: number): { rows: readonly string[]; head: [RGB, RGB]; liquid?: [RGB, RGB] } | null {
  const def = ITEMS[itemId];
  if (!def) return null;
  if (def.tool && def.tool !== 'none' && def.tool !== 'bow' && def.tier) {
    return { rows: P[def.tool as 'pickaxe' | 'axe' | 'shovel' | 'sword' | 'hoe'], head: TIER[def.tier] };
  }
  if (def.tool === 'bow') return { rows: P.bow, head: TIER.iron };
  if (def.tool === 'shears') return { rows: P.shears, head: TIER.iron };
  if (itemId === 87) return { rows: P.bucket, head: TIER.iron };
  if (itemId === 88) return { rows: P.bucketFull, head: TIER.iron, liquid: [[52, 96, 220], [92, 140, 240]] };
  if (itemId === 89) return { rows: P.bucketFull, head: TIER.iron, liquid: [[236, 110, 20], [255, 190, 60]] };
  if (itemId === 61) return { rows: P.arrow, head: TIER.stone };
  if (itemId === 73) return { rows: P.string, head: TIER.string };
  if (itemId === 74) return { rows: P.gunpowder, head: TIER.gunpowder };
  if (itemId === 75) return { rows: P.rotten, head: TIER.rotten };
  if (def.armorSlot) {
    const mat = def.name.startsWith('Lær') ? 'leather' : def.name.startsWith('Jern') ? 'iron' : 'diamond';
    return { rows: P[def.armorSlot], head: TIER[mat] };
  }
  return null;
}

const cache = new Map<number, HTMLCanvasElement | null>();

/** 16×16 canvas with the procedural icon, or null. */
export function proceduralIcon(itemId: number): HTMLCanvasElement | null {
  if (cache.has(itemId)) return cache.get(itemId)!;
  const pat = itemPattern(itemId);
  if (!pat || typeof document === 'undefined') { cache.set(itemId, null); return null; }
  const c = document.createElement('canvas');
  c.width = 16; c.height = 16;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(16, 16);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const ch = pat.rows[y][x];
    let col: RGB | null = null;
    if (ch === 'H') col = pat.head[0];
    else if (ch === 'h') col = pat.head[1];
    else if (ch === 'S') col = STICK[0];
    else if (ch === 's') col = STICK[1];
    else if (ch === 'D') col = [52, 40, 30];
    else if (ch === 'F') col = [236, 236, 236];
    else if (ch === 'W') col = pat.liquid?.[0] ?? [52, 40, 30];
    else if (ch === 'w') col = pat.liquid?.[1] ?? [52, 40, 30];
    if (!col) continue;
    const i = (y * 16 + x) * 4;
    img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  cache.set(itemId, c);
  return c;
}

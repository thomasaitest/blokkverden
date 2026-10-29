/** Block IDs — original Blokkverden set. */
export const BlockId = {
  Air: 0,
  Grass: 1,
  Dirt: 2,
  Stone: 3,
  Cobble: 4,
  Log: 5,
  Planks: 6,
  Leaves: 7,
  Sand: 8,
  Glass: 9,
  Water: 10,
  CraftingTable: 11,
  Torch: 12,
  Chest: 13,
  Furnace: 14,
  CoalOre: 15,
  IronOre: 16,
  GoldOre: 17,
  DiamondOre: 18,
  SnowGrass: 19,
  Bed: 20,
  Wool: 21,
  Farmland: 22,
  Crop: 23,
  EnchantTable: 24,
  MobSpawner: 25,
  Door: 26, Trapdoor: 27, Fence: 28, Gate: 29,
  Stairs: 30, Slab: 31, GlassPane: 32, Ladder: 33, Sign: 34,
  RedDust: 35, Lever: 36, Button: 37, Lamp: 38, PressurePlate: 39,
  Helstein: 40, Sjelegrus: 41, Portal: 42, PortalFrame: 43,
} as const;

export type BlockId = (typeof BlockId)[keyof typeof BlockId];

export interface BlockDef {
  id: BlockId;
  name: string;
  solid: boolean;
  opaque: boolean;
  transparent: boolean;
  liquid: boolean;
  breakTime: number;
  lightEmit?: number;
  /** If set, mesh as partial height 0–1 (water uses waterLevel) */
  tiles: { top: number; bottom: number; side: number };
}

const B = (
  id: number, name: string, solid: boolean, opaque: boolean, transparent: boolean,
  liquid: boolean, breakTime: number, tiles: BlockDef['tiles'], lightEmit?: number,
): BlockDef => ({ id: id as BlockId, name, solid, opaque, transparent, liquid, breakTime, tiles, lightEmit });

export const BLOCKS: Record<number, BlockDef> = {
  [0]: B(0, 'Luft', false, false, true, false, 0, { top: 0, bottom: 0, side: 0 }),
  [1]: B(1, 'Gress', true, true, false, false, 0.6, { top: 0, bottom: 1, side: 2 }),
  [2]: B(2, 'Jord', true, true, false, false, 0.5, { top: 1, bottom: 1, side: 1 }),
  [3]: B(3, 'Stein', true, true, false, false, 1.5, { top: 3, bottom: 3, side: 3 }),
  [4]: B(4, 'Brostein', true, true, false, false, 1.5, { top: 4, bottom: 4, side: 4 }),
  [5]: B(5, 'Tømmer', true, true, false, false, 1.0, { top: 5, bottom: 5, side: 6 }),
  [6]: B(6, 'Planker', true, true, false, false, 0.8, { top: 7, bottom: 7, side: 7 }),
  [7]: B(7, 'Løv', true, false, true, false, 0.3, { top: 8, bottom: 8, side: 8 }),
  [8]: B(8, 'Sand', true, true, false, false, 0.5, { top: 9, bottom: 9, side: 9 }),
  [9]: B(9, 'Glass', true, false, true, false, 0.4, { top: 10, bottom: 10, side: 10 }),
  [10]: B(10, 'Vann', false, false, true, true, 0, { top: 11, bottom: 11, side: 11 }),
  [11]: B(11, 'Arbeidsbenk', true, true, false, false, 0.8, { top: 12, bottom: 7, side: 12 }),
  [12]: B(12, 'Fakkel', false, false, true, false, 0.05, { top: 16, bottom: 16, side: 16 }, 14),
  [13]: B(13, 'Kiste', true, true, false, false, 1.0, { top: 17, bottom: 17, side: 17 }),
  [14]: B(14, 'Ovn', true, true, false, false, 1.5, { top: 31, bottom: 3, side: 18 }),
  [15]: B(15, 'Kullmalm', true, true, false, false, 1.8, { top: 20, bottom: 20, side: 20 }),
  [16]: B(16, 'Jernmalm', true, true, false, false, 2.0, { top: 21, bottom: 21, side: 21 }),
  [17]: B(17, 'Gullmalm', true, true, false, false, 2.0, { top: 22, bottom: 22, side: 22 }),
  [18]: B(18, 'Diamantmalm', true, true, false, false, 2.5, { top: 23, bottom: 23, side: 23 }),
  [19]: B(19, 'Snøgress', true, true, false, false, 0.6, { top: 24, bottom: 1, side: 25 }),
  [20]: B(20, 'Seng', true, false, true, false, 0.4, { top: 32, bottom: 7, side: 32 }),
  [21]: B(21, 'Ull', true, true, false, false, 0.4, { top: 33, bottom: 33, side: 33 }),
  [22]: B(22, 'Åkerjord', true, true, false, false, 0.5, { top: 36, bottom: 1, side: 36 }),
  [23]: B(23, 'Avling', false, false, true, false, 0.05, { top: 37, bottom: 37, side: 37 }),
  [24]: B(24, 'Fortryllelsesbord', true, true, false, false, 2.0, { top: 39, bottom: 3, side: 39 }),
  [25]: B(25, 'Fremkaller', true, true, false, false, 3.0, { top: 46, bottom: 46, side: 46 }),
  [26]: B(26, 'Dør', true, false, true, false, 0.8, { top: 7, bottom: 7, side: 52 }),
  [27]: B(27, 'Falldør', true, false, true, false, 0.6, { top: 7, bottom: 7, side: 52 }),
  [28]: B(28, 'Gjerde', true, false, true, false, 0.5, { top: 7, bottom: 7, side: 53 }),
  [29]: B(29, 'Grind', true, false, true, false, 0.5, { top: 7, bottom: 7, side: 53 }),
  [30]: B(30, 'Trapp', true, true, false, false, 0.8, { top: 7, bottom: 7, side: 7 }),
  [31]: B(31, 'Plate', true, true, false, false, 0.6, { top: 7, bottom: 7, side: 7 }),
  [32]: B(32, 'Glassrute', true, false, true, false, 0.3, { top: 10, bottom: 10, side: 10 }),
  [33]: B(33, 'Stige', false, false, true, false, 0.3, { top: 54, bottom: 54, side: 54 }),
  [34]: B(34, 'Skilt', false, false, true, false, 0.3, { top: 55, bottom: 55, side: 55 }),
  [35]: B(35, 'Rødtråd', false, false, true, false, 0.05, { top: 56, bottom: 56, side: 56 }),
  [36]: B(36, 'Spak', false, false, true, false, 0.3, { top: 57, bottom: 57, side: 57 }),
  [37]: B(37, 'Knapp', false, false, true, false, 0.3, { top: 57, bottom: 57, side: 57 }),
  [38]: B(38, 'Lampe', true, false, true, false, 0.4, { top: 58, bottom: 58, side: 58 }, 15),
  [39]: B(39, 'Trykkplate', false, false, true, false, 0.3, { top: 59, bottom: 59, side: 59 }),
  [40]: B(40, 'Helstein', true, true, false, false, 1.2, { top: 60, bottom: 60, side: 60 }),
  [41]: B(41, 'Sjelegrus', true, true, false, false, 0.5, { top: 61, bottom: 61, side: 61 }),
  [42]: B(42, 'Portal', false, false, true, false, 0, { top: 62, bottom: 62, side: 62 }, 11),
  [43]: B(43, 'Portalramme', true, true, false, false, 2.5, { top: 63, bottom: 63, side: 63 }),

};

export function isSolid(id: number): boolean { return BLOCKS[id]?.solid ?? false; }
export function isOpaque(id: number): boolean { return BLOCKS[id]?.opaque ?? false; }
export function isTransparent(id: number): boolean { return BLOCKS[id]?.transparent ?? true; }
export function lightEmission(id: number): number { return BLOCKS[id]?.lightEmit ?? 0; }

/** Non-full collision: returns true if AABB overlaps solid part of block. */
export function collidesBlock(
  id: number, bx: number, by: number, bz: number,
  minX: number, minY: number, maxX: number, maxY: number, minZ: number, maxZ: number,
  meta = 0,
): boolean {
  if (id === 0 || id === BlockId.Water || id === BlockId.Torch || id === BlockId.Crop || id === BlockId.RedDust || id === BlockId.Ladder || id === BlockId.Sign || id === BlockId.Portal) return false;
  if (id === BlockId.PressurePlate || id === BlockId.Button || id === BlockId.Lever) return false;
  // open door/gate/trapdoor: meta bit0 = open
  if ((id === BlockId.Door || id === BlockId.Gate || id === BlockId.Trapdoor) && (meta & 1)) return false;
  if (id === BlockId.Slab) {
    // bottom slab y in [0,0.5]
    return maxY > by && minY < by + 0.5 && maxX > bx && minX < bx + 1 && maxZ > bz && minZ < bz + 1;
  }
  if (id === BlockId.Fence || id === BlockId.GlassPane) {
    // thin cross centered
    const cx0 = bx + 0.375, cx1 = bx + 0.625, cz0 = bz + 0.375, cz1 = bz + 0.625;
    return maxX > cx0 && minX < cx1 && maxZ > cz0 && minZ < cz1 && maxY > by && minY < by + 1.5;
  }
  if (id === BlockId.Stairs) {
    // rough: full block (acceptable) or bottom half + step
    return maxY > by && minY < by + 1 && maxX > bx && minX < bx + 1 && maxZ > bz && minZ < bz + 1;
  }
  const def = BLOCKS[id];
  return !!(def?.solid);
}

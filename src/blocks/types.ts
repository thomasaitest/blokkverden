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
};

export function isSolid(id: number): boolean { return BLOCKS[id]?.solid ?? false; }
export function isOpaque(id: number): boolean { return BLOCKS[id]?.opaque ?? false; }
export function isTransparent(id: number): boolean { return BLOCKS[id]?.transparent ?? true; }
export function lightEmission(id: number): number { return BLOCKS[id]?.lightEmit ?? 0; }

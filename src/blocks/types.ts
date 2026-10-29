/** Block IDs — original Blokkverden set (not Mojang assets). */
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
  tiles: { top: number; bottom: number; side: number };
}

export const BLOCKS: Record<number, BlockDef> = {
  [BlockId.Air]: {
    id: BlockId.Air, name: 'Luft', solid: false, opaque: false, transparent: true, liquid: false,
    breakTime: 0, tiles: { top: 0, bottom: 0, side: 0 },
  },
  [BlockId.Grass]: {
    id: BlockId.Grass, name: 'Gress', solid: true, opaque: true, transparent: false, liquid: false,
    breakTime: 0.6, tiles: { top: 0, bottom: 1, side: 2 },
  },
  [BlockId.Dirt]: {
    id: BlockId.Dirt, name: 'Jord', solid: true, opaque: true, transparent: false, liquid: false,
    breakTime: 0.5, tiles: { top: 1, bottom: 1, side: 1 },
  },
  [BlockId.Stone]: {
    id: BlockId.Stone, name: 'Stein', solid: true, opaque: true, transparent: false, liquid: false,
    breakTime: 1.5, tiles: { top: 3, bottom: 3, side: 3 },
  },
  [BlockId.Cobble]: {
    id: BlockId.Cobble, name: 'Brostein', solid: true, opaque: true, transparent: false, liquid: false,
    breakTime: 1.5, tiles: { top: 4, bottom: 4, side: 4 },
  },
  [BlockId.Log]: {
    id: BlockId.Log, name: 'Tømmer', solid: true, opaque: true, transparent: false, liquid: false,
    breakTime: 1.0, tiles: { top: 5, bottom: 5, side: 6 },
  },
  [BlockId.Planks]: {
    id: BlockId.Planks, name: 'Planker', solid: true, opaque: true, transparent: false, liquid: false,
    breakTime: 0.8, tiles: { top: 7, bottom: 7, side: 7 },
  },
  [BlockId.Leaves]: {
    id: BlockId.Leaves, name: 'Løv', solid: true, opaque: false, transparent: true, liquid: false,
    breakTime: 0.3, tiles: { top: 8, bottom: 8, side: 8 },
  },
  [BlockId.Sand]: {
    id: BlockId.Sand, name: 'Sand', solid: true, opaque: true, transparent: false, liquid: false,
    breakTime: 0.5, tiles: { top: 9, bottom: 9, side: 9 },
  },
  [BlockId.Glass]: {
    id: BlockId.Glass, name: 'Glass', solid: true, opaque: false, transparent: true, liquid: false,
    breakTime: 0.4, tiles: { top: 10, bottom: 10, side: 10 },
  },
  [BlockId.Water]: {
    id: BlockId.Water, name: 'Vann', solid: false, opaque: false, transparent: true, liquid: true,
    breakTime: 0, tiles: { top: 11, bottom: 11, side: 11 },
  },
  [BlockId.CraftingTable]: {
    id: BlockId.CraftingTable, name: 'Arbeidsbenk', solid: true, opaque: true, transparent: false, liquid: false,
    breakTime: 0.8, tiles: { top: 12, bottom: 7, side: 12 },
  },
};

export function isSolid(id: number): boolean {
  return BLOCKS[id]?.solid ?? false;
}

export function isOpaque(id: number): boolean {
  return BLOCKS[id]?.opaque ?? false;
}

export function isTransparent(id: number): boolean {
  return BLOCKS[id]?.transparent ?? true;
}

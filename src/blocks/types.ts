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
  tiles: { top: number; bottom: number; side: number };
}

export const BLOCKS: Record<number, BlockDef> = {
  [BlockId.Air]: { id: 0 as BlockId, name: 'Luft', solid: false, opaque: false, transparent: true, liquid: false, breakTime: 0, tiles: { top: 0, bottom: 0, side: 0 } },
  [BlockId.Grass]: { id: 1 as BlockId, name: 'Gress', solid: true, opaque: true, transparent: false, liquid: false, breakTime: 0.6, tiles: { top: 0, bottom: 1, side: 2 } },
  [BlockId.Dirt]: { id: 2 as BlockId, name: 'Jord', solid: true, opaque: true, transparent: false, liquid: false, breakTime: 0.5, tiles: { top: 1, bottom: 1, side: 1 } },
  [BlockId.Stone]: { id: 3 as BlockId, name: 'Stein', solid: true, opaque: true, transparent: false, liquid: false, breakTime: 1.5, tiles: { top: 3, bottom: 3, side: 3 } },
  [BlockId.Cobble]: { id: 4 as BlockId, name: 'Brostein', solid: true, opaque: true, transparent: false, liquid: false, breakTime: 1.5, tiles: { top: 4, bottom: 4, side: 4 } },
  [BlockId.Log]: { id: 5 as BlockId, name: 'Tømmer', solid: true, opaque: true, transparent: false, liquid: false, breakTime: 1.0, tiles: { top: 5, bottom: 5, side: 6 } },
  [BlockId.Planks]: { id: 6 as BlockId, name: 'Planker', solid: true, opaque: true, transparent: false, liquid: false, breakTime: 0.8, tiles: { top: 7, bottom: 7, side: 7 } },
  [BlockId.Leaves]: { id: 7 as BlockId, name: 'Løv', solid: true, opaque: false, transparent: true, liquid: false, breakTime: 0.3, tiles: { top: 8, bottom: 8, side: 8 } },
  [BlockId.Sand]: { id: 8 as BlockId, name: 'Sand', solid: true, opaque: true, transparent: false, liquid: false, breakTime: 0.5, tiles: { top: 9, bottom: 9, side: 9 } },
  [BlockId.Glass]: { id: 9 as BlockId, name: 'Glass', solid: true, opaque: false, transparent: true, liquid: false, breakTime: 0.4, tiles: { top: 10, bottom: 10, side: 10 } },
  [BlockId.Water]: { id: 10 as BlockId, name: 'Vann', solid: false, opaque: false, transparent: true, liquid: true, breakTime: 0, tiles: { top: 11, bottom: 11, side: 11 } },
  [BlockId.CraftingTable]: { id: 11 as BlockId, name: 'Arbeidsbenk', solid: true, opaque: true, transparent: false, liquid: false, breakTime: 0.8, tiles: { top: 12, bottom: 7, side: 12 } },
  [BlockId.Torch]: { id: 12 as BlockId, name: 'Fakkel', solid: false, opaque: false, transparent: true, liquid: false, breakTime: 0.05, lightEmit: 14, tiles: { top: 16, bottom: 16, side: 16 } },
  [BlockId.Chest]: { id: 13 as BlockId, name: 'Kiste', solid: true, opaque: true, transparent: false, liquid: false, breakTime: 1.0, tiles: { top: 17, bottom: 17, side: 17 } },
  [BlockId.Furnace]: { id: 14 as BlockId, name: 'Ovn', solid: true, opaque: true, transparent: false, liquid: false, breakTime: 1.5, tiles: { top: 31, bottom: 3, side: 18 } },
  [BlockId.CoalOre]: { id: 15 as BlockId, name: 'Kullmalm', solid: true, opaque: true, transparent: false, liquid: false, breakTime: 1.8, tiles: { top: 20, bottom: 20, side: 20 } },
  [BlockId.IronOre]: { id: 16 as BlockId, name: 'Jernmalm', solid: true, opaque: true, transparent: false, liquid: false, breakTime: 2.0, tiles: { top: 21, bottom: 21, side: 21 } },
  [BlockId.GoldOre]: { id: 17 as BlockId, name: 'Gullmalm', solid: true, opaque: true, transparent: false, liquid: false, breakTime: 2.0, tiles: { top: 22, bottom: 22, side: 22 } },
  [BlockId.DiamondOre]: { id: 18 as BlockId, name: 'Diamantmalm', solid: true, opaque: true, transparent: false, liquid: false, breakTime: 2.5, tiles: { top: 23, bottom: 23, side: 23 } },
  [BlockId.SnowGrass]: { id: 19 as BlockId, name: 'Snøgress', solid: true, opaque: true, transparent: false, liquid: false, breakTime: 0.6, tiles: { top: 24, bottom: 1, side: 25 } },
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
export function lightEmission(id: number): number {
  return BLOCKS[id]?.lightEmit ?? 0;
}

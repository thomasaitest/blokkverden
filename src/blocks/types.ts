import { doorPanel } from '../world/doors';

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
  Lava: 44, Glodstein: 45, Helkvarts: 46, Anvil: 47, Bedrock: 48,
  Gravel: 49, Sapling: 76, TallGrass: 78, Dandelion: 79, Poppy: 80, Fire: 83,
  DoubleGrass: 84, DoubleGrassTop: 85,
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
  [26]: B(26, 'Dør', true, true, false, false, 0.8, { top: 7, bottom: 7, side: 52 }),
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
  [38]: B(38, 'Lampe', true, true, false, false, 0.4, { top: 58, bottom: 58, side: 58 }, 0),
  [39]: B(39, 'Trykkplate', false, false, true, false, 0.3, { top: 59, bottom: 59, side: 59 }),
  [40]: B(40, 'Helstein', true, true, false, false, 1.2, { top: 60, bottom: 60, side: 60 }),
  [41]: B(41, 'Sjelegrus', true, true, false, false, 0.5, { top: 61, bottom: 61, side: 61 }),
  [42]: B(42, 'Portal', false, false, true, false, 0, { top: 62, bottom: 62, side: 62 }, 11),
  [43]: B(43, 'Portalramme', true, true, false, false, 2.5, { top: 63, bottom: 63, side: 63 }),
  [44]: B(44, 'Lava', false, false, true, true, 0, { top: 64, bottom: 64, side: 64 }, 12),
  [45]: B(45, 'Glødstein', true, false, true, false, 0.6, { top: 65, bottom: 65, side: 65 }, 15),
  [46]: B(46, 'Helkvarts', true, true, false, false, 1.4, { top: 66, bottom: 66, side: 66 }),
  [47]: B(47, 'Ambolt', true, true, false, false, 2.5, { top: 67, bottom: 67, side: 67 }),
  // Grunnfjell (MC bedrock): bunnen av verden, kan ikke knuses i overlevelse.
  [48]: B(48, 'Grunnfjell', true, true, false, false, -1, { top: 71, bottom: 71, side: 71 }),
  // it17 (MC): grus faller som sand; spire (eik) og høyt gress er kryss-planter uten kollisjon
  [49]: B(49, 'Grus', true, true, false, false, 0.6, { top: 73, bottom: 73, side: 73 }),
  [76]: B(76, 'Spire', false, false, true, false, 0.05, { top: 75, bottom: 75, side: 75 }),
  [78]: B(78, 'Høyt gress', false, false, true, false, 0.05, { top: 76, bottom: 76, side: 76 }),
  // it18 (MC): blomster — kryss-planter på gress/jord
  [79]: B(79, 'Løvetann', false, false, true, false, 0.05, { top: 78, bottom: 78, side: 78 }),
  [80]: B(80, 'Valmue', false, false, true, false, 0.05, { top: 79, bottom: 79, side: 79 }),
  // it19 (MC): ild — ingen kollisjon, slukkes med ett slag, lyser 15
  // it21 (MC): dobbelt høyt gress — to kryss-planter oppå hverandre (84 = nedre, 85 = øvre halvdel)
  [84]: B(84, 'Dobbelt høyt gress', false, false, true, false, 0.05, { top: 82, bottom: 82, side: 82 }),
  [85]: B(85, 'Dobbelt høyt gress', false, false, true, false, 0.05, { top: 83, bottom: 83, side: 83 }),
  [83]: B(83, 'Ild', false, false, true, false, 0.05, { top: 80, bottom: 80, side: 80 }, 15),
};

/** Cross-shaped plants (MC "X" models): no collision, break instantly, pop when the ground goes. */
export function isCrossPlant(id: number): boolean {
  return id === BlockId.Sapling || id === BlockId.TallGrass || id === BlockId.Dandelion || id === BlockId.Poppy
    || id === BlockId.DoubleGrass || id === BlockId.DoubleGrassTop;
}
/** MC flowers (dandelion, poppy): planted on grass/dirt/farmland. */
export function isFlower(id: number): boolean { return id === BlockId.Dandelion || id === BlockId.Poppy; }
/** MC "replaceable" blocks: placing a block into them overwrites them (tall grass). */
export function isReplaceable(id: number): boolean {
  return id === BlockId.Air || id === BlockId.Water || id === BlockId.TallGrass || id === BlockId.Fire
    || id === BlockId.DoubleGrass || id === BlockId.DoubleGrassTop;
}

export function isSolid(id: number): boolean { return BLOCKS[id]?.solid ?? false; }
export function isOpaque(id: number): boolean { return BLOCKS[id]?.opaque ?? false; }
export function isTransparent(id: number): boolean { return BLOCKS[id]?.transparent ?? true; }
export function lightEmission(id: number): number { return BLOCKS[id]?.lightEmit ?? 0; }

/** Blocks that store open/powered state in waterLevel meta. */
export function usesMeta(id: number): boolean {
  return id === BlockId.Door || id === BlockId.Gate || id === BlockId.Trapdoor
    || id === BlockId.Lever || id === BlockId.Button || id === BlockId.PressurePlate
    || id === BlockId.Lamp || id === BlockId.Crop || id === BlockId.RedDust;
}

export function collidesBlock(
  id: number, bx: number, by: number, bz: number,
  minX: number, minY: number, maxX: number, maxY: number, minZ: number, maxZ: number,
  meta = 0,
): boolean {
  if (id === 0 || isCrossPlant(id) || id === BlockId.Fire || id === BlockId.Water || id === BlockId.Lava || id === BlockId.Torch || id === BlockId.Crop || id === BlockId.RedDust || id === BlockId.Ladder || id === BlockId.Sign || id === BlockId.Portal) return false;
  if (id === BlockId.PressurePlate || id === BlockId.Button || id === BlockId.Lever) return false;
  if (id === BlockId.Door) {
    // it19 (MC): thin 3/16 panel, two blocks tall (closed: along its facing edge; open: against the hinge side)
    const [x0, z0, x1, z1] = doorPanel(meta);
    return maxX > bx + x0 && minX < bx + x1 && maxZ > bz + z0 && minZ < bz + z1 && maxY > by && minY < by + 2;
  }
  if ((id === BlockId.Door || id === BlockId.Gate || id === BlockId.Trapdoor) && (meta & 1)) return false;
  if (id === BlockId.Slab) {
    return maxY > by && minY < by + 0.5 && maxX > bx && minX < bx + 1 && maxZ > bz && minZ < bz + 1;
  }
  if (id === BlockId.Fence || id === BlockId.GlassPane) {
    const cx0 = bx + 0.375, cx1 = bx + 0.625, cz0 = bz + 0.375, cz1 = bz + 0.625;
    return maxX > cx0 && minX < cx1 && maxZ > cz0 && minZ < cz1 && maxY > by && minY < by + 1.5;
  }
  if (id === BlockId.Stairs) {
    return maxY > by && minY < by + 1 && maxX > bx && minX < bx + 1 && maxZ > bz && minZ < bz + 1;
  }
  const def = BLOCKS[id];
  return !!(def?.solid);
}

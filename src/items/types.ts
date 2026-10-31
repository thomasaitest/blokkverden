
import { BlockId, BLOCKS } from '../blocks/types';

export const ItemId = {
  Air: 0,
  Grass: 1, Dirt: 2, Stone: 3, Cobble: 4, Log: 5, Planks: 6, Leaves: 7,
  Sand: 8, Glass: 9, Water: 10, CraftingTable: 11, Torch: 12, Chest: 13, Furnace: 14,
  CoalOre: 15, IronOre: 16, GoldOre: 17, DiamondOre: 18, SnowGrass: 19, Bed: 20, Wool: 21,
  Stick: 50, Coal: 51, Apple: 52, IronIngot: 53, GoldIngot: 54, Diamond: 55, CookedApple: 56,
  Leather: 57, Feather: 58, WoolItem: 59, RawMeat: 60, Arrow: 61, Bow: 62,
  WoodPickaxe: 100, WoodAxe: 101, WoodShovel: 102, WoodSword: 103,
  StonePickaxe: 104, StoneAxe: 105, StoneShovel: 106, StoneSword: 107,
  IronPickaxe: 108, IronAxe: 109, IronShovel: 110, IronSword: 111,
  DiamondPickaxe: 112, DiamondAxe: 113, DiamondShovel: 114, DiamondSword: 115,
  LeatherHelmet: 120, LeatherChest: 121, LeatherLegs: 122, LeatherBoots: 123,
  IronHelmet: 124, IronChest: 125, IronLegs: 126, IronBoots: 127,
  DiamondHelmet: 128, DiamondChest: 129, DiamondLegs: 130, DiamondBoots: 131,
  Seeds: 63, Wheat: 64, Bread: 65, Boat: 66, FishingRod: 67, MapItem: 68, RawFish: 69, CookedFish: 70, Bone: 71, CookedMeat: 72, String: 73, Gunpowder: 74, RottenFlesh: 75,
  WoodHoe: 116, IronHoe: 117, EnchantTable: 24, Door: 26, Trapdoor: 27, Fence: 28, Gate: 29, Stairs: 30, Slab: 31, GlassPane: 32, Ladder: 33, Sign: 34, RedDust: 35, Lever: 36, Button: 37, Lamp: 38, PressurePlate: 39, Helstein: 40, Sjelegrus: 41, PortalFrame: 43,
  Gravel: 49, Sapling: 76, Flint: 77, Dandelion: 79, Poppy: 80, BoneMeal: 81, FlintAndSteel: 82,
} as const;

export type ItemId = (typeof ItemId)[keyof typeof ItemId];
export type ToolKind = 'pickaxe' | 'axe' | 'shovel' | 'sword' | 'bow' | 'hoe' | 'none';
export type ArmorSlot = 'head' | 'chest' | 'legs' | 'feet';
export type BlockMaterial = 'ground' | 'wood' | 'stone' | 'plant' | 'glass' | 'other';

export interface ItemDef {
  id: number; name: string; stackable: boolean; maxStack: number;
  placeBlock?: number; tool?: ToolKind; tier?: 'wood' | 'stone' | 'iron' | 'diamond';
  maxDurability?: number; mineSpeed?: number; attack?: number; iconTile: number;
  food?: number; fuel?: number; armor?: number; armorSlot?: ArmorSlot;
}

export interface ItemStack { id: number; count: number; durability?: number; }
export function stack(id: number, count = 1, durability?: number): ItemStack {
  return { id, count, durability };
}

function blk(id: number, name: string, tile: number, place: number, extra: Partial<ItemDef> = {}): ItemDef {
  return { id, name, stackable: true, maxStack: 64, placeBlock: place, iconTile: tile, ...extra };
}
function tool(id: number, name: string, tool: ToolKind, tier: ItemDef['tier'], dur: number, speed: number, atk: number, tile: number): ItemDef {
  return { id, name, stackable: false, maxStack: 1, tool, tier, maxDurability: dur, mineSpeed: speed, attack: atk, iconTile: tile };
}
function armor(id: number, name: string, slot: ArmorSlot, pts: number, tile: number, dur: number): ItemDef {
  return { id, name, stackable: false, maxStack: 1, armor: pts, armorSlot: slot, maxDurability: dur, iconTile: tile };
}

export const ITEMS: Record<number, ItemDef> = {
  [1]: blk(1, 'Gress', 2, 1), [2]: blk(2, 'Jord', 1, 2), [3]: blk(3, 'Stein', 3, 3),
  [4]: blk(4, 'Brostein', 4, 4), [5]: blk(5, 'Tømmer', 6, 5, { fuel: 300 }),
  [6]: blk(6, 'Planker', 7, 6, { fuel: 150 }), [7]: blk(7, 'Løv', 8, 7),
  [8]: blk(8, 'Sand', 9, 8), [9]: blk(9, 'Glass', 10, 9),
  [11]: blk(11, 'Arbeidsbenk', 12, 11), [12]: blk(12, 'Fakkel', 16, 12),
  [13]: blk(13, 'Kiste', 17, 13), [14]: blk(14, 'Ovn', 18, 14),
  [15]: blk(15, 'Kullmalm', 20, 15), [16]: blk(16, 'Jernmalm', 21, 16),
  [17]: blk(17, 'Gullmalm', 22, 17), [18]: blk(18, 'Diamantmalm', 23, 18),
  [19]: blk(19, 'Snøgress', 24, 19), [20]: blk(20, 'Seng', 32, 20),
  [21]: blk(21, 'Ull', 33, 21),
  [50]: { id: 50, name: 'Pinne', stackable: true, maxStack: 64, iconTile: 13, fuel: 50 },
  [51]: { id: 51, name: 'Kull', stackable: true, maxStack: 64, iconTile: 26, fuel: 800 },
  [52]: { id: 52, name: 'Eple', stackable: true, maxStack: 64, iconTile: 27, food: 4 },
  [53]: { id: 53, name: 'Jernbarr', stackable: true, maxStack: 64, iconTile: 28 },
  [54]: { id: 54, name: 'Gullbarr', stackable: true, maxStack: 64, iconTile: 29 },
  [55]: { id: 55, name: 'Diamant', stackable: true, maxStack: 64, iconTile: 30 },
  [56]: { id: 56, name: 'Bakt eple', stackable: true, maxStack: 64, iconTile: 27, food: 6 },
  [57]: { id: 57, name: 'Lær', stackable: true, maxStack: 64, iconTile: 33 },
  [58]: { id: 58, name: 'Fjær', stackable: true, maxStack: 64, iconTile: 13 },
  [59]: { id: 59, name: 'Ull', stackable: true, maxStack: 64, iconTile: 33, placeBlock: 21 },
  [60]: { id: 60, name: 'Kjøtt', stackable: true, maxStack: 64, iconTile: 27, food: 3 },
  [61]: { id: 61, name: 'Pil', stackable: true, maxStack: 64, iconTile: 14 },
  [62]: { id: 62, name: 'Bue', stackable: false, maxStack: 1, tool: 'bow', maxDurability: 200, iconTile: 15 },
  [100]: tool(100, 'Trehakke', 'pickaxe', 'wood', 60, 2, 2, 14),
  [101]: tool(101, 'Treøks', 'axe', 'wood', 60, 2, 3, 14),
  [102]: tool(102, 'Trespade', 'shovel', 'wood', 60, 2, 1, 14),
  [103]: tool(103, 'Tresverd', 'sword', 'wood', 60, 1, 4, 14),
  [104]: tool(104, 'Steinhakke', 'pickaxe', 'stone', 132, 4, 3, 15),
  [105]: tool(105, 'Steinøks', 'axe', 'stone', 132, 4, 4, 15),
  [106]: tool(106, 'Steinspade', 'shovel', 'stone', 132, 4, 2, 15),
  [107]: tool(107, 'Steinsverd', 'sword', 'stone', 132, 1, 5, 15),
  [108]: tool(108, 'Jernhakke', 'pickaxe', 'iron', 250, 6, 4, 34),
  [109]: tool(109, 'Jernøks', 'axe', 'iron', 250, 6, 5, 34),
  [110]: tool(110, 'Jernspade', 'shovel', 'iron', 250, 6, 3, 34),
  [111]: tool(111, 'Jernsverd', 'sword', 'iron', 250, 1, 6, 34),
  [112]: tool(112, 'Diamanthakke', 'pickaxe', 'diamond', 1561, 8, 5, 35),
  [113]: tool(113, 'Diamantøks', 'axe', 'diamond', 1561, 8, 6, 35),
  [114]: tool(114, 'Diamantspade', 'shovel', 'diamond', 1561, 8, 4, 35),
  [115]: tool(115, 'Diamantsverd', 'sword', 'diamond', 1561, 1, 7, 35),
  [120]: armor(120, 'Lærhjelm', 'head', 1, 33, 55),
  [121]: armor(121, 'Lærbryst', 'chest', 3, 33, 80),
  [122]: armor(122, 'Lærbukser', 'legs', 2, 33, 75),
  [123]: armor(123, 'Lærstøvler', 'feet', 1, 33, 65),
  [124]: armor(124, 'Jernhjelm', 'head', 2, 34, 165),
  [125]: armor(125, 'Jernbryst', 'chest', 6, 34, 240),
  [126]: armor(126, 'Jernbukser', 'legs', 5, 34, 225),
  [127]: armor(127, 'Jernstøvler', 'feet', 2, 34, 195),
  [128]: armor(128, 'Diamanthjelm', 'head', 3, 35, 363),
  [129]: armor(129, 'Diamantbryst', 'chest', 8, 35, 528),
  [130]: armor(130, 'Diamantbukser', 'legs', 6, 35, 495),
  [131]: armor(131, 'Diamantstøvler', 'feet', 3, 35, 429),
  [22]: blk(22, 'Åkerjord', 36, 22),
  [23]: blk(23, 'Avling', 37, 23),
  [24]: blk(24, 'Fortryllelsesbord', 39, 24),
  [63]: { id: 63, name: 'Frø', stackable: true, maxStack: 64, iconTile: 42 },
  [64]: { id: 64, name: 'Hvete', stackable: true, maxStack: 64, iconTile: 45 },
  [65]: { id: 65, name: 'Brød', stackable: true, maxStack: 64, iconTile: 41, food: 5 },
  [66]: { id: 66, name: 'Båt', stackable: false, maxStack: 1, iconTile: 40 },
  [67]: { id: 67, name: 'Fiskestang', stackable: false, maxStack: 1, maxDurability: 64, iconTile: 47 },
  [68]: { id: 68, name: 'Kart', stackable: false, maxStack: 1, iconTile: 48 },
  [69]: { id: 69, name: 'Råfisk', stackable: true, maxStack: 64, iconTile: 49, food: 2 },
  [70]: { id: 70, name: 'Stekt fisk', stackable: true, maxStack: 64, iconTile: 50, food: 5 },
  [71]: { id: 71, name: 'Bein', stackable: true, maxStack: 64, iconTile: 68 },
  [72]: { id: 72, name: 'Stekt kjøtt', stackable: true, maxStack: 64, iconTile: 72, food: 8 },
  [73]: { id: 73, name: 'Tråd', stackable: true, maxStack: 64, iconTile: 13 },
  [74]: { id: 74, name: 'Krutt', stackable: true, maxStack: 64, iconTile: 26 },
  [75]: { id: 75, name: 'Råttent kjøtt', stackable: true, maxStack: 64, iconTile: 27, food: 4 },
  [25]: blk(25, 'Fremkaller', 46, 25),
  [26]: blk(26, 'Dør', 52, 26),
  [27]: blk(27, 'Falldør', 52, 27),
  [28]: blk(28, 'Gjerde', 53, 28),
  [29]: blk(29, 'Grind', 53, 29),
  [30]: blk(30, 'Trapp', 7, 30),
  [31]: blk(31, 'Plate', 7, 31),
  [32]: blk(32, 'Glassrute', 10, 32),
  [33]: blk(33, 'Stige', 54, 33),
  [34]: blk(34, 'Skilt', 55, 34),
  [35]: blk(35, 'Rødtråd', 56, 35),
  [36]: blk(36, 'Spak', 57, 36),
  [37]: blk(37, 'Knapp', 57, 37),
  [38]: blk(38, 'Lampe', 58, 38),
  [39]: blk(39, 'Trykkplate', 59, 39),
  [40]: blk(40, 'Helstein', 60, 40),
  [41]: blk(41, 'Sjelegrus', 61, 41),
  [43]: blk(43, 'Portalramme', 63, 43),
  [116]: tool(116, 'Trekrafse', 'hoe', 'wood', 60, 1, 1, 44),
  [117]: tool(117, 'Jernkrafse', 'hoe', 'iron', 250, 1, 1, 44),
  [49]: blk(49, 'Grus', 73, 49),
  [76]: blk(76, 'Spire', 75, 76, { fuel: 50 }), // MC: ⅓ of planks' burn time
  [77]: { id: 77, name: 'Flint', stackable: true, maxStack: 64, iconTile: 74 },
  [79]: blk(79, 'Løvetann', 78, 79),
  [80]: blk(80, 'Valmue', 79, 80),
  [81]: { id: 81, name: 'Beinmel', stackable: true, maxStack: 64, iconTile: 77 },
  // it19 (MC): fyrstål — tenner ild og helvetesportaler, 64 bruk
  [82]: tool(82, 'Fyrstål', 'none', undefined, 64, 1, 1, 81),
};

export function blockMaterial(blockId: number): BlockMaterial {
  switch (blockId) {
    case 1: case 2: case 8: case 19: case 22: case 49: return 'ground';
    case 5: case 6: case 11: case 13: case 20: case 21: return 'wood';
    case 3: case 4: case 14: case 15: case 16: case 17: case 18: case 46: case 47: return 'stone';
    case 7: case 76: case 78: case 79: case 80: case 84: case 85: return 'plant';
    case 9: case 12: return 'glass';
    default: return 'other';
  }
}
export function preferredTool(mat: BlockMaterial): ToolKind {
  if (mat === 'stone') return 'pickaxe';
  if (mat === 'wood') return 'axe';
  if (mat === 'ground') return 'shovel';
  if (mat === 'plant') return 'sword';
  return 'none';
}
const TIER_RANK: Record<string, number> = { wood: 1, stone: 2, iron: 3, diamond: 4 };
/** Minimum pickaxe tier to get a drop (MC): iron ore needs stone, gold/diamond need iron. */
export function requiredPickTier(blockId: number): number {
  if (blockId === 16) return 2;
  if (blockId === 17 || blockId === 18) return 3;
  return blockMaterial(blockId) === 'stone' ? 1 : 0;
}
/** True when the held item harvests the block (stone-type blocks need a good-enough pickaxe). */
export function canHarvest(blockId: number, held: ItemStack | null): boolean {
  const need = requiredPickTier(blockId);
  if (need === 0) return true;
  const def = held ? ITEMS[held.id] : undefined;
  return def?.tool === 'pickaxe' && (TIER_RANK[def.tier ?? ''] ?? 0) >= need;
}
export function breakDuration(blockId: number, held: ItemStack | null): number {
  const base = BLOCKS[blockId]?.breakTime ?? 0.5;
  if (base < 0) return Infinity; // bedrock: unbreakable in survival
  if (base === 0) return 0;
  const mat = blockMaterial(blockId);
  const pref = preferredTool(mat);
  const def = held ? ITEMS[held.id] : undefined;
  let mult = 1;
  if (def?.tool && def.tool === pref && def.mineSpeed) mult = def.mineSpeed;
  else if (mat === 'stone') mult = 0.2;
  // MC: a pickaxe that's too weak still uses its speed but /100 instead of /30 (≈3.3× slower)
  if (mult > 1 && !canHarvest(blockId, held)) mult /= 3.33;
  return base / mult;
}
/** MC mining penalties: ×5 slower with your head under water, ×5 slower while not standing on the ground (they stack). */
export function miningPenalty(onGround: boolean, eyesInWater: boolean): number {
  return (onGround ? 1 : 5) * (eyesInWater ? 5 : 1);
}
export function dropForBlock(blockId: number, held: ItemStack | null): ItemStack | null {
  if (blockId === 0 || blockId === 10) return null;
  if (blockId === 48) return null;
  if (blockId === 83) return null; // fire drops nothing
  if (!canHarvest(blockId, held)) return null;
  if (blockId === 3) return stack(4, 1);
  if (blockId === 15) return stack(51, 1);
  if (blockId === 18) return stack(55, 1);
  // MC: a grass block always drops dirt; seeds come from tall grass (12.5 %)
  if (blockId === 1 || blockId === 19) return stack(2, 1);
  if (blockId === 78) return Math.random() < 0.125 ? stack(63, 1) : null;
  // it21: double tall grass — MC: only the lower half drops (seeds 12.5 %)
  if (blockId === 84) return Math.random() < 0.125 ? stack(63, 1) : null;
  if (blockId === 85) return null;
  // MC gravel: 10 % flint, otherwise gravel
  if (blockId === 49) return Math.random() < 0.1 ? stack(77, 1) : stack(49, 1);
  if (blockId === 7) {
    // MC oak leaves (no silk/shears): sapling 5 %, 1–2 sticks 2 %, apple 0.5 %
    const r = Math.random();
    if (r < 0.05) return stack(76, 1);
    if (r < 0.07) return stack(50, 1 + (Math.random() < 0.5 ? 1 : 0));
    if (r < 0.075) return stack(52, 1);
    return null;
  }
  if (blockId === 23) return null; // crops handled by harvestCrop
  if (blockId === 22) return stack(2, 1);
  if (blockId === 9) return null;
  if (blockId === 12) return stack(12, 1);
  const placeable = Object.values(ITEMS).find((i) => i.placeBlock === blockId);
  if (placeable) return stack(placeable.id, 1);
  return stack(blockId, 1);
}
export function damageTool(held: ItemStack | null): ItemStack | null {
  if (!held) return null;
  const def = ITEMS[held.id];
  if (!def?.maxDurability) return held;
  const d = (held.durability ?? def.maxDurability) - 1;
  if (d <= 0) return null;
  return { ...held, durability: d };
}
export function armorPoints(armor: (ItemStack | null)[]): number {
  let s = 0;
  for (const a of armor) if (a) s += ITEMS[a.id]?.armor ?? 0;
  return Math.min(20, s);
}

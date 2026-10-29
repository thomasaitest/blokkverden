import { BlockId, BLOCKS } from '../blocks/types';

export const ItemId = {
  Air: 0,
  Grass: BlockId.Grass,
  Dirt: BlockId.Dirt,
  Stone: BlockId.Stone,
  Cobble: BlockId.Cobble,
  Log: BlockId.Log,
  Planks: BlockId.Planks,
  Leaves: BlockId.Leaves,
  Sand: BlockId.Sand,
  Glass: BlockId.Glass,
  Water: BlockId.Water,
  CraftingTable: BlockId.CraftingTable,
  Torch: BlockId.Torch,
  Chest: BlockId.Chest,
  Furnace: BlockId.Furnace,
  CoalOre: BlockId.CoalOre,
  IronOre: BlockId.IronOre,
  GoldOre: BlockId.GoldOre,
  DiamondOre: BlockId.DiamondOre,
  SnowGrass: BlockId.SnowGrass,
  Stick: 50,
  Coal: 51,
  Apple: 52,
  IronIngot: 53,
  GoldIngot: 54,
  Diamond: 55,
  CookedApple: 56,
  WoodPickaxe: 100,
  WoodAxe: 101,
  WoodShovel: 102,
  WoodSword: 103,
  StonePickaxe: 104,
  StoneAxe: 105,
  StoneShovel: 106,
  StoneSword: 107,
} as const;

export type ItemId = (typeof ItemId)[keyof typeof ItemId];
export type ToolKind = 'pickaxe' | 'axe' | 'shovel' | 'sword' | 'none';
export type BlockMaterial = 'ground' | 'wood' | 'stone' | 'plant' | 'glass' | 'other';

export interface ItemDef {
  id: number;
  name: string;
  stackable: boolean;
  maxStack: number;
  placeBlock?: number;
  tool?: ToolKind;
  tier?: 'wood' | 'stone';
  maxDurability?: number;
  mineSpeed?: number;
  attack?: number;
  iconTile: number;
  food?: number; // hunger restored
  fuel?: number; // furnace burn ticks
}

export interface ItemStack {
  id: number;
  count: number;
  durability?: number;
}

export function stack(id: number, count = 1, durability?: number): ItemStack {
  return { id, count, durability };
}

function blockItem(id: number, name: string, tile: number, place: number): ItemDef {
  return { id, name, stackable: true, maxStack: 64, placeBlock: place, iconTile: tile };
}

export const ITEMS: Record<number, ItemDef> = {
  [ItemId.Grass]: blockItem(ItemId.Grass, 'Gress', 2, BlockId.Grass),
  [ItemId.Dirt]: blockItem(ItemId.Dirt, 'Jord', 1, BlockId.Dirt),
  [ItemId.Stone]: blockItem(ItemId.Stone, 'Stein', 3, BlockId.Stone),
  [ItemId.Cobble]: blockItem(ItemId.Cobble, 'Brostein', 4, BlockId.Cobble),
  [ItemId.Log]: { ...blockItem(ItemId.Log, 'Tømmer', 6, BlockId.Log), fuel: 300 },
  [ItemId.Planks]: { ...blockItem(ItemId.Planks, 'Planker', 7, BlockId.Planks), fuel: 150 },
  [ItemId.Leaves]: blockItem(ItemId.Leaves, 'Løv', 8, BlockId.Leaves),
  [ItemId.Sand]: blockItem(ItemId.Sand, 'Sand', 9, BlockId.Sand),
  [ItemId.Glass]: blockItem(ItemId.Glass, 'Glass', 10, BlockId.Glass),
  [ItemId.CraftingTable]: blockItem(ItemId.CraftingTable, 'Arbeidsbenk', 12, BlockId.CraftingTable),
  [ItemId.Torch]: blockItem(ItemId.Torch, 'Fakkel', 16, BlockId.Torch),
  [ItemId.Chest]: blockItem(ItemId.Chest, 'Kiste', 17, BlockId.Chest),
  [ItemId.Furnace]: blockItem(ItemId.Furnace, 'Ovn', 18, BlockId.Furnace),
  [ItemId.CoalOre]: blockItem(ItemId.CoalOre, 'Kullmalm', 20, BlockId.CoalOre),
  [ItemId.IronOre]: blockItem(ItemId.IronOre, 'Jernmalm', 21, BlockId.IronOre),
  [ItemId.GoldOre]: blockItem(ItemId.GoldOre, 'Gullmalm', 22, BlockId.GoldOre),
  [ItemId.DiamondOre]: blockItem(ItemId.DiamondOre, 'Diamantmalm', 23, BlockId.DiamondOre),
  [ItemId.SnowGrass]: blockItem(ItemId.SnowGrass, 'Snøgress', 24, BlockId.SnowGrass),
  [ItemId.Stick]: { id: ItemId.Stick, name: 'Pinne', stackable: true, maxStack: 64, iconTile: 13, fuel: 50 },
  [ItemId.Coal]: { id: ItemId.Coal, name: 'Kull', stackable: true, maxStack: 64, iconTile: 26, fuel: 800 },
  [ItemId.Apple]: { id: ItemId.Apple, name: 'Eple', stackable: true, maxStack: 64, iconTile: 27, food: 4 },
  [ItemId.IronIngot]: { id: ItemId.IronIngot, name: 'Jernbarr', stackable: true, maxStack: 64, iconTile: 28 },
  [ItemId.GoldIngot]: { id: ItemId.GoldIngot, name: 'Gullbarr', stackable: true, maxStack: 64, iconTile: 29 },
  [ItemId.Diamond]: { id: ItemId.Diamond, name: 'Diamant', stackable: true, maxStack: 64, iconTile: 30 },
  [ItemId.CookedApple]: { id: ItemId.CookedApple, name: 'Bakt eple', stackable: true, maxStack: 64, iconTile: 27, food: 6 },
  [ItemId.WoodPickaxe]: { id: ItemId.WoodPickaxe, name: 'Trehakke', stackable: false, maxStack: 1, tool: 'pickaxe', tier: 'wood', maxDurability: 60, mineSpeed: 2, iconTile: 14 },
  [ItemId.WoodAxe]: { id: ItemId.WoodAxe, name: 'Treøks', stackable: false, maxStack: 1, tool: 'axe', tier: 'wood', maxDurability: 60, mineSpeed: 2, iconTile: 14 },
  [ItemId.WoodShovel]: { id: ItemId.WoodShovel, name: 'Trespade', stackable: false, maxStack: 1, tool: 'shovel', tier: 'wood', maxDurability: 60, mineSpeed: 2, iconTile: 14 },
  [ItemId.WoodSword]: { id: ItemId.WoodSword, name: 'Tresverd', stackable: false, maxStack: 1, tool: 'sword', tier: 'wood', maxDurability: 60, attack: 4, iconTile: 14 },
  [ItemId.StonePickaxe]: { id: ItemId.StonePickaxe, name: 'Steinhakke', stackable: false, maxStack: 1, tool: 'pickaxe', tier: 'stone', maxDurability: 132, mineSpeed: 4, iconTile: 15 },
  [ItemId.StoneAxe]: { id: ItemId.StoneAxe, name: 'Steinøks', stackable: false, maxStack: 1, tool: 'axe', tier: 'stone', maxDurability: 132, mineSpeed: 4, iconTile: 15 },
  [ItemId.StoneShovel]: { id: ItemId.StoneShovel, name: 'Steinspade', stackable: false, maxStack: 1, tool: 'shovel', tier: 'stone', maxDurability: 132, mineSpeed: 4, iconTile: 15 },
  [ItemId.StoneSword]: { id: ItemId.StoneSword, name: 'Steinsverd', stackable: false, maxStack: 1, tool: 'sword', tier: 'stone', maxDurability: 132, attack: 5, iconTile: 15 },
};

export function blockMaterial(blockId: number): BlockMaterial {
  switch (blockId) {
    case BlockId.Grass: case BlockId.Dirt: case BlockId.Sand: case BlockId.SnowGrass: return 'ground';
    case BlockId.Log: case BlockId.Planks: case BlockId.CraftingTable: case BlockId.Chest: return 'wood';
    case BlockId.Stone: case BlockId.Cobble: case BlockId.Furnace:
    case BlockId.CoalOre: case BlockId.IronOre: case BlockId.GoldOre: case BlockId.DiamondOre: return 'stone';
    case BlockId.Leaves: return 'plant';
    case BlockId.Glass: case BlockId.Torch: return 'glass';
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

export function breakDuration(blockId: number, held: ItemStack | null): number {
  const base = BLOCKS[blockId]?.breakTime ?? 0.5;
  if (base <= 0) return 0;
  const mat = blockMaterial(blockId);
  const pref = preferredTool(mat);
  const def = held ? ITEMS[held.id] : undefined;
  let mult = 1;
  if (def?.tool && def.tool === pref && def.mineSpeed) mult = def.mineSpeed;
  else if (mat === 'stone') mult = 0.2;
  return base / mult;
}

export function dropForBlock(blockId: number, held: ItemStack | null): ItemStack | null {
  if (blockId === BlockId.Air || blockId === BlockId.Water) return null;
  if (blockId === BlockId.Stone) {
    if (ITEMS[held?.id ?? -1]?.tool === 'pickaxe') return stack(ItemId.Cobble, 1);
    return null;
  }
  if (blockId === BlockId.CoalOre) {
    if (ITEMS[held?.id ?? -1]?.tool === 'pickaxe') return stack(ItemId.Coal, 1);
    return null;
  }
  if (blockId === BlockId.IronOre || blockId === BlockId.GoldOre || blockId === BlockId.DiamondOre) {
    if (ITEMS[held?.id ?? -1]?.tool === 'pickaxe') {
      if (blockId === BlockId.DiamondOre) return stack(ItemId.Diamond, 1);
      return stack(blockId, 1); // smelt ores
    }
    return null;
  }
  if (blockId === BlockId.Grass || blockId === BlockId.SnowGrass) return stack(ItemId.Dirt, 1);
  if (blockId === BlockId.Leaves) {
    if (Math.random() < 0.08) return stack(ItemId.Apple, 1);
    if (Math.random() < 0.1) return stack(ItemId.Stick, 1);
    return null;
  }
  if (blockId === BlockId.Glass || blockId === BlockId.Torch) {
    if (blockId === BlockId.Torch) return stack(ItemId.Torch, 1);
    return null;
  }
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

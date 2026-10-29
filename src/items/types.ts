import { BlockId, BLOCKS } from '../blocks/types';

/** Placeable blocks + tools/sticks. Block ids 0–31; tools from 100. */
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
  Stick: 50,
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
  /** Mining speed multiplier vs matching material */
  mineSpeed?: number;
  attack?: number;
  /** atlas tile for UI (block side) or tool icon tile */
  iconTile: number;
}

export interface ItemStack {
  id: number;
  count: number;
  durability?: number;
}

export function stack(id: number, count = 1, durability?: number): ItemStack {
  return { id, count, durability };
}

export const ITEMS: Record<number, ItemDef> = {
  [ItemId.Grass]: { id: ItemId.Grass, name: 'Gress', stackable: true, maxStack: 64, placeBlock: BlockId.Grass, iconTile: 2 },
  [ItemId.Dirt]: { id: ItemId.Dirt, name: 'Jord', stackable: true, maxStack: 64, placeBlock: BlockId.Dirt, iconTile: 1 },
  [ItemId.Stone]: { id: ItemId.Stone, name: 'Stein', stackable: true, maxStack: 64, placeBlock: BlockId.Stone, iconTile: 3 },
  [ItemId.Cobble]: { id: ItemId.Cobble, name: 'Brostein', stackable: true, maxStack: 64, placeBlock: BlockId.Cobble, iconTile: 4 },
  [ItemId.Log]: { id: ItemId.Log, name: 'Tømmer', stackable: true, maxStack: 64, placeBlock: BlockId.Log, iconTile: 6 },
  [ItemId.Planks]: { id: ItemId.Planks, name: 'Planker', stackable: true, maxStack: 64, placeBlock: BlockId.Planks, iconTile: 7 },
  [ItemId.Leaves]: { id: ItemId.Leaves, name: 'Løv', stackable: true, maxStack: 64, placeBlock: BlockId.Leaves, iconTile: 8 },
  [ItemId.Sand]: { id: ItemId.Sand, name: 'Sand', stackable: true, maxStack: 64, placeBlock: BlockId.Sand, iconTile: 9 },
  [ItemId.Glass]: { id: ItemId.Glass, name: 'Glass', stackable: true, maxStack: 64, placeBlock: BlockId.Glass, iconTile: 10 },
  [ItemId.CraftingTable]: {
    id: ItemId.CraftingTable,
    name: 'Arbeidsbenk',
    stackable: true,
    maxStack: 64,
    placeBlock: BlockId.CraftingTable,
    iconTile: 12,
  },
  [ItemId.Stick]: { id: ItemId.Stick, name: 'Pinne', stackable: true, maxStack: 64, iconTile: 13 },
  [ItemId.WoodPickaxe]: {
    id: ItemId.WoodPickaxe, name: 'Trehakke', stackable: false, maxStack: 1,
    tool: 'pickaxe', tier: 'wood', maxDurability: 60, mineSpeed: 2, iconTile: 14,
  },
  [ItemId.WoodAxe]: {
    id: ItemId.WoodAxe, name: 'Treøks', stackable: false, maxStack: 1,
    tool: 'axe', tier: 'wood', maxDurability: 60, mineSpeed: 2, iconTile: 14,
  },
  [ItemId.WoodShovel]: {
    id: ItemId.WoodShovel, name: 'Trespade', stackable: false, maxStack: 1,
    tool: 'shovel', tier: 'wood', maxDurability: 60, mineSpeed: 2, iconTile: 14,
  },
  [ItemId.WoodSword]: {
    id: ItemId.WoodSword, name: 'Tresverd', stackable: false, maxStack: 1,
    tool: 'sword', tier: 'wood', maxDurability: 60, attack: 4, iconTile: 14,
  },
  [ItemId.StonePickaxe]: {
    id: ItemId.StonePickaxe, name: 'Steinhakke', stackable: false, maxStack: 1,
    tool: 'pickaxe', tier: 'stone', maxDurability: 132, mineSpeed: 4, iconTile: 15,
  },
  [ItemId.StoneAxe]: {
    id: ItemId.StoneAxe, name: 'Steinøks', stackable: false, maxStack: 1,
    tool: 'axe', tier: 'stone', maxDurability: 132, mineSpeed: 4, iconTile: 15,
  },
  [ItemId.StoneShovel]: {
    id: ItemId.StoneShovel, name: 'Steinspade', stackable: false, maxStack: 1,
    tool: 'shovel', tier: 'stone', maxDurability: 132, mineSpeed: 4, iconTile: 15,
  },
  [ItemId.StoneSword]: {
    id: ItemId.StoneSword, name: 'Steinsverd', stackable: false, maxStack: 1,
    tool: 'sword', tier: 'stone', maxDurability: 132, attack: 5, iconTile: 15,
  },
};

export function itemName(id: number): string {
  return ITEMS[id]?.name ?? BLOCKS[id]?.name ?? `#${id}`;
}

export function blockMaterial(blockId: number): BlockMaterial {
  switch (blockId) {
    case BlockId.Grass:
    case BlockId.Dirt:
    case BlockId.Sand:
      return 'ground';
    case BlockId.Log:
    case BlockId.Planks:
    case BlockId.CraftingTable:
      return 'wood';
    case BlockId.Stone:
    case BlockId.Cobble:
      return 'stone';
    case BlockId.Leaves:
      return 'plant';
    case BlockId.Glass:
      return 'glass';
    default:
      return 'other';
  }
}

export function preferredTool(mat: BlockMaterial): ToolKind {
  if (mat === 'stone') return 'pickaxe';
  if (mat === 'wood') return 'axe';
  if (mat === 'ground') return 'shovel';
  if (mat === 'plant') return 'sword';
  return 'none';
}

/** Seconds to break with held tool (or bare hand). */
export function breakDuration(blockId: number, held: ItemStack | null): number {
  const base = BLOCKS[blockId]?.breakTime ?? 0.5;
  if (base <= 0) return 0;
  const mat = blockMaterial(blockId);
  const pref = preferredTool(mat);
  const def = held ? ITEMS[held.id] : undefined;
  let mult = 1;
  if (def?.tool && def.tool === pref && def.mineSpeed) {
    mult = def.mineSpeed;
    // stone blocks need at least wood pick
    if (mat === 'stone' && def.tool === 'pickaxe') mult = def.mineSpeed;
    else if (mat === 'stone') mult = 0.3; // wrong tool very slow
  } else if (mat === 'stone') {
    mult = 0.2; // bare hand on stone
  }
  return base / mult;
}

export function dropForBlock(blockId: number, held: ItemStack | null): ItemStack | null {
  if (blockId === BlockId.Air || blockId === BlockId.Water) return null;
  if (blockId === BlockId.Stone) {
    const def = held ? ITEMS[held.id] : undefined;
    if (def?.tool === 'pickaxe') return stack(ItemId.Cobble, 1);
    return null; // no drop without pick
  }
  if (blockId === BlockId.Grass) return stack(ItemId.Dirt, 1);
  if (blockId === BlockId.Leaves) return Math.random() < 0.1 ? stack(ItemId.Stick, 1) : null;
  if (blockId === BlockId.Glass) return null;
  // Crafting table / others drop themselves
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

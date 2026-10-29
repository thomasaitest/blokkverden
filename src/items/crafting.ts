import { ItemId, stack, type ItemStack } from './types';

/** pattern: row-major, 0 = empty. Matches if non-zero cells equal. */
export interface Recipe {
  w: number;
  h: number;
  pattern: number[];
  result: ItemStack;
  /** shapeless counts */
  shapeless?: { id: number; n: number }[];
}

export const RECIPES: Recipe[] = [
  { w: 2, h: 2, pattern: [ItemId.Planks, ItemId.Planks, ItemId.Planks, 0], result: stack(ItemId.Boat, 1) },
  { w: 3, h: 3, pattern: [0, 0, ItemId.Stick, 0, ItemId.Stick, ItemId.Feather, ItemId.Stick, 0, ItemId.Feather], result: stack(ItemId.FishingRod, 1, 64) },
  { w: 3, h: 3, pattern: [ItemId.Planks, ItemId.Planks, ItemId.Planks, ItemId.Planks, ItemId.IronIngot, ItemId.Planks, ItemId.Planks, ItemId.Planks, ItemId.Planks], result: stack(ItemId.MapItem, 1) },
  { w: 3, h: 2, pattern: [ItemId.Planks, ItemId.Planks, 0, 0, ItemId.Stick, 0], result: stack(ItemId.WoodHoe, 1, 60) },
  { w: 3, h: 2, pattern: [ItemId.IronIngot, ItemId.IronIngot, 0, 0, ItemId.Stick, 0], result: stack(ItemId.IronHoe, 1, 250) },
  { w: 3, h: 1, pattern: [ItemId.Wheat, ItemId.Wheat, ItemId.Wheat], result: stack(ItemId.Bread, 1) },
  { w: 3, h: 3, pattern: [0, ItemId.Diamond, 0, ItemId.Diamond, ItemId.Cobble, ItemId.Diamond, ItemId.Cobble, ItemId.Cobble, ItemId.Cobble], result: stack(ItemId.EnchantTable, 1) },

  // bed
  { w: 3, h: 2, pattern: [ItemId.WoolItem, ItemId.WoolItem, ItemId.WoolItem, ItemId.Planks, ItemId.Planks, ItemId.Planks], result: stack(ItemId.Bed, 1) },
  // bow
  { w: 3, h: 3, pattern: [0, ItemId.Stick, ItemId.Leather, ItemId.Stick, 0, ItemId.Leather, 0, ItemId.Stick, ItemId.Leather], result: stack(ItemId.Bow, 1, 200) },
  // arrow
  { w: 1, h: 3, pattern: [ItemId.Cobble, ItemId.Stick, ItemId.Feather], result: stack(ItemId.Arrow, 4) },
  // iron tools
  { w: 3, h: 3, pattern: [ItemId.IronIngot, ItemId.IronIngot, ItemId.IronIngot, 0, ItemId.Stick, 0, 0, ItemId.Stick, 0], result: stack(ItemId.IronPickaxe, 1, 250) },
  { w: 3, h: 3, pattern: [ItemId.IronIngot, ItemId.IronIngot, 0, ItemId.IronIngot, ItemId.Stick, 0, 0, ItemId.Stick, 0], result: stack(ItemId.IronAxe, 1, 250) },
  { w: 1, h: 3, pattern: [ItemId.IronIngot, ItemId.Stick, ItemId.Stick], result: stack(ItemId.IronShovel, 1, 250) },
  { w: 1, h: 3, pattern: [ItemId.IronIngot, ItemId.IronIngot, ItemId.Stick], result: stack(ItemId.IronSword, 1, 250) },
  // diamond
  { w: 3, h: 3, pattern: [ItemId.Diamond, ItemId.Diamond, ItemId.Diamond, 0, ItemId.Stick, 0, 0, ItemId.Stick, 0], result: stack(ItemId.DiamondPickaxe, 1, 1561) },
  { w: 1, h: 3, pattern: [ItemId.Diamond, ItemId.Diamond, ItemId.Stick], result: stack(ItemId.DiamondSword, 1, 1561) },
  // leather armor
  { w: 3, h: 2, pattern: [ItemId.Leather, ItemId.Leather, ItemId.Leather, ItemId.Leather, 0, ItemId.Leather], result: stack(ItemId.LeatherHelmet, 1, 55) },
  { w: 3, h: 3, pattern: [ItemId.Leather, 0, ItemId.Leather, ItemId.Leather, ItemId.Leather, ItemId.Leather, ItemId.Leather, ItemId.Leather, ItemId.Leather], result: stack(ItemId.LeatherChest, 1, 80) },
  // iron armor
  { w: 3, h: 2, pattern: [ItemId.IronIngot, ItemId.IronIngot, ItemId.IronIngot, ItemId.IronIngot, 0, ItemId.IronIngot], result: stack(ItemId.IronHelmet, 1, 165) },
  { w: 3, h: 3, pattern: [ItemId.IronIngot, 0, ItemId.IronIngot, ItemId.IronIngot, ItemId.IronIngot, ItemId.IronIngot, ItemId.IronIngot, ItemId.IronIngot, ItemId.IronIngot], result: stack(ItemId.IronChest, 1, 240) },

  // torch: coal + stick
  { w: 1, h: 2, pattern: [ItemId.Coal, ItemId.Stick], result: stack(ItemId.Torch, 4) },
  // chest
  {
    w: 3, h: 3,
    pattern: [
      ItemId.Planks, ItemId.Planks, ItemId.Planks,
      ItemId.Planks, 0, ItemId.Planks,
      ItemId.Planks, ItemId.Planks, ItemId.Planks,
    ],
    result: stack(ItemId.Chest, 1),
  },
  // furnace
  {
    w: 3, h: 3,
    pattern: [
      ItemId.Cobble, ItemId.Cobble, ItemId.Cobble,
      ItemId.Cobble, 0, ItemId.Cobble,
      ItemId.Cobble, ItemId.Cobble, ItemId.Cobble,
    ],
    result: stack(ItemId.Furnace, 1),
  },

  // 1 log -> 4 planks
  { w: 1, h: 1, pattern: [ItemId.Log], result: stack(ItemId.Planks, 4) },
  // 2 planks vertical -> 4 sticks
  { w: 1, h: 2, pattern: [ItemId.Planks, ItemId.Planks], result: stack(ItemId.Stick, 4) },
  // 4 planks -> crafting table
  {
    w: 2,
    h: 2,
    pattern: [ItemId.Planks, ItemId.Planks, ItemId.Planks, ItemId.Planks],
    result: stack(ItemId.CraftingTable, 1),
  },
  // wood pickaxe
  {
    w: 3,
    h: 3,
    pattern: [
      ItemId.Planks, ItemId.Planks, ItemId.Planks,
      0, ItemId.Stick, 0,
      0, ItemId.Stick, 0,
    ],
    result: stack(ItemId.WoodPickaxe, 1, 60),
  },
  {
    w: 3,
    h: 3,
    pattern: [
      ItemId.Planks, ItemId.Planks, 0,
      ItemId.Planks, ItemId.Stick, 0,
      0, ItemId.Stick, 0,
    ],
    result: stack(ItemId.WoodAxe, 1, 60),
  },
  {
    w: 3,
    h: 3,
    pattern: [
      0, ItemId.Planks, 0,
      0, ItemId.Stick, 0,
      0, ItemId.Stick, 0,
    ],
    result: stack(ItemId.WoodShovel, 1, 60),
  },
  {
    w: 1,
    h: 3,
    pattern: [ItemId.Planks, ItemId.Planks, ItemId.Stick],
    result: stack(ItemId.WoodSword, 1, 60),
  },
  // stone tools
  {
    w: 3,
    h: 3,
    pattern: [
      ItemId.Cobble, ItemId.Cobble, ItemId.Cobble,
      0, ItemId.Stick, 0,
      0, ItemId.Stick, 0,
    ],
    result: stack(ItemId.StonePickaxe, 1, 132),
  },
  {
    w: 3,
    h: 3,
    pattern: [
      ItemId.Cobble, ItemId.Cobble, 0,
      ItemId.Cobble, ItemId.Stick, 0,
      0, ItemId.Stick, 0,
    ],
    result: stack(ItemId.StoneAxe, 1, 132),
  },
  {
    w: 3,
    h: 3,
    pattern: [
      0, ItemId.Cobble, 0,
      0, ItemId.Stick, 0,
      0, ItemId.Stick, 0,
    ],
    result: stack(ItemId.StoneShovel, 1, 132),
  },
  {
    w: 1,
    h: 3,
    pattern: [ItemId.Cobble, ItemId.Cobble, ItemId.Stick],
    result: stack(ItemId.StoneSword, 1, 132),
  },
  { w: 2, h: 3, pattern: [ItemId.Planks, ItemId.Planks, ItemId.Planks, ItemId.Planks, ItemId.Planks, ItemId.Planks], result: stack(ItemId.Door, 1) },
  { w: 2, h: 2, pattern: [ItemId.Planks, ItemId.Planks, ItemId.Planks, ItemId.Planks], result: stack(ItemId.Trapdoor, 1) },
  { w: 3, h: 2, pattern: [ItemId.Stick, ItemId.Planks, ItemId.Stick, ItemId.Stick, ItemId.Planks, ItemId.Stick], result: stack(ItemId.Fence, 4) },
  { w: 3, h: 1, pattern: [ItemId.Planks, ItemId.Stick, ItemId.Planks], result: stack(ItemId.Gate, 1) },
  { w: 3, h: 3, pattern: [ItemId.Planks, 0, 0, ItemId.Planks, ItemId.Planks, 0, ItemId.Planks, ItemId.Planks, ItemId.Planks], result: stack(ItemId.Stairs, 4) },
  { w: 3, h: 1, pattern: [ItemId.Planks, ItemId.Planks, ItemId.Planks], result: stack(ItemId.Slab, 6) },
  { w: 3, h: 1, pattern: [ItemId.Glass, ItemId.Glass, ItemId.Glass], result: stack(ItemId.GlassPane, 6) },
  { w: 1, h: 3, pattern: [ItemId.Stick, ItemId.Stick, ItemId.Stick], result: stack(ItemId.Ladder, 3) },
  { w: 3, h: 2, pattern: [ItemId.Planks, ItemId.Planks, ItemId.Planks, ItemId.Planks, ItemId.Stick, ItemId.Planks], result: stack(ItemId.Sign, 1) },
  { w: 3, h: 1, pattern: [ItemId.Cobble, ItemId.Stick, ItemId.Cobble], result: stack(ItemId.Lever, 1) },
  { w: 1, h: 1, pattern: [ItemId.Stone], result: stack(ItemId.Button, 1) },
  { w: 3, h: 3, pattern: [ItemId.RedDust, ItemId.RedDust, ItemId.RedDust, ItemId.RedDust, ItemId.Torch, ItemId.RedDust, ItemId.RedDust, ItemId.RedDust, ItemId.RedDust], result: stack(ItemId.Lamp, 1) },
  { w: 2, h: 1, pattern: [ItemId.Planks, ItemId.Planks], result: stack(ItemId.PressurePlate, 1) },
  // rødtråd from torch+redstone stand-in: cobble+coal dust-like
  { w: 1, h: 2, pattern: [ItemId.RedDust, ItemId.RedDust], result: stack(ItemId.RedDust, 4) },
];

function gridSize(slots: (ItemStack | null)[]): number {
  return Math.sqrt(slots.length) | 0;
}

/** Find matching recipe for 2x2 or 3x3 grid. */
export function matchRecipe(slots: (ItemStack | null)[]): Recipe | null {
  const n = gridSize(slots);
  // Build compact bounds
  let minX = n,
    minY = n,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (slots[y * n + x]) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  if (maxX < 0) return null;
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;

  for (const r of RECIPES) {
    if (r.w !== w || r.h !== h) continue;
    let ok = true;
    for (let y = 0; y < h && ok; y++) {
      for (let x = 0; x < w; x++) {
        const need = r.pattern[y * w + x] || 0;
        const got = slots[(minY + y) * n + (minX + x)];
        const gid = got?.id ?? 0;
        if (need === 0 && gid !== 0) {
          ok = false;
          break;
        }
        if (need !== 0 && gid !== need) {
          ok = false;
          break;
        }
      }
    }
    if (ok) return r;
  }
  return null;
}

/** Consume one from each non-empty craft slot. */
export function consumeCraft(slots: (ItemStack | null)[]): void {
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (!s) continue;
    s.count -= 1;
    if (s.count <= 0) slots[i] = null;
  }
}


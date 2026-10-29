import { describe, expect, it } from 'vitest';
import { matchRecipe, consumeCraft } from '../src/items/crafting';
import { ItemId, stack } from '../src/items/types';
import { Inventory } from '../src/items/inventory';
import { breakDuration } from '../src/items/types';
import { BlockId } from '../src/blocks/types';

describe('crafting', () => {
  it('crafts planks from log', () => {
    const slots = [stack(ItemId.Log), null, null, null];
    const r = matchRecipe(slots);
    expect(r?.result.id).toBe(ItemId.Planks);
    expect(r?.result.count).toBe(4);
  });

  it('crafts crafting table from 4 planks', () => {
    const slots = [
      stack(ItemId.Planks),
      stack(ItemId.Planks),
      stack(ItemId.Planks),
      stack(ItemId.Planks),
    ];
    const r = matchRecipe(slots);
    expect(r?.result.id).toBe(ItemId.CraftingTable);
  });

  it('crafts wood pickaxe in 3x3', () => {
    const slots: (ReturnType<typeof stack> | null)[] = [
      stack(ItemId.Planks), stack(ItemId.Planks), stack(ItemId.Planks),
      null, stack(ItemId.Stick), null,
      null, stack(ItemId.Stick), null,
    ];
    const r = matchRecipe(slots);
    expect(r?.result.id).toBe(ItemId.WoodPickaxe);
    consumeCraft(slots);
    expect(slots[0]).toBeNull();
  });
});

describe('inventory', () => {
  it('adds and stacks', () => {
    const inv = new Inventory();
    expect(inv.add(stack(ItemId.Dirt, 50))).toBe(0);
    expect(inv.add(stack(ItemId.Dirt, 20))).toBe(0);
    expect(inv.slots[0]?.count).toBe(64);
    expect(inv.slots[1]?.count).toBe(6);
  });
});

describe('mining', () => {
  it('pickaxe mines stone faster than bare hand', () => {
    const bare = breakDuration(BlockId.Stone, null);
    const pick = breakDuration(BlockId.Stone, stack(ItemId.WoodPickaxe, 1, 60));
    expect(pick).toBeLessThan(bare);
  });
});

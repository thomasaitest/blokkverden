import { describe, expect, it } from 'vitest';
import { createFurnace, tickFurnace, findSmelt } from '../src/items/furnace';
import { ItemId, stack } from '../src/items/types';
import { ContainerStore } from '../src/world/containers';

describe('furnace', () => {
  it('smelts cobble to stone with fuel', () => {
    const f = createFurnace();
    f.input = stack(ItemId.Cobble, 2);
    f.fuel = stack(ItemId.Coal, 1);
    for (let i = 0; i < 400; i++) tickFurnace(f, 0.05);
    expect(f.output?.id).toBe(ItemId.Stone);
  });

  it('finds sand recipe', () => {
    expect(findSmelt(stack(ItemId.Sand))?.output.id).toBe(ItemId.Glass);
  });
});

describe('containers', () => {
  it('persists chest slots', () => {
    const s = new ContainerStore();
    const chest = s.getChest(1, 2, 3);
    chest[0] = stack(ItemId.Apple, 3);
    const json = s.toJSON();
    const s2 = new ContainerStore();
    s2.loadJSON(json);
    expect(s2.getChest(1, 2, 3)[0]?.id).toBe(ItemId.Apple);
  });
});

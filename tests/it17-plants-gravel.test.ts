import { describe, it, expect } from 'vitest';
import { BlockId, collidesBlock, isCrossPlant, isReplaceable, BLOCKS } from '../src/blocks/types';
import { updateGravityAround, needsSupportBelow, isGravityBlock } from '../src/world/gravity';
import { growOak, canPlantSapling } from '../src/world/saplings';
import { dropForBlock, ItemId, ITEMS, breakDuration } from '../src/items/types';

class FakeWorld {
  b = new Map<string, number>();
  getBlock(x: number, y: number, z: number) { return this.b.get(`${x},${y},${z}`) ?? 0; }
  setBlock(x: number, y: number, z: number, id: number) { const k = `${x},${y},${z}`; if (id) this.b.set(k, id); else this.b.delete(k); return true; }
}
const count = (w: FakeWorld, id: number) => [...w.b.values()].filter((v) => v === id).length;

describe('it17 drops (MC)', () => {
  it('grass block always drops dirt (seeds no longer replace it)', () => {
    for (let i = 0; i < 2000; i++) expect(dropForBlock(BlockId.Grass, null)?.id).toBe(ItemId.Dirt);
  });
  it('tall grass: seeds 12.5 %, else nothing', () => {
    let seeds = 0; const N = 40000;
    for (let i = 0; i < N; i++) { const d = dropForBlock(BlockId.TallGrass, null); if (d) { expect(d.id).toBe(ItemId.Seeds); seeds++; } }
    expect(seeds / N).toBeGreaterThan(0.11); expect(seeds / N).toBeLessThan(0.14);
  });
  it('gravel: flint 10 %, else gravel', () => {
    let flint = 0; const N = 40000;
    for (let i = 0; i < N; i++) { const d = dropForBlock(BlockId.Gravel, null)!; if (d.id === ItemId.Flint) flint++; else expect(d.id).toBe(ItemId.Gravel); }
    expect(flint / N).toBeGreaterThan(0.085); expect(flint / N).toBeLessThan(0.115);
  });
  it('sapling breaks into a sapling item; plants break near-instantly', () => {
    expect(dropForBlock(BlockId.Sapling, null)?.id).toBe(ItemId.Sapling);
    expect(breakDuration(BlockId.Sapling, null)).toBeLessThan(0.1);
    expect(breakDuration(BlockId.TallGrass, null)).toBeLessThan(0.1);
    expect(ITEMS[ItemId.Sapling].placeBlock).toBe(BlockId.Sapling);
  });
});

describe('it17 plants', () => {
  it('cross plants have no collision and are replaceable / need support', () => {
    for (const id of [BlockId.Sapling, BlockId.TallGrass]) {
      expect(isCrossPlant(id)).toBe(true);
      expect(collidesBlock(id, 0, 0, 0, 0, 0, 1, 1, 0, 1)).toBe(false);
      expect(needsSupportBelow(id)).toBe(true);
      expect(BLOCKS[id].opaque).toBe(false);
    }
    expect(needsSupportBelow(BlockId.Crop)).toBe(true);
    expect(isReplaceable(BlockId.TallGrass)).toBe(true);
    expect(isReplaceable(BlockId.Sapling)).toBe(false);
  });
  it('saplings only on grass/dirt/farmland', () => {
    expect(canPlantSapling(BlockId.Grass)).toBe(true);
    expect(canPlantSapling(BlockId.Dirt)).toBe(true);
    expect(canPlantSapling(BlockId.Stone)).toBe(false);
    expect(canPlantSapling(BlockId.Sand)).toBe(false);
  });
  it('a sapling grows into an oak (4–6 logs + canopy), grass below turns to dirt', () => {
    const w = new FakeWorld();
    w.setBlock(0, 10, 0, BlockId.Grass); w.setBlock(0, 11, 0, BlockId.Sapling);
    expect(growOak(w, 0, 11, 0, () => 0.5)).toBe(true);
    const logs = count(w, BlockId.Log);
    expect(logs).toBeGreaterThanOrEqual(4); expect(logs).toBeLessThanOrEqual(6);
    expect(w.getBlock(0, 11, 0)).toBe(BlockId.Log);
    expect(w.getBlock(0, 10, 0)).toBe(BlockId.Dirt);
    expect(count(w, BlockId.Leaves)).toBeGreaterThan(30);
    expect(count(w, BlockId.Sapling)).toBe(0);
  });
  it('no room → the sapling waits', () => {
    const w = new FakeWorld();
    w.setBlock(0, 10, 0, BlockId.Grass); w.setBlock(0, 11, 0, BlockId.Sapling); w.setBlock(0, 14, 0, BlockId.Stone);
    expect(growOak(w, 0, 11, 0, () => 0.5)).toBe(false);
    expect(w.getBlock(0, 11, 0)).toBe(BlockId.Sapling);
  });
  it('tree does not overwrite existing solid blocks in the canopy', () => {
    const w = new FakeWorld();
    w.setBlock(0, 10, 0, BlockId.Grass); w.setBlock(0, 11, 0, BlockId.Sapling); w.setBlock(2, 14, 0, BlockId.Planks);
    expect(growOak(w, 0, 11, 0, () => 0.5)).toBe(true);
    expect(w.getBlock(2, 14, 0)).toBe(BlockId.Planks);
  });
});

describe('it17 gravel gravity', () => {
  it('gravel is a gravity block and falls like sand; sand lands through tall grass', () => {
    expect(isGravityBlock(BlockId.Gravel)).toBe(true);
    const w = new FakeWorld();
    w.setBlock(0, 0, 0, BlockId.Stone); w.setBlock(0, 1, 0, BlockId.TallGrass);
    w.setBlock(0, 6, 0, BlockId.Gravel);
    updateGravityAround(w, 0, 6, 0);
    expect(w.getBlock(0, 1, 0)).toBe(BlockId.Gravel);
    expect(w.getBlock(0, 6, 0)).toBe(0);
  });
});

import { LeafDecay } from '../src/world/leafdecay';
describe('it17 leaf decay persistence', () => {
  it('pending decays survive toJSON/loadJSON with their remaining time', () => {
    const w = { b: new Map<string, number>(), getBlock(x: number, y: number, z: number) { return this.b.get(`${x},${y},${z}`) ?? 0; },
      setBlock(x: number, y: number, z: number, id: number) { const k = `${x},${y},${z}`; if (id) this.b.set(k, id); else this.b.delete(k); return true; },
      getWaterLevel() { return 0; } };
    for (let x = 0; x < 3; x++) w.setBlock(x, 5, 0, BlockId.Leaves);
    const a = new LeafDecay();
    a.onRemoved(w, 0, 4, 0, () => 0.5); // 2 + 9 = 11 s
    expect(a.pending.length).toBe(3);
    a.update(5, w);
    const saved = JSON.parse(JSON.stringify(a.toJSON()));
    const b = new LeafDecay();
    b.loadJSON(saved);
    expect(b.pending.length).toBe(3);
    expect(b.update(5, w).length).toBe(0); // 10 s total: not yet
    expect(b.update(2, w).length).toBe(3); // 12 s: gone
    expect(w.b.size).toBe(0);
  });
});

describe('it17 leaf decay waits for unloaded chunks', () => {
  it('a due decay in a not-yet-loaded chunk is kept, then runs once the chunk is there', () => {
    let loaded = false;
    const w = { b: new Map<string, number>([['0,5,0', BlockId.Leaves]]),
      getBlock(x: number, y: number, z: number) { return loaded ? (this.b.get(`${x},${y},${z}`) ?? 0) : 0; },
      setBlock(x: number, y: number, z: number, id: number) { const k = `${x},${y},${z}`; if (id) this.b.set(k, id); else this.b.delete(k); return true; },
      getWaterLevel() { return 0; }, hasChunkAt() { return loaded; } };
    const d = new LeafDecay();
    d.loadJSON([[0, 5, 0, 0.5]]);
    expect(d.update(1, w).length).toBe(0);
    expect(d.pending.length).toBe(1);
    loaded = true;
    expect(d.update(1.5, w).length).toBe(1);
    expect(w.b.size).toBe(0);
  });
});

import { matchRecipe } from '../src/items/crafting';
describe('it17 arrow recipe (MC)', () => {
  it('flint + stick + feather → 4 arrows; cobble no longer works', () => {
    const g = (top: number) => [top, 0, 0, ItemId.Stick, 0, 0, ItemId.Feather, 0, 0].map((id) => (id ? { id, count: 1 } : null));
    const r = matchRecipe(g(ItemId.Flint));
    expect(r?.result.id).toBe(ItemId.Arrow);
    expect(r?.result.count).toBe(4);
    expect(matchRecipe(g(ItemId.Cobble))?.result.id).not.toBe(ItemId.Arrow);
  });
});

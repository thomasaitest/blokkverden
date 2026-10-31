import { describe, it, expect } from 'vitest';
import { BlockId } from '../src/blocks/types';
import { FallingBlocks } from '../src/world/fallingBlocks';
import { growDoubleGrass } from '../src/world/doubleGrass';
import { dropForBlock, breakDuration, ITEMS, ItemId } from '../src/items/types';
import { matchRecipe } from '../src/items/crafting';

class FakeWorld {
  b = new Map<string, number>();
  getBlock(x: number, y: number, z: number) { return this.b.get(`${x},${y},${z}`) ?? 0; }
  setBlock(x: number, y: number, z: number, id: number) { const k = `${x},${y},${z}`; if (id) this.b.set(k, id); else this.b.delete(k); return true; }
}
const run = (f: FallingBlocks, w: FakeWorld, secs: number, onPop?: (x: number, y: number, z: number, id: number) => void) => { for (let t = 0; t < secs; t += 1 / 60) f.step(1 / 60, w, undefined, onPop); };

describe('it22 falling blocks: vacated cells + double grass', () => {
  it('reports every vacated cell (bottom-up) so whatever sat on the column can pop', () => {
    const w = new FakeWorld();
    w.setBlock(0, 0, 0, BlockId.Stone);
    for (let y = 2; y <= 4; y++) w.setBlock(0, y, 0, BlockId.Sand);
    w.setBlock(0, 5, 0, BlockId.Torch);
    const f = new FallingBlocks(); const vac: number[] = [];
    expect(f.updateAround(w, 0, 1, 0, (_x, y) => vac.push(y))).toBe(3);
    expect(vac).toEqual([2, 3, 4]);
  });
  it('sand falls through both halves of double tall grass and destroys the whole plant', () => {
    const w = new FakeWorld();
    w.setBlock(0, 0, 0, BlockId.Grass);
    w.setBlock(0, 1, 0, BlockId.TallGrass);
    expect(growDoubleGrass(w, 0, 1, 0)).toBe(true);
    w.setBlock(0, 6, 0, BlockId.Sand);
    const f = new FallingBlocks(); const pops: number[] = [];
    f.updateAround(w, 0, 6, 0);
    run(f, w, 3, (_x, _y, _z, id) => pops.push(id));
    expect(pops).toEqual([]);
    expect(w.getBlock(0, 1, 0)).toBe(BlockId.Sand);
    expect(w.getBlock(0, 2, 0)).toBe(0);
  });
});

describe('it22 shears (MC)', () => {
  const shears = { id: ItemId.Shears, count: 1 };
  it('is crafted from two iron ingots on either diagonal', () => {
    const I = { id: ItemId.IronIngot, count: 1 };
    expect(matchRecipe([null, I, I, null])?.result.id).toBe(ItemId.Shears);
    expect(matchRecipe([I, null, null, I])?.result.id).toBe(ItemId.Shears);
    expect(matchRecipe([I, I, null, null])?.result.id).not.toBe(ItemId.Shears);
    expect(ITEMS[ItemId.Shears].maxDurability).toBe(238);
  });
  it('keeps leaves and grass as themselves', () => {
    for (let i = 0; i < 50; i++) {
      expect(dropForBlock(BlockId.Leaves, shears)).toEqual({ id: BlockId.Leaves, count: 1 });
      expect(dropForBlock(BlockId.TallGrass, shears)).toEqual({ id: BlockId.TallGrass, count: 1 });
      expect(dropForBlock(BlockId.DoubleGrass, shears)).toEqual({ id: BlockId.TallGrass, count: 2 });
    }
    // without shears: leaves never drop themselves
    for (let i = 0; i < 200; i++) expect(dropForBlock(BlockId.Leaves, null)?.id).not.toBe(BlockId.Leaves);
  });
  it('cuts leaves ×15 and wool ×5 faster than by hand', () => {
    expect(breakDuration(BlockId.Leaves, shears)).toBeCloseTo(breakDuration(BlockId.Leaves, null) / 15);
    expect(breakDuration(BlockId.Wool, shears)).toBeCloseTo(breakDuration(BlockId.Wool, null) / 5);
    expect(breakDuration(BlockId.Stone, shears)).toBe(breakDuration(BlockId.Stone, null));
  });
  it('tall grass is a placeable item', () => {
    expect(ITEMS[BlockId.TallGrass].placeBlock).toBe(BlockId.TallGrass);
  });
});

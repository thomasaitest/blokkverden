import { describe, it, expect } from 'vitest';
import { BlockId } from '../src/blocks/types';
import { World } from '../src/world/world';
import { ITEMS, ItemId } from '../src/items/types';
import { matchRecipe } from '../src/items/crafting';
import { fluidRaycast, scoop, pour, pourable, BUCKET, WATER_BUCKET, LAVA_BUCKET } from '../src/items/bucket';
import { createFurnace, tickFurnace } from '../src/items/furnace';
import { createPlayer, movePlayer } from '../src/player/physics';

function flat(): World {
  const w = new World(3); w.ensureChunk(0, 0);
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) { w.setBlock(x, 20, z, BlockId.Stone); for (let y = 21; y < 30; y++) w.setBlock(x, y, z, BlockId.Air); }
  return w;
}
const I = ItemId.IronIngot;

describe('it23 buckets', () => {
  it('bucket = 3 iron ingots in a V (in a 3×3 table, top or bottom rows)', () => {
    const top = [I, 0, I, 0, I, 0, 0, 0, 0].map((id) => (id ? { id, count: 1 } : null));
    const bot = [0, 0, 0, I, 0, I, 0, I, 0].map((id) => (id ? { id, count: 1 } : null));
    expect(matchRecipe(top)?.result.id).toBe(BUCKET);
    expect(matchRecipe(bot)?.result.id).toBe(BUCKET);
    expect(ITEMS[BUCKET].maxStack).toBe(16);
    expect(ITEMS[WATER_BUCKET].maxStack).toBe(1);
    expect(ITEMS[ItemId.Bucket].name).toBe('Bøtte');
  });

  it('scoops a water source, not flowing water; scoops lava', () => {
    const w = flat();
    w.setWater(5, 21, 5, 7); w.setWater(5, 21, 6, 5); w.setBlock(5, 21, 8, BlockId.Lava);
    // looking straight down from above
    expect(fluidRaycast(w, 5.5, 23.5, 6.5, 0, -1, 0)).toBeNull(); // flowing (level 5) → hits stone below
    const h = fluidRaycast(w, 5.5, 23.5, 5.5, 0, -1, 0)!;
    expect(h).toMatchObject({ x: 5, y: 21, z: 5, id: BlockId.Water });
    expect(scoop(w, h)).toBe(WATER_BUCKET);
    expect(w.getBlock(5, 21, 5)).toBe(BlockId.Air);
    const l = fluidRaycast(w, 5.5, 23.5, 8.5, 0, -1, 0)!;
    expect(scoop(w, l)).toBe(LAVA_BUCKET);
    expect(w.getBlock(5, 21, 8)).toBe(BlockId.Air);
    // a block in the way blocks the scoop
    w.setWater(9, 21, 9, 7); w.setBlock(9, 22, 9, BlockId.Glass);
    expect(fluidRaycast(w, 9.5, 23.5, 9.5, 0, -1, 0)).toBeNull();
  });

  it('pours a water source (level 7) and lava; replaces plants and fire; won\'t pour into solids', () => {
    const w = flat();
    expect(pour(w, WATER_BUCKET, 3, 21, 3, false)).toBe('placed');
    expect(w.getBlock(3, 21, 3)).toBe(BlockId.Water);
    expect(w.getWaterLevel(3, 21, 3)).toBe(7);
    expect(pour(w, LAVA_BUCKET, 7, 21, 7, false)).toBe('placed');
    expect(w.getBlock(7, 21, 7)).toBe(BlockId.Lava);
    w.setBlock(4, 21, 4, BlockId.TallGrass);
    const replaced: number[] = [];
    expect(pour(w, WATER_BUCKET, 4, 21, 4, false, (id) => replaced.push(id))).toBe('placed');
    expect(replaced).toEqual([BlockId.TallGrass]);
    expect(w.getBlock(4, 21, 4)).toBe(BlockId.Water);
    w.setBlock(10, 21, 10, BlockId.Fire);
    expect(pour(w, WATER_BUCKET, 10, 21, 10, false)).toBe('placed');
    expect(w.getBlock(10, 21, 10)).toBe(BlockId.Water);
    expect(pour(w, WATER_BUCKET, 3, 20, 3, false)).toBeNull(); // stone
    expect(pourable(w, 7, 21, 7, BlockId.Water)).toBe(false); // into lava: no
    expect(pour(w, LAVA_BUCKET, 3, 21, 3, false)).toBeNull(); // lava into water: no
    expect(pour(w, BUCKET, 12, 21, 12, false)).toBeNull();
  });

  it('water boils away in Helvete (nothing placed)', () => {
    const w = flat();
    expect(pour(w, WATER_BUCKET, 3, 21, 3, true)).toBe('boiled');
    expect(w.getBlock(3, 21, 3)).toBe(BlockId.Air);
    expect(pour(w, LAVA_BUCKET, 3, 21, 3, true)).toBe('placed');
  });

  it('scoop → pour round trip, and poured water lets you swim', () => {
    const w = flat();
    pour(w, WATER_BUCKET, 6, 21, 6, false);
    const p = createPlayer(6.5, 21, 6.5);
    movePlayer(p, w, 0, 0, false, 1 / 60);
    expect(p.inWater).toBe(true);
  });

  it('a lava bucket burns 1000 s in a furnace and leaves the empty bucket', () => {
    const f = createFurnace();
    f.input = { id: BlockId.Cobble, count: 64 };
    f.fuel = { id: LAVA_BUCKET, count: 1 };
    tickFurnace(f, 0.05);
    expect(f.burnMax).toBe(20000);
    expect(f.fuel).toEqual({ id: BUCKET, count: 1 });
    expect(ITEMS[LAVA_BUCKET].fuel).toBe(20000);
  });
});

import { tickWater } from '../src/world/water';
describe('it23 flowing water dries up (MC)', () => {
  it('poured water spreads, and once the source is scooped up the flow disappears', () => {
    const w = flat();
    pour(w, WATER_BUCKET, 8, 21, 8, false);
    for (let i = 0; i < 12; i++) tickWater(w, 400, undefined, { x: 8, z: 8 });
    expect(w.getBlock(10, 21, 8)).toBe(BlockId.Water);
    expect(w.getWaterLevel(9, 21, 8)).toBe(6);
    const h = fluidRaycast(w, 8.5, 23.5, 8.5, 0, -1, 0)!;
    expect(scoop(w, h)).toBe(WATER_BUCKET);
    for (let i = 0; i < 20; i++) tickWater(w, 400, undefined, { x: 8, z: 8 });
    let left = 0;
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) if (w.getBlock(x, 21, z) === BlockId.Water) left++;
    expect(left).toBe(0);
  });
  it('a source keeps its flow (no flicker): levels stay put over many ticks', () => {
    const w = flat();
    pour(w, WATER_BUCKET, 8, 21, 8, false);
    for (let i = 0; i < 12; i++) tickWater(w, 400, undefined, { x: 8, z: 8 });
    const snap = () => { const a: number[] = []; for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) a.push(w.getBlock(x, 21, z) === BlockId.Water ? w.getWaterLevel(x, 21, z) : 0); return a.join(','); };
    const s1 = snap();
    for (let i = 0; i < 10; i++) tickWater(w, 400, undefined, { x: 8, z: 8 });
    expect(snap()).toBe(s1);
    expect(w.getWaterLevel(8, 21, 8)).toBe(7);
  });
});

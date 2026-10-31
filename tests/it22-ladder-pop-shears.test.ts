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

import { MobSystem } from '../src/mobs/system';
describe('it22 shearing sheep (MC)', () => {
  it('shears give 1–3 wool once; a shorn sheep gives nothing more', () => {
    const ms = new MobSystem();
    const spawned: number[] = [];
    const drops = { spawn: (_x: number, _y: number, _z: number, s: { id: number; count: number }) => spawned.push(s.id) } as any;
    const sheep = { kind: 'sau', hp: 8, x: 0, y: 1, z: 0 } as any;
    const n = ms.shear(sheep, drops, () => 0.99);
    expect(n).toBe(3);
    expect(spawned).toEqual([ItemId.WoolItem, ItemId.WoolItem, ItemId.WoolItem]);
    expect(sheep.sheared).toBe(true);
    expect(ms.shear(sheep, drops)).toBe(0);
    expect(ms.shear({ kind: 'gris', hp: 10, x: 0, y: 1, z: 0 } as any, drops)).toBe(0);
    expect(ms.shear({ kind: 'sau', hp: 8, x: 0, y: 1, z: 0 } as any, drops, () => 0)).toBe(1);
  });
});

import { createPlayer, movePlayer } from '../src/player/physics';
describe('it22 fences are 1.5 tall (MC)', () => {
  const fenceWorld = (gateOpen = false): any => ({
    getBlock: (x: number, y: number, z: number) => (y === 45 ? BlockId.Grass : y === 46 && z === 8 ? (x === 4 ? BlockId.Gate : BlockId.Fence) : 0),
    getWaterLevel: (x: number, y: number, z: number) => (gateOpen && x === 4 && y === 46 && z === 8 ? 1 : 0),
    hasChunkAt: () => true,
  });
  it('walking + jumping into a fence line never gets you over it (no mid-air step-up onto the fence)', () => {
    const p = createPlayer(6.5, 46.0, 10.5);
    for (let i = 0; i < 400; i++) movePlayer(p, fenceWorld(), 0, -1, i < 320 && i % 20 < 3, 1 / 60);
    expect(p.z).toBeGreaterThan(9.2);
    expect(p.y).toBeLessThan(46.5);
  });
  it('a closed gate blocks like the fence; an open gate lets you through', () => {
    const p = createPlayer(4.5, 46.0, 10.5);
    for (let i = 0; i < 300; i++) movePlayer(p, fenceWorld(false), 0, -1, i % 20 < 3, 1 / 60);
    expect(p.z).toBeGreaterThan(9.2);
    const q = createPlayer(4.5, 46.0, 10.5);
    for (let i = 0; i < 300; i++) movePlayer(q, fenceWorld(true), 0, -1, false, 1 / 60);
    expect(q.z).toBeLessThan(7);
  });
});

describe('it22 jump arc + landing are frame-rate independent', () => {
  const flat: any = { getBlock: (_x: number, y: number) => (y === 45 ? BlockId.Grass : 0), getWaterLevel: () => 0, hasChunkAt: () => true };
  for (const dt of [1 / 144, 1 / 60, 1 / 30, 0.05]) {
    it(`dt=${dt.toFixed(3)}: apex ≈ 1.27 blocks and you land exactly on the ground`, () => {
      const p = createPlayer(0.5, 46, 0.5);
      let maxY = 0; const lands: number[] = [];
      for (let t = 0; t < 3; t += dt) {
        const g = p.onGround;
        movePlayer(p, flat, 0, 0, (t % 0.5) < 0.1, dt);
        if (!g && p.onGround) lands.push(p.y);
        maxY = Math.max(maxY, p.y);
      }
      expect(maxY - 46).toBeGreaterThan(1.2);
      expect(maxY - 46).toBeLessThan(1.3);
      expect(lands.length).toBeGreaterThan(2);
      for (const y of lands) expect(y).toBeCloseTo(46, 2);
    });
  }
});

describe('it22 step-up still works next to a fence', () => {
  it('walking along a fence line you still step up a 1-block ledge', () => {
    // fence line along x=3 (z 0..20); a stone ledge at y=46 from z ≤ 5; walk −Z at x=4.5 (box 4.2..4.8, not over the fence)
    const w: any = {
      getBlock: (x: number, y: number, z: number) => (y === 45 ? BlockId.Grass : y === 46 && x === 3 ? BlockId.Fence : y === 46 && z <= 5 && x >= 4 ? BlockId.Stone : 0),
      getWaterLevel: () => 0, hasChunkAt: () => true,
    };
    const p = createPlayer(4.5, 46, 9.5);
    for (let i = 0; i < 120; i++) movePlayer(p, w, 0, -1, false, 1 / 60);
    expect(p.y).toBeCloseTo(47, 1);
    expect(p.z).toBeLessThan(6);
  });
});

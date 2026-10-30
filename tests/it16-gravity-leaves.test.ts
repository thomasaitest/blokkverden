import { describe, it, expect } from 'vitest';
import { BlockId } from '../src/blocks/types';
import { updateGravityAround } from '../src/world/gravity';
import { LeafDecay, leafSupported, LEAF_PERSISTENT } from '../src/world/leafdecay';
import { dropForBlock, ItemId } from '../src/items/types';

class FakeWorld {
  b = new Map<string, number>();
  m = new Map<string, number>();
  getBlock(x: number, y: number, z: number) { return this.b.get(`${x},${y},${z}`) ?? 0; }
  setBlock(x: number, y: number, z: number, id: number) { const k = `${x},${y},${z}`; if (id) this.b.set(k, id); else this.b.delete(k); this.m.delete(k); return true; }
  getWaterLevel(x: number, y: number, z: number) { return this.m.get(`${x},${y},${z}`) ?? 0; }
  setMeta(x: number, y: number, z: number, v: number) { this.m.set(`${x},${y},${z}`, v); }
}
function floor(w: FakeWorld, y: number) { for (let x = -8; x <= 8; x++) for (let z = -8; z <= 8; z++) w.setBlock(x, y, z, BlockId.Stone); }

describe('falling sand (MC gravity blocks)', () => {
  it('a sand tower falls when the block under it is broken', () => {
    const w = new FakeWorld(); floor(w, 0);
    w.setBlock(0, 1, 0, BlockId.Dirt);
    for (let y = 2; y <= 4; y++) w.setBlock(0, y, 0, BlockId.Sand);
    w.setBlock(0, 1, 0, BlockId.Air);
    expect(updateGravityAround(w, 0, 1, 0)).toBe(3);
    expect([1, 2, 3].map((y) => w.getBlock(0, y, 0))).toEqual([BlockId.Sand, BlockId.Sand, BlockId.Sand]);
    expect(w.getBlock(0, 4, 0)).toBe(0);
  });
  it('sand placed in mid-air drops to the ground, through water', () => {
    const w = new FakeWorld(); floor(w, 0);
    w.setBlock(0, 1, 0, BlockId.Water); w.setBlock(0, 2, 0, BlockId.Water);
    w.setBlock(0, 10, 0, BlockId.Sand);
    updateGravityAround(w, 0, 10, 0);
    expect(w.getBlock(0, 1, 0)).toBe(BlockId.Sand);
    expect(w.getBlock(0, 10, 0)).toBe(0);
  });
  it('sand on a solid block stays; sand on a torch pops as an item', () => {
    const w = new FakeWorld(); floor(w, 0);
    w.setBlock(0, 1, 0, BlockId.Sand);
    expect(updateGravityAround(w, 0, 1, 0)).toBe(0);
    w.setBlock(1, 1, 0, BlockId.Torch);
    w.setBlock(1, 5, 0, BlockId.Sand);
    const popped: number[] = [];
    updateGravityAround(w, 1, 5, 0, (_x, _y, _z, id) => popped.push(id));
    expect(popped).toEqual([BlockId.Sand]);
    expect(w.getBlock(1, 2, 0)).toBe(0);
    expect(w.getBlock(1, 1, 0)).toBe(BlockId.Torch);
  });
  it('other blocks (dirt, cobble) do not fall', () => {
    const w = new FakeWorld();
    w.setBlock(0, 5, 0, BlockId.Dirt);
    expect(updateGravityAround(w, 0, 5, 0)).toBe(0);
    expect(w.getBlock(0, 5, 0)).toBe(BlockId.Dirt);
  });
});

function tree(w: FakeWorld) {
  floor(w, 0);
  for (let y = 1; y <= 4; y++) w.setBlock(0, y, 0, BlockId.Log);
  for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) for (let y = 3; y <= 5; y++) {
    if (w.getBlock(x, y, z) === 0) w.setBlock(x, y, z, BlockId.Leaves);
  }
}

describe('leaf decay (MC)', () => {
  it('leaves connected to a log are supported', () => {
    const w = new FakeWorld(); tree(w);
    expect(leafSupported(w, 2, 5, 2)).toBe(true);
  });
  it('cutting the whole trunk makes the canopy decay over time', () => {
    const w = new FakeWorld(); tree(w);
    const d = new LeafDecay();
    for (let y = 1; y <= 4; y++) { w.setBlock(0, y, 0, 0); d.onRemoved(w, 0, y, 0, () => 0.5); }
    const leaves = () => [...w.b.values()].filter((v) => v === BlockId.Leaves).length;
    const before = leaves();
    expect(before).toBeGreaterThan(50);
    d.update(1, w);
    expect(leaves()).toBe(before); // not instant
    d.update(30, w);
    expect(leaves()).toBe(0);
  });
  it('leaves still touching another log within 6 do not decay; persistent leaves never decay', () => {
    const w = new FakeWorld(); tree(w);
    w.setBlock(2, 2, 2, BlockId.Log); // second trunk under a corner
    w.setBlock(-2, 5, -2, BlockId.Leaves); w.setMeta(-2, 5, -2, LEAF_PERSISTENT);
    const d = new LeafDecay();
    for (let y = 1; y <= 4; y++) { w.setBlock(0, y, 0, 0); d.onRemoved(w, 0, y, 0, () => 0); }
    d.update(60, w);
    expect(w.getBlock(2, 3, 2)).toBe(BlockId.Leaves); // next to the remaining log
    expect(w.getBlock(-2, 5, -2)).toBe(BlockId.Leaves); // player-placed
    // a leaf more than 6 steps away from the remaining log decayed
    expect(w.getBlock(-2, 3, -2)).toBe(0); // 9 steps from the remaining log → decayed
  });
  it('a log placed back before decay saves the leaves', () => {
    const w = new FakeWorld(); tree(w);
    const d = new LeafDecay();
    w.setBlock(0, 4, 0, 0); w.setBlock(0, 3, 0, 0); w.setBlock(0, 2, 0, 0); w.setBlock(0, 1, 0, 0);
    d.onRemoved(w, 0, 3, 0, () => 1);
    w.setBlock(0, 4, 0, BlockId.Log);
    d.update(60, w);
    expect(w.getBlock(1, 4, 0)).toBe(BlockId.Leaves);
  });
});

describe('leaf drops (MC oak rates)', () => {
  it('apple ≈0.5 %, sticks ≈2 %, usually nothing', () => {
    let apples = 0, sticks = 0, none = 0;
    const N = 40000;
    for (let i = 0; i < N; i++) {
      const d = dropForBlock(BlockId.Leaves, null);
      if (!d) none++; else if (d.id === ItemId.Apple) apples++; else if (d.id === ItemId.Stick) sticks++;
    }
    expect(apples / N).toBeGreaterThan(0.003); expect(apples / N).toBeLessThan(0.008);
    expect(sticks / N).toBeGreaterThan(0.014); expect(sticks / N).toBeLessThan(0.027);
    expect(none / N).toBeGreaterThan(0.96);
  });
});

import { createPlayer, movePlayer, headInSolid } from '../src/player/physics';
import { World } from '../src/world/world';

describe('sand on your head (MC suffocation)', () => {
  const setup = () => {
    const w = new World(3); w.ensureChunk(0, 0);
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) { w.setBlock(x, 20, z, BlockId.Stone); for (let y = 21; y < 30; y++) w.setBlock(x, y, z, 0); }
    const p = createPlayer(8.5, 21, 8.5);
    for (let i = 0; i < 30; i++) movePlayer(p, w, 0, 0, false, 1 / 60);
    return { w, p };
  };
  it('sand landing in the head cell traps the player (no lift through the block)', () => {
    const { w, p } = setup();
    w.setBlock(8, 22, 8, BlockId.Sand);
    for (let i = 0; i < 60; i++) movePlayer(p, w, 0, 0, false, 1 / 60);
    expect(p.y).toBeCloseTo(21, 1);
    expect(headInSolid(w, p.x, p.y, p.z)).toBe(true);
    w.setBlock(8, 22, 8, 0); // dug out
    expect(headInSolid(w, p.x, p.y, p.z)).toBe(false);
  });
  it('sand in the feet cell still pushes the player up onto it', () => {
    const { w, p } = setup();
    w.setBlock(8, 21, 8, BlockId.Sand);
    for (let i = 0; i < 60; i++) movePlayer(p, w, 0, 0, false, 1 / 60);
    expect(p.y).toBeCloseTo(22, 1);
  });
  it('glass/leaves/slabs in the head cell do not suffocate', () => {
    const { w, p } = setup();
    for (const id of [BlockId.Glass, BlockId.Leaves, BlockId.Slab]) { w.setBlock(8, 22, 8, id); expect(headInSolid(w, p.x, p.y, p.z)).toBe(false); }
  });
});

import { lightCurve } from '../src/world/mesher';
describe('light curve (it16)', () => {
  it('dark caves near-black, torch-lit mid range at least as bright as before, full sky = 1', () => {
    expect(lightCurve(0)).toBeLessThan(0.06);
    expect(lightCurve(7)).toBeGreaterThan(0.3);
    expect(lightCurve(15)).toBeCloseTo(1, 5);
    for (let l = 1; l <= 15; l++) expect(lightCurve(l)).toBeGreaterThan(lightCurve(l - 1));
  });
});

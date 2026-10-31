import { describe, it, expect } from 'vitest';
import { BlockId } from '../src/blocks/types';
import { FireSystem, openToSky, lavaIgnite, burnTick, createBurnState } from '../src/world/fire';
import { selectionBox } from '../src/world/outline';
import { DOOR_FACING_SHIFT, DOOR_THICKNESS } from '../src/world/doors';

class FakeWorld {
  b = new Map<string, number>();
  getBlock(x: number, y: number, z: number) { return this.b.get(`${x},${y},${z}`) ?? 0; }
  setBlock(x: number, y: number, z: number, id: number) { const k = `${x},${y},${z}`; if (id) this.b.set(k, id); else this.b.delete(k); return true; }
}
const count = (w: FakeWorld, id: number) => [...w.b.values()].filter((v) => v === id).length;
function lcg(seed = 7) { let s = seed; return () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296); }
function floor(w: FakeWorld, id = BlockId.Stone) { for (let x = -6; x <= 6; x++) for (let z = -6; z <= 6; z++) w.setBlock(x, 9, z, id); }

describe('it20 rain puts out fire (MC)', () => {
  it('exposed fire goes out within ~2 s of rain; covered fire and helstein fire keep burning', () => {
    const w = new FakeWorld(); floor(w);
    w.setBlock(3, 9, 0, BlockId.Helstein);
    const f = new FireSystem(); const rng = lcg(3);
    f.ignite(w, 0, 10, 0, rng); // open sky
    f.ignite(w, 2, 10, 0, rng); w.setBlock(2, 14, 0, BlockId.Stone); // roof
    f.ignite(w, 3, 10, 0, rng); // eternal
    expect(openToSky(w, 0, 10, 0)).toBe(true);
    expect(openToSky(w, 2, 10, 0)).toBe(false);
    const rained = (x: number, y: number, z: number) => openToSky(w, x, y, z);
    let t = 0;
    for (; t < 2.5 && w.getBlock(0, 10, 0) === BlockId.Fire; t += 1 / 20) f.update(1 / 20, w, rng, rained);
    expect(w.getBlock(0, 10, 0)).toBe(0);
    expect(t).toBeLessThan(2.5);
    expect(w.getBlock(2, 10, 0)).toBe(BlockId.Fire); // roofed: still burning (life ≥ 3 s)
    for (let i = 0; i < 200; i++) f.update(1 / 20, w, rng, rained);
    expect(w.getBlock(3, 10, 0)).toBe(BlockId.Fire);
  });
  it('without rain the same fire is unaffected for its normal lifetime', () => {
    const w = new FakeWorld(); floor(w);
    const f = new FireSystem(); const rng = lcg(5);
    f.ignite(w, 0, 10, 0, rng);
    for (let i = 0; i < 40; i++) f.update(1 / 20, w, rng); // 2 s < min life 3 s
    expect(w.getBlock(0, 10, 0)).toBe(BlockId.Fire);
  });
});

describe('it20 lava sets fire to flammable things (MC)', () => {
  it('lava next to a wooden wall eventually lights it; lava among stone never makes fire', () => {
    const w = new FakeWorld(); floor(w);
    w.setBlock(0, 10, 0, BlockId.Lava);
    for (let y = 10; y <= 12; y++) for (let z = -1; z <= 1; z++) w.setBlock(1, y, z, BlockId.Planks);
    const f = new FireSystem(); const rng = lcg(11);
    let lit = 0;
    for (let i = 0; i < 60 && !lit; i++) lit += lavaIgnite(f, w, 0, 10, 0, rng).length;
    expect(lit).toBeGreaterThan(0);
    expect(count(w, BlockId.Fire)).toBeGreaterThan(0);

    const s = new FakeWorld(); floor(s);
    s.setBlock(0, 10, 0, BlockId.Lava);
    const f2 = new FireSystem(); const r2 = lcg(2);
    for (let i = 0; i < 300; i++) lavaIgnite(f2, s, 0, 10, 0, r2);
    expect(count(s, BlockId.Fire)).toBe(0);
  });
  it('lava does not light things through a solid ceiling', () => {
    const w = new FakeWorld(); floor(w);
    w.setBlock(0, 10, 0, BlockId.Lava);
    for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) w.setBlock(x, 11, z, BlockId.Stone);
    for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) w.setBlock(x, 13, z, BlockId.Planks);
    const f = new FireSystem(); const rng = lcg(9);
    for (let i = 0; i < 300; i++) lavaIgnite(f, w, 0, 10, 0, rng);
    expect(count(w, BlockId.Fire)).toBe(0);
  });
});

describe('it20 burn ticks used for mobs', () => {
  it('lava kills a 10-hp pig in ~1.5 s; fire then burning keeps hurting, water stops it', () => {
    const s = createBurnState(); let hp = 10, t = 0;
    while (hp > 0 && t < 5) { hp -= burnTick(s, false, true, false, 1 / 20); t += 1 / 20; }
    expect(t).toBeLessThan(1.6);
    const b = createBurnState(); let d = 0;
    for (let i = 0; i < 20; i++) d += burnTick(b, true, false, false, 1 / 20);
    for (let i = 0; i < 40; i++) d += burnTick(b, false, false, false, 1 / 20);
    expect(d).toBe(4); // 2 in fire + 2 burning
    burnTick(b, false, false, true, 1 / 20);
    expect(b.burnTime).toBe(0);
  });
});

describe('it20 selection outline shape (MC)', () => {
  it('door outline is a thin 2-tall panel matching its collision; slab half; plants small; others full', () => {
    const closed = selectionBox(BlockId.Door, 0 << DOOR_FACING_SHIFT);
    expect(closed[4] - closed[1]).toBe(2);
    expect(Math.min(closed[3] - closed[0], closed[5] - closed[2])).toBeCloseTo(DOOR_THICKNESS);
    const open = selectionBox(BlockId.Door, 1);
    expect(open[3] - open[0]).toBeCloseTo(DOOR_THICKNESS);
    expect(selectionBox(BlockId.Slab, 0)[4]).toBe(0.5);
    const fl = selectionBox(BlockId.Poppy, 0);
    expect(fl[3] - fl[0]).toBeLessThan(0.5); expect(fl[4]).toBeLessThan(0.7);
    expect(selectionBox(BlockId.TallGrass, 0)[4]).toBeLessThan(1);
    expect(selectionBox(BlockId.Crop, 0, 0)[4]).toBeLessThan(selectionBox(BlockId.Crop, 7, 7)[4]);
    expect(selectionBox(BlockId.Stone, 0)).toEqual([0, 0, 0, 1, 1, 1]);
  });
});

import { meshChunk } from '../src/world/mesher';
import { Chunk } from '../src/world/chunk';
describe('it20 torch model (MC thin stick)', () => {
  it('a torch is one thin 2/16 stick, 12/16 tall (5 quads), not a cube with the picture on every face', () => {
    const c = new Chunk(0, 0); c.generated = true;
    c.set(3, 5, 3, BlockId.Torch);
    const get = (x: number, y: number, z: number) => (x === 3 && y === 5 && z === 3 ? BlockId.Torch : BlockId.Air);
    const m = meshChunk(c, get, () => 15).transparent;
    const pos = m.positions;
    expect(pos.length / 3).toBe(20);
    for (let i = 0; i < pos.length; i += 3) {
      expect(pos[i] - 3).toBeGreaterThanOrEqual(7 / 16 - 1e-6); expect(pos[i] - 3).toBeLessThanOrEqual(9 / 16 + 1e-6);
      expect(pos[i + 1] - 5).toBeLessThanOrEqual(12 / 16 + 1e-6);
    }
    const ob = selectionBox(BlockId.Torch, 0);
    expect(ob[3] - ob[0]).toBeLessThan(0.3);
  });
});

import { describe, it, expect } from 'vitest';
import { BlockId, BLOCKS, collidesBlock, isCrossPlant, isFlower, isReplaceable } from '../src/blocks/types';
import { needsSupportBelow } from '../src/world/gravity';
import { applyBoneMeal, boneMealTarget } from '../src/world/bonemeal';
import { dropForBlock, ItemId, ITEMS, stack } from '../src/items/types';
import { matchRecipe } from '../src/items/crafting';
import { isWashable, tickWater } from '../src/world/water';
import { World } from '../src/world/world';
import { Chunk, chunkKey } from '../src/world/chunk';
import { averageTileColor, ATLAS_W, ATLAS_H, COLS } from '../src/blocks/textures';

class FakeWorld {
  b = new Map<string, number>();
  m = new Map<string, number>();
  getBlock(x: number, y: number, z: number) { return this.b.get(`${x},${y},${z}`) ?? 0; }
  setBlock(x: number, y: number, z: number, id: number) { const k = `${x},${y},${z}`; this.m.delete(k); if (id) this.b.set(k, id); else this.b.delete(k); return true; }
  getWaterLevel(x: number, y: number, z: number) { return this.m.get(`${x},${y},${z}`) ?? 0; }
  setMeta(x: number, y: number, z: number, v: number) { this.m.set(`${x},${y},${z}`, v); }
}
const count = (w: FakeWorld, id: number) => [...w.b.values()].filter((v) => v === id).length;

describe('it18 bone meal (MC)', () => {
  it('1 bone → 3 bone meal', () => {
    const r = matchRecipe([stack(ItemId.Bone), null, null, null]);
    expect(r?.result.id).toBe(ItemId.BoneMeal);
    expect(r?.result.count).toBe(3);
    expect(ITEMS[ItemId.BoneMeal].placeBlock).toBeUndefined();
  });
  it('crop: +2–5 stages, capped at 7; ripe crop is not a target', () => {
    for (let i = 0; i < 200; i++) {
      const w = new FakeWorld();
      w.setBlock(0, 5, 0, BlockId.Crop); w.setMeta(0, 5, 0, 1);
      expect(applyBoneMeal(w, 0, 5, 0)).toBe(true);
      const s = w.getWaterLevel(0, 5, 0);
      expect(s).toBeGreaterThanOrEqual(3); expect(s).toBeLessThanOrEqual(6);
    }
    const w = new FakeWorld();
    w.setBlock(0, 5, 0, BlockId.Crop); w.setMeta(0, 5, 0, 6);
    applyBoneMeal(w, 0, 5, 0, () => 0.99);
    expect(w.getWaterLevel(0, 5, 0)).toBe(7);
    expect(boneMealTarget(w, 0, 5, 0)).toBeNull();
    expect(applyBoneMeal(w, 0, 5, 0)).toBe(false);
  });
  it('sapling: grows ~45 % of uses, always used up', () => {
    let grew = 0; const N = 2000;
    for (let i = 0; i < N; i++) {
      const w = new FakeWorld();
      w.setBlock(0, 10, 0, BlockId.Grass); w.setBlock(0, 11, 0, BlockId.Sapling);
      expect(applyBoneMeal(w, 0, 11, 0)).toBe(true);
      if (w.getBlock(0, 11, 0) === BlockId.Log) grew++;
    }
    expect(grew / N).toBeGreaterThan(0.40); expect(grew / N).toBeLessThan(0.50);
  });
  it('grass block: tall grass (and some flowers) around; not on stone / covered grass', () => {
    const w = new FakeWorld();
    for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) w.setBlock(x, 10, z, BlockId.Grass);
    expect(applyBoneMeal(w, 0, 10, 0)).toBe(true);
    expect(w.getBlock(0, 11, 0)).toBe(BlockId.TallGrass);
    expect(count(w, BlockId.TallGrass) + count(w, BlockId.Dandelion) + count(w, BlockId.Poppy)).toBeGreaterThan(3);
    for (const [k, v] of w.b) if (v !== BlockId.Grass) { const [x, y, z] = k.split(',').map(Number); expect(y).toBe(11); expect(Math.abs(x)).toBeLessThanOrEqual(3); expect(Math.abs(z)).toBeLessThanOrEqual(3); }
    let flowers = 0;
    for (let i = 0; i < 300; i++) {
      const g = new FakeWorld();
      for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) g.setBlock(x, 10, z, BlockId.Grass);
      applyBoneMeal(g, 0, 10, 0); flowers += count(g, BlockId.Dandelion) + count(g, BlockId.Poppy);
    }
    expect(flowers).toBeGreaterThan(0);
    const s = new FakeWorld(); s.setBlock(0, 10, 0, BlockId.Stone);
    expect(applyBoneMeal(s, 0, 10, 0)).toBe(false);
    const c = new FakeWorld(); c.setBlock(0, 10, 0, BlockId.Grass); c.setBlock(0, 11, 0, BlockId.Dirt);
    expect(applyBoneMeal(c, 0, 10, 0)).toBe(false);
  });
});

describe('it18 flowers', () => {
  it('dandelion/poppy: cross plants, no collision, need support, drop themselves, placeable', () => {
    for (const id of [BlockId.Dandelion, BlockId.Poppy]) {
      expect(isCrossPlant(id)).toBe(true);
      expect(isFlower(id)).toBe(true);
      expect(isReplaceable(id)).toBe(false);
      expect(collidesBlock(id, 0, 0, 0, 0, 0, 1, 1, 0, 1)).toBe(false);
      expect(needsSupportBelow(id)).toBe(true);
      expect(isWashable(id)).toBe(true);
      expect(BLOCKS[id].opaque).toBe(false);
      expect(dropForBlock(id, null)?.id).toBe(id);
      expect(ITEMS[id].placeBlock).toBe(id);
    }
  });
  it('world gen places some flowers on grass', () => {
    const w = new World(7);
    let n = 0;
    for (let cx = -3; cx <= 3; cx++) for (let cz = -3; cz <= 3; cz++) {
      const c = w.ensureChunk(cx, cz);
      for (let i = 0; i < c.blocks.length; i++) if (isFlower(c.blocks[i])) {
        n++;
        const lx = i % 16, lz = Math.floor(i / 16) % 16, y = Math.floor(i / 256);
        expect(c.get(lx, y - 1, lz)).toBe(BlockId.Grass);
      }
    }
    expect(n).toBeGreaterThan(0);
  });
});

describe('it18 water washes plants (MC)', () => {
  it('flowing water breaks torch / tall grass / crop / flower and reports it', () => {
    const w = new World(1);
    w.chunks.clear();
    const c = new Chunk(100, 100);
    w.chunks.set(chunkKey(100, 100), c);
    const ox = 1600, oz = 1600, y = 20;
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) c.set(x, y - 1, z, BlockId.Stone);
    c.set(1, y, 1, BlockId.Water);
    c.set(2, y, 1, BlockId.TallGrass);
    c.set(1, y, 2, BlockId.Torch);
    c.set(0, y, 1, BlockId.Poppy);
    const washed: number[] = [];
    tickWater(w, 80, (_x, _y, _z, id) => washed.push(id));
    expect(washed.sort()).toEqual([BlockId.Torch, BlockId.TallGrass, BlockId.Poppy].sort());
    expect(w.getBlock(ox + 2, y, oz + 1)).toBe(BlockId.Water);
    expect(w.getBlock(ox + 1, y, oz + 2)).toBe(BlockId.Water);
    expect(w.getBlock(ox, y, oz + 1)).toBe(BlockId.Water);
    expect(isWashable(BlockId.Crop)).toBe(true);
    expect(isWashable(BlockId.Stone)).toBe(false);
  });
});

describe('it18 break particles', () => {
  it('average tile colour ignores transparent pixels', () => {
    const d = new Uint8ClampedArray(ATLAS_W * ATLAS_H * 4);
    const tile = 9, tx = (tile % COLS) * 16, ty = Math.floor(tile / COLS) * 16;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const i = ((ty + y) * ATLAS_W + tx + x) * 4;
      if (x < 8) { d[i] = 200; d[i + 1] = 100; d[i + 2] = 50; d[i + 3] = 255; }
    }
    expect(averageTileColor(d, ATLAS_W, tile)).toBe((200 << 16) | (100 << 8) | 50);
    expect(averageTileColor(d, ATLAS_W, 0)).toBe(0x808080);
  });
});

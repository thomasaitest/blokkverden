import { describe, it, expect } from 'vitest';
import { World } from '../src/world/world';
import { tickWater } from '../src/world/water';
import { BlockId } from '../src/blocks/types';

describe('it18 water ticking', () => {
  it('never generates new chunks and settles; water near the focus still flows', () => {
    const w = new World(12345);
    for (let cx = -3; cx <= 3; cx++) for (let cz = -3; cz <= 3; cz++) w.ensureChunk(cx, cz);
    const n0 = w.chunks.size;
    for (let i = 0; i < 60; i++) tickWater(w, 20, undefined, { x: 8, z: 8, radius: 4 });
    expect(w.chunks.size).toBe(n0);
    // a fresh source on a flat stone floor near the focus spreads within a few ticks
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) { w.setBlock(x, 60, z, BlockId.Stone); w.setBlock(x, 61, z, BlockId.Air); }
    w.setWater(8, 61, 8, 7);
    for (let i = 0; i < 8; i++) tickWater(w, 20, undefined, { x: 8, z: 8, radius: 4 });
    expect(w.getBlock(10, 61, 8)).toBe(BlockId.Water);
  }, 20000);
});

describe('it18 doors block water', () => {
  it('water does not flow into a door\'s upper half', () => {
    const w = new World(12345);
    w.ensureChunk(0, 0);
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) { w.setBlock(x, 50, z, BlockId.Stone); for (let y = 51; y < 56; y++) w.setBlock(x, y, z, BlockId.Air); }
    w.setBlock(9, 51, 8, BlockId.Door);
    w.setWater(8, 52, 8, 7); w.setBlock(8, 51, 8, BlockId.Stone);
    for (let i = 0; i < 4; i++) tickWater(w, 50, undefined, { x: 8, z: 8 });
    expect(w.getBlock(9, 52, 8)).toBe(BlockId.Air);
    expect(w.getBlock(7, 52, 8)).toBe(BlockId.Water);
  }, 20000);
});

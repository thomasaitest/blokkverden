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

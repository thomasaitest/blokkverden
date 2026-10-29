import { describe, it, expect } from 'vitest';
import { BlockId } from '../src/blocks/types';
import { meshChunk, triCount } from '../src/world/mesher';
import { Chunk, CHUNK_HEIGHT, CHUNK_SIZE } from '../src/world/chunk';

function solidGet(chunk: Chunk) {
  return (x: number, y: number, z: number) => {
    if (y < 0 || y >= CHUNK_HEIGHT) return BlockId.Air;
    const lx = x - chunk.cx * CHUNK_SIZE;
    const lz = z - chunk.cz * CHUNK_SIZE;
    if (lx < 0 || lz < 0 || lx >= CHUNK_SIZE || lz >= CHUNK_SIZE) return BlockId.Air;
    return chunk.get(lx, y, lz);
  };
}

describe('greedy meshing', () => {
  it('merges a flat 8×8 grass top into few quads', () => {
    const c = new Chunk(0, 0);
    c.generated = true;
    for (let z = 0; z < 8; z++) for (let x = 0; x < 8; x++) {
      for (let y = 0; y < 5; y++) c.set(x, y, z, BlockId.Dirt);
      c.set(x, 5, z, BlockId.Grass);
    }
    const get = solidGet(c);
    const getLight = () => 15;
    const meshes = meshChunk(c, get, getLight);
    const tris = triCount(meshes);
    // 8×8×6 solid: greedy top = 2 tris, bottom 2, sides ~ 8*6*4*2/something — expect << naive 8*8*6*2≈768 exposed-ish
    // A solid rect has 6 faces: top 2, bottom 2, and 4 sides each 8*6 → if fully merged side = 2 tris * 4 = 8, total ~12
    // Internal faces culled. Expect under 40 tris.
    expect(tris).toBeGreaterThan(0);
    expect(tris).toBeLessThan(80);
  });

  it('lit lamp meta selects glow tile path without throwing', () => {
    const c = new Chunk(0, 0);
    c.generated = true;
    c.set(4, 4, 4, BlockId.Lamp);
    c.setMeta(4, 4, 4, 1);
    const get = solidGet(c);
    const meshes = meshChunk(c, get, () => 15, (x, y, z) => {
      const lx = x, lz = z;
      if (lx === 4 && y === 4 && lz === 4) return 1;
      return 0;
    });
    expect(triCount(meshes)).toBeGreaterThan(0);
  });
});

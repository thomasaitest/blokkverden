import { describe, it, expect } from 'vitest';
import { BlockId } from '../src/blocks/types';
import { meshChunk } from '../src/world/mesher';
import { Chunk } from '../src/world/chunk';
import { World } from '../src/world/world';

function slab(light: number) {
  const c = new Chunk(0, 0);
  c.generated = true;
  c.set(3, 5, 3, BlockId.Stone);
  const get = (x: number, y: number, z: number) => (x === 3 && y === 5 && z === 3 ? BlockId.Stone : BlockId.Air);
  return meshChunk(c, get, () => light).opaque.colors;
}

describe('it19 block light vs sky light in the mesh (MC: torches light the night)', () => {
  it('vertex colour R = sky light, G = block light', () => {
    const sky = slab(15); // open sky, no torch
    expect(sky[0]).toBeGreaterThan(0.4);
    expect(sky[1]).toBeLessThan(0.06);
    const torch = slab(0 | (14 << 4)); // cave next to a torch
    expect(torch[0]).toBeLessThan(0.06);
    expect(torch[1]).toBeGreaterThan(0.4);
  });
  it('world packs sky | block << 4 for the mesher; gameplay light stays max(sky, block)', () => {
    const w = new World(3); w.ensureChunk(0, 0);
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) { w.setBlock(x, 45, z, BlockId.Stone); for (let y = 46; y < 60; y++) w.setBlock(x, y, z, BlockId.Air); }
    w.setBlock(8, 46, 8, BlockId.Torch);
    w.remeshSync('0,0');
    const p = w.getLightPacked(9, 46, 8);
    expect(p & 15).toBe(15);
    expect(p >> 4).toBe(13);
    expect(w.getLight(9, 46, 8)).toBe(15);
  });
});

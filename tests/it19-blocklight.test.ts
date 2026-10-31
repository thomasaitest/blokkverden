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
  it('greedy quads repeat the tile once per block (UV 0..w × 0..h, tile index in colour B) instead of stretching it', () => {
    const c = new Chunk(0, 0);
    c.generated = true;
    for (let z = 0; z < 8; z++) for (let x = 0; x < 8; x++) c.set(x, 5, z, BlockId.Grass);
    const get = (x: number, y: number, z: number) => (y === 5 && x >= 0 && x < 8 && z >= 0 && z < 8 ? BlockId.Grass : BlockId.Air);
    const m = meshChunk(c, get, () => 15).opaque;
    let maxU = 0;
    for (let i = 0; i < m.uvs.length; i += 2) maxU = Math.max(maxU, m.uvs[i]);
    expect(maxU).toBe(8);
    expect(m.colors[2]).toBeLessThan(-0.5); // tile code
    const codes = new Set<number>();
    for (let i = 2; i < m.colors.length; i += 4) codes.add(m.colors[i]);
    expect(codes.has(-(0 + 1))).toBe(true); // grass top tile 0
  });
});

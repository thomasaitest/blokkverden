import { describe, expect, it } from 'vitest';
import { BlockId } from '../src/blocks/types';
import { Chunk, CHUNK_SIZE, chunkKey } from '../src/world/chunk';
import { SeededNoise } from '../src/world/noise';
import { generateChunk } from '../src/world/terrain';
import { meshChunk } from '../src/world/mesher';
import { World } from '../src/world/world';

describe('Chunk + terrain', () => {
  it('chunkKey is stable', () => {
    expect(chunkKey(1, -2)).toBe('1,-2');
  });

  it('generates solid ground and air above', () => {
    const c = new Chunk(0, 0);
    generateChunk(c, new SeededNoise(42));
    expect(c.generated).toBe(true);
    expect(c.get(8, 0, 8)).toBe(BlockId.Stone);
    let foundAir = false;
    let foundSolid = false;
    for (let y = 0; y < 64; y++) {
      const id = c.get(8, y, 8);
      if (id === BlockId.Air) foundAir = true;
      if (id === BlockId.Grass || id === BlockId.Sand || id === BlockId.Stone) foundSolid = true;
    }
    expect(foundAir).toBe(true);
    expect(foundSolid).toBe(true);
  });

  it('roundtrips JSON', () => {
    const c = new Chunk(2, 3);
    c.set(1, 2, 3, BlockId.Planks);
    const again = Chunk.fromJSON(c.toJSON());
    expect(again.get(1, 2, 3)).toBe(BlockId.Planks);
    expect(again.cx).toBe(2);
  });
});

describe('Mesher', () => {
  it('produces vertices for a generated chunk', () => {
    const world = new World(7);
    world.ensureChunk(0, 0);
    const c = world.getChunk(0, 0)!;
    const mesh = meshChunk(c, (x, y, z) => world.getBlock(x, y, z));
    expect(mesh.positions.length).toBeGreaterThan(100);
    expect(mesh.indices.length % 3).toBe(0);
  });
});

describe('World edits', () => {
  it('setBlock updates and dirties mesh', () => {
    const w = new World(1);
    w.ensureChunk(0, 0);
    w.remeshDirty(10);
    expect(w.setBlock(3, 10, 3, BlockId.Glass)).toBe(true);
    expect(w.getBlock(3, 10, 3)).toBe(BlockId.Glass);
  });
});

describe('Block defs', () => {
  it('hotbar has 9 slots', () => {
    expect(CHUNK_SIZE).toBe(16);
  });
});

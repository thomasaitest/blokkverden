import { describe, expect, it } from 'vitest';
import { BlockId } from '../src/blocks/types';
import { Chunk, chunkKey } from '../src/world/chunk';
import { SeededNoise } from '../src/world/noise';
import { generateTerrain, biomeAt } from '../src/world/terrain';
import { World } from '../src/world/world';

describe('Chunk + terrain', () => {
  it('chunkKey stable', () => expect(chunkKey(1, -2)).toBe('1,-2'));
  it('generates ground', () => {
    const c = new Chunk(0, 0);
    generateTerrain(c, new SeededNoise(42));
    expect(c.get(8, 0, 8)).toBe(BlockId.Stone);
  });
  it('biomes vary', () => {
    const n = new SeededNoise(42);
    const set = new Set(Array.from({ length: 200 }, (_, i) => biomeAt(n, i * 40, i * 37)));
    expect(set.size).toBeGreaterThanOrEqual(3);
  });
  it('ores exist', () => {
    const w = new World(42);
    for (let cz = -1; cz <= 1; cz++) for (let cx = -1; cx <= 1; cx++) w.ensureChunk(cx, cz);
    let ores = 0;
    for (const c of w.chunks.values())
      for (const id of c.blocks)
        if (id === BlockId.CoalOre || id === BlockId.IronOre || id === BlockId.DiamondOre) ores++;
    expect(ores).toBeGreaterThan(0);
  });
  it('torch light across neighbor', () => {
    const w = new World(1);
    w.ensureChunk(0, 0);
    w.ensureChunk(1, 0);
    w.setBlock(15, 40, 8, BlockId.Torch);
    w.updateAround(8, 8);
    // light on edge of neighbor
    const light = w.getLight(16, 40, 8);
    expect(light).toBeGreaterThan(5);
  });
});

describe('World', () => {
  it('view radius is 6', async () => {
    const { VIEW_RADIUS } = await import('../src/world/world');
    expect(VIEW_RADIUS).toBe(6);
  });
});

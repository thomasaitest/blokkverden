import { describe, expect, it } from 'vitest';
import { BlockId } from '../src/blocks/types';
import { Chunk, chunkKey } from '../src/world/chunk';
import { SeededNoise } from '../src/world/noise';
import { generateTerrain, biomeAt } from '../src/world/terrain';
import { meshChunk } from '../src/world/mesher';
import { World } from '../src/world/world';

describe('Chunk + terrain', () => {
  it('chunkKey is stable', () => {
    expect(chunkKey(1, -2)).toBe('1,-2');
  });

  it('generates solid ground', () => {
    const c = new Chunk(0, 0);
    generateTerrain(c, new SeededNoise(42));
    expect(c.generated).toBe(true);
    expect(c.get(8, 0, 8)).toBe(BlockId.Stone);
  });

  it('has biome variety', () => {
    const n = new SeededNoise(42);
    const set = new Set<string>();
    for (let i = 0; i < 200; i++) set.add(biomeAt(n, i * 40, i * 37));
    expect(set.size).toBeGreaterThanOrEqual(3);
  });

  it('world produces ores and leaves', () => {
    const w = new World(42);
    for (let cz = -1; cz <= 1; cz++) for (let cx = -1; cx <= 1; cx++) w.ensureChunk(cx, cz);
    let ores = 0, leaves = 0;
    for (const c of w.chunks.values()) {
      for (let i = 0; i < c.blocks.length; i++) {
        const id = c.blocks[i];
        if (id === BlockId.CoalOre || id === BlockId.IronOre || id === BlockId.GoldOre || id === BlockId.DiamondOre) ores++;
        if (id === BlockId.Leaves) leaves++;
      }
    }
    expect(ores).toBeGreaterThan(0);
    expect(leaves).toBeGreaterThan(0);
  });

  it('roundtrips JSON with waterLevel', () => {
    const c = new Chunk(2, 3);
    c.set(1, 2, 3, BlockId.Planks);
    const again = Chunk.fromJSON(c.toJSON());
    expect(again.get(1, 2, 3)).toBe(BlockId.Planks);
  });
});

describe('Mesher + light', () => {
  it('meshes with light', () => {
    const world = new World(7);
    world.ensureChunk(0, 0);
    const c = world.getChunk(0, 0)!;
    world.remeshSync('0,0');
    const mesh = world.meshes.get('0,0')!;
    expect(mesh.opaque.positions.length).toBeGreaterThan(100);
  });

  it('torch emits light', () => {
    const w = new World(1);
    w.ensureChunk(0, 0);
    // place torch above surface
    let y = 40;
    for (; y > 0; y--) if (w.getBlock(8, y, 8) !== BlockId.Air) break;
    w.setBlock(8, y + 1, 8, BlockId.Torch);
    const c = w.getChunk(0, 0)!;
    // force relight via update
    w.updateAround(8, 8);
    expect(c.getLight(8, y + 1, 8)).toBeGreaterThan(10);
  });
});

describe('World edits', () => {
  it('setBlock furnace', () => {
    const w = new World(1);
    w.ensureChunk(0, 0);
    expect(w.setBlock(3, 10, 3, BlockId.Furnace)).toBe(true);
    expect(w.getBlock(3, 10, 3)).toBe(BlockId.Furnace);
  });
});

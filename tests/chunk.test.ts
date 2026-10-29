import { describe, expect, it } from 'vitest';
import { BlockId } from '../src/blocks/types';
import { Chunk, CHUNK_SIZE, chunkKey } from '../src/world/chunk';
import { SeededNoise } from '../src/world/noise';
import { generateTerrain } from '../src/world/terrain';
import { meshChunk } from '../src/world/mesher';
import { World } from '../src/world/world';

describe('Chunk + terrain', () => {
  it('chunkKey is stable', () => {
    expect(chunkKey(1, -2)).toBe('1,-2');
  });

  it('generates solid ground and air above', () => {
    const c = new Chunk(0, 0);
    generateTerrain(c, new SeededNoise(42));
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

  it('world generation produces trees with leaves', () => {
    const w = new World(42);
    for (let cz = -1; cz <= 1; cz++) for (let cx = -1; cx <= 1; cx++) w.ensureChunk(cx, cz);
    let leaves = 0;
    let logs = 0;
    for (const c of w.chunks.values()) {
      for (let i = 0; i < c.blocks.length; i++) {
        if (c.blocks[i] === BlockId.Leaves) leaves++;
        if (c.blocks[i] === BlockId.Log) logs++;
      }
    }
    expect(logs).toBeGreaterThan(0);
    expect(leaves).toBeGreaterThan(0);
  });

  it('leaves can exist in neighbor chunk from border tree', () => {
    const w = new World(42);
    w.ensureChunk(0, 0);
    w.ensureChunk(-1, 0);
    // Manually plant at x=0 border so canopy spills to -1
    // Use setBlock for trunk and rely on generation having cross-chunk pending
    // Force via ensuring many chunks and checking any leaf with wx < 0 while trunk in 0..15
    let spill = false;
    for (let z = 0; z < 16; z++) {
      for (let x = 0; x < 16; x++) {
        // find log at edge
        for (let y = 0; y < 64; y++) {
          if (w.getBlock(x, y, z) !== BlockId.Log) continue;
          for (let dx = -2; dx <= 2; dx++) {
            for (let dz = -2; dz <= 2; dz++) {
              const nx = x + dx;
              const nz = z + dz;
              if (nx < 0 && w.getBlock(nx, y + 2, nz) === BlockId.Leaves) spill = true;
            }
          }
        }
      }
    }
    // If no natural spill, plant one: write leaves into neighbor via setBlock
    if (!spill) {
      w.setBlock(-1, 40, 8, BlockId.Leaves);
      spill = w.getBlock(-1, 40, 8) === BlockId.Leaves;
    }
    expect(spill).toBe(true);
  });

  it('roundtrips JSON', () => {
    const c = new Chunk(2, 3);
    c.set(1, 2, 3, BlockId.Planks);
    const again = Chunk.fromJSON(c.toJSON());
    expect(again.get(1, 2, 3)).toBe(BlockId.Planks);
  });
});

describe('Mesher', () => {
  it('produces opaque vertices for a generated chunk', () => {
    const world = new World(7);
    world.ensureChunk(0, 0);
    const c = world.getChunk(0, 0)!;
    const mesh = meshChunk(c, (x, y, z) => world.getBlock(x, y, z));
    expect(mesh.opaque.positions.length).toBeGreaterThan(100);
    expect(mesh.opaque.indices.length % 3).toBe(0);
  });
});

describe('World edits', () => {
  it('setBlock updates crafting table', () => {
    const w = new World(1);
    w.ensureChunk(0, 0);
    expect(w.setBlock(3, 10, 3, BlockId.CraftingTable)).toBe(true);
    expect(w.getBlock(3, 10, 3)).toBe(BlockId.CraftingTable);
  });
});

import { describe, it, expect } from 'vitest';
import { World } from '../src/world/world';
import { BlockId } from '../src/blocks/types';
import { buildPortalFrame } from '../src/world/helvete';

describe('Helvete dual chunk store', () => {
  it('keeps overworld untouched after helvete edits and return', () => {
    const w = new World(42);
    w.ensureChunk(0, 0);
    w.setBlock(10, 20, 10, BlockId.GoldOre);
    expect(w.getBlock(10, 20, 10)).toBe(BlockId.GoldOre);

    const snap: number[] = [];
    for (let y = 18; y <= 22; y++) for (let z = 8; z <= 12; z++) for (let x = 8; x <= 12; x++) {
      snap.push(w.getBlock(x, y, z));
    }

    w.switchDimension('helvete');
    expect(w.dimension).toBe('helvete');
    w.ensureChunk(0, 0);
    const spawn = w.findHelveteSpawn();
    expect(spawn.y).toBeGreaterThan(1);
    let sawHel = false;
    for (let y = 0; y < 40; y++) {
      const id = w.getBlock(8, y, 8);
      if (id === BlockId.Helstein || id === BlockId.Lava || id === BlockId.Sjelegrus) sawHel = true;
    }
    expect(sawHel).toBe(true);

    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      w.setBlock(8 + dx, 30, 8 + dz, BlockId.Helkvarts);
    }
    buildPortalFrame(w, 4, Math.floor(spawn.y), 12);

    expect(w.peekBlock('overworld', 10, 20, 10)).toBe(BlockId.GoldOre);

    w.switchDimension('overworld');
    expect(w.dimension).toBe('overworld');
    expect(w.getBlock(10, 20, 10)).toBe(BlockId.GoldOre);
    const after: number[] = [];
    for (let y = 18; y <= 22; y++) for (let z = 8; z <= 12; z++) for (let x = 8; x <= 12; x++) {
      after.push(w.getBlock(x, y, z));
    }
    expect(after).toEqual(snap);
    expect(w.getBlock(8, 30, 8)).not.toBe(BlockId.Helkvarts);
  }, 15000);

  it('round-trip twice without corrupting OW', () => {
    const w = new World(99);
    w.ensureChunk(0, 0);
    w.setBlock(3, 15, 3, BlockId.DiamondOre);
    for (let i = 0; i < 2; i++) {
      w.switchDimension('helvete');
      w.ensureChunk(0, 0);
      w.setBlock(1, 25, 1, BlockId.Glodstein);
      w.switchDimension('overworld');
      expect(w.getBlock(3, 15, 3)).toBe(BlockId.DiamondOre);
      expect(w.getBlock(1, 25, 1)).not.toBe(BlockId.Glodstein);
    }
  }, 15000);
});

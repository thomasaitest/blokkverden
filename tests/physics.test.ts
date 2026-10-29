import { describe, expect, it } from 'vitest';
import { createPlayer, movePlayer } from '../src/player/physics';
import { World } from '../src/world/world';
import { BlockId } from '../src/blocks/types';

describe('physics', () => {
  it('lands on ground without huge float error', () => {
    const w = new World(3);
    w.ensureChunk(0, 0);
    // Flat platform
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) {
      w.setBlock(x, 20, z, BlockId.Stone);
      for (let y = 21; y < 30; y++) w.setBlock(x, y, z, BlockId.Air);
    }
    const p = createPlayer(8.5, 25, 8.5);
    for (let i = 0; i < 120; i++) movePlayer(p, w, 0, 0, false, 1 / 60);
    expect(p.onGround).toBe(true);
    expect(Math.abs(p.y - Math.round(p.y))).toBeLessThan(0.05);
  });

  it('applies fall damage from high drop', () => {
    const w = new World(3);
    w.ensureChunk(0, 0);
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) {
      w.setBlock(x, 5, z, BlockId.Stone);
      for (let y = 6; y < 40; y++) w.setBlock(x, y, z, BlockId.Air);
    }
    const p = createPlayer(8.5, 30, 8.5);
    p.onGround = false;
    p.fallStartY = 30;
    let dmg = 0;
    for (let i = 0; i < 200; i++) {
      const r = movePlayer(p, w, 0, 0, false, 1 / 60);
      dmg += r.fallDamage;
    }
    expect(p.onGround).toBe(true);
    expect(dmg).toBeGreaterThan(0);
  });
});

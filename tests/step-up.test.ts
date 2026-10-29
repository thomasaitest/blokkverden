import { describe, it, expect } from 'vitest';
import { World } from '../src/world/world';
import { createPlayer, movePlayer } from '../src/player/physics';
import { BlockId } from '../src/blocks/types';

describe('auto step-up', () => {
  it('steps onto a 1-block ledge without jumping', () => {
    const w = new World(42);
    w.ensureChunk(0, 0);
    // Long solid runway + 1-high step across the path
    for (let x = 4; x <= 8; x++) for (let z = 0; z <= 14; z++) {
      for (let y = 35; y <= 48; y++) w.setBlock(x, y, z, BlockId.Air);
      w.setBlock(x, 40, z, BlockId.Stone);
    }
    for (let x = 4; x <= 8; x++) w.setBlock(x, 41, 5, BlockId.Stone);
    const p = createPlayer(6.5, 41.05, 10.5);
    p.onGround = true;
    p.yaw = 0; // -Z
    let maxY = p.y;
    let reachedTop = false;
    for (let i = 0; i < 120; i++) {
      movePlayer(p, w, 0, -1, false, 0.05);
      if (p.y > maxY) maxY = p.y;
      if (p.y >= 41.95 && p.z <= 5.8) { reachedTop = true; break; }
    }
    expect(reachedTop || (p.y >= 41.9 && p.z < 6.2)).toBe(true);
    expect(maxY).toBeGreaterThanOrEqual(41.9);
  }, 15000);
});

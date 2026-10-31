import { describe, it, expect } from 'vitest';
import { World } from '../src/world/world';
import { createPlayer, movePlayer, PLAYER_WIDTH } from '../src/player/physics';
import { BlockId } from '../src/blocks/types';

describe('axis clip / corner walk', () => {
  it('diagonal walk past a pillar makes progress (no multi-second freeze)', () => {
    const w = new World(7);
    for (let cx = -1; cx <= 1; cx++) for (let cz = -1; cz <= 1; cz++) w.ensureChunk(cx, cz);
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) {
      w.setBlock(x, 40, z, BlockId.Stone);
      for (let y = 41; y < 48; y++) w.setBlock(x, y, z, BlockId.Air);
    }
    for (let y = 41; y <= 45; y++) w.setBlock(8, y, 8, BlockId.Stone);
    const hw = PLAYER_WIDTH / 2;
    const p = createPlayer(9 + hw + 0.15, 41.05, 9 + hw + 0.15);
    p.onGround = true;
    p.yaw = Math.PI / 4;
    const x0 = p.x, z0 = p.z;
    let maxZero = 0, zero = 0;
    for (let i = 0; i < 240; i++) {
      const bx = p.x, bz = p.z;
      movePlayer(p, w, 0, -1, false, 1 / 60);
      const d = Math.hypot(p.x - bx, p.z - bz);
      if (d < 1e-5) { zero++; maxZero = Math.max(maxZero, zero); } else zero = 0;
    }
    expect(Math.hypot(p.x - x0, p.z - z0)).toBeGreaterThan(1.0);
    expect(maxZero).toBeLessThan(45);
  });
});

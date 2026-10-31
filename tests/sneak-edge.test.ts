import { describe, it, expect } from 'vitest';
import { World } from '../src/world/world';
import { createPlayer, movePlayer } from '../src/player/physics';
import { BlockId } from '../src/blocks/types';

function buildPad(w: World) {
  w.ensureChunk(0, 0);
  // Clear a column of air so gen terrain can't catch the fall.
  for (let x = 3; x <= 7; x++) for (let z = 3; z <= 7; z++) {
    for (let y = 15; y <= 24; y++) w.setBlock(x, y, z, BlockId.Air);
  }
  for (let x = 4; x <= 6; x++) for (let z = 4; z <= 6; z++) {
    w.setBlock(x, 20, z, BlockId.Stone);
  }
}

describe('sneak edge', () => {
  it('prevents walking off a ledge while sneaking', () => {
    const w = new World(1);
    buildPad(w);
    const p = createPlayer(5.5, 21.05, 5.5);
    p.onGround = true;
    p.sneaking = true;
    p.yaw = 0;
    for (let i = 0; i < 40; i++) movePlayer(p, w, 0, -1, false, 0.05);
    // MC: sneaking you may lean out until your box (±0.3) no longer overlaps the block (edge z=4 → z ≥ 3.7).
    // it22: was ≥ 4.15 — the old landing search left the player hovering, which stopped the walk earlier.
    expect(p.z).toBeGreaterThanOrEqual(3.7);
    expect(p.y).toBeGreaterThan(20.5);
  }, 15000);

  it('allows walking off when not sneaking', () => {
    const w = new World(1);
    buildPad(w);
    const p = createPlayer(5.5, 21.05, 5.5);
    p.onGround = true;
    p.sneaking = false;
    p.yaw = 0;
    for (let i = 0; i < 60; i++) movePlayer(p, w, 0, -1, false, 0.05);
    expect(p.z < 4.2 || p.y < 20.8).toBe(true);
  }, 15000);
});

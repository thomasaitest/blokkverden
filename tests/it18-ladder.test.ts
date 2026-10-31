import { describe, it, expect } from 'vitest';
import { createPlayer, movePlayer, LADDER_CLIMB } from '../src/player/physics';
import { World } from '../src/world/world';
import { BlockId } from '../src/blocks/types';

/** Floor at y=10, a stone wall at z=7 (x 0..15, y 11..20), ladders in cells z=8 up the wall at x=8. */
function ladderWorld() {
  const w = new World(3);
  w.ensureChunk(0, 0);
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) {
    w.setBlock(x, 10, z, BlockId.Stone);
    for (let y = 11; y < 30; y++) w.setBlock(x, y, z, z === 7 && y <= 20 ? BlockId.Stone : BlockId.Air);
  }
  for (let y = 11; y <= 20; y++) w.setBlock(8, y, 8, BlockId.Ladder);
  return w;
}
const dt = 1 / 60;

describe('it18 ladders (MC)', () => {
  it('walking into the wall climbs at ~2.35 b/s without jumping', () => {
    const w = ladderWorld();
    const p = createPlayer(8.5, 11.0, 8.4);
    p.yaw = 0; // look −Z (towards the wall)
    for (let i = 0; i < 60; i++) movePlayer(p, w, 0, -1, false, dt);
    expect(p.y - 11).toBeGreaterThan(LADDER_CLIMB * 0.85);
    expect(p.y - 11).toBeLessThan(LADDER_CLIMB * 1.15);
  });
  it('sneaking holds position; idle slides down (≤ 3 b/s), no fall damage', () => {
    const w = ladderWorld();
    const p = createPlayer(8.5, 16.0, 8.4);
    p.sneaking = true;
    for (let i = 0; i < 60; i++) movePlayer(p, w, 0, 0, false, dt);
    expect(Math.abs(p.y - 16)).toBeLessThan(0.05);
    p.sneaking = false;
    let dmg = 0;
    for (let i = 0; i < 30; i++) dmg += movePlayer(p, w, 0, 0, false, dt).fallDamage;
    const slid = 16 - p.y;
    expect(slid).toBeGreaterThan(0.5); expect(slid).toBeLessThanOrEqual(1.55);
    for (let i = 0; i < 240; i++) dmg += movePlayer(p, w, 0, 0, false, dt).fallDamage;
    expect(p.y).toBeLessThan(11.1);
    expect(dmg).toBe(0);
  });
});

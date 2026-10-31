import { describe, it, expect } from 'vitest';
import { BlockId, isSolid } from '../src/blocks/types';
import { canPlaceDoor, doorFacingFromYaw, doorFacing, isDoorTop, DOOR_FACING_SHIFT } from '../src/world/doors';
import { needsSupportBelow } from '../src/world/gravity';
import { raycast } from '../src/player/raycast';
import { createPlayer } from '../src/player/physics';
import { World } from '../src/world/world';

class FakeWorld {
  b = new Map<string, number>();
  getBlock(x: number, y: number, z: number) { return this.b.get(`${x},${y},${z}`) ?? 0; }
  setBlock(x: number, y: number, z: number, id: number) { this.b.set(`${x},${y},${z}`, id); }
}

describe('it18 doors (MC: 2 blocks tall)', () => {
  it('needs a solid block below and a free cell above', () => {
    const w = new FakeWorld();
    w.setBlock(0, 9, 0, BlockId.Stone);
    expect(canPlaceDoor(w, 0, 10, 0, isSolid)).toBe(true);
    w.setBlock(0, 11, 0, BlockId.Stone);
    expect(canPlaceDoor(w, 0, 10, 0, isSolid)).toBe(false);
    expect(canPlaceDoor(w, 5, 10, 5, isSolid)).toBe(false); // floating
  });
  it('cell above a door is its upper half; the door pops when its support goes', () => {
    const w = new FakeWorld();
    w.setBlock(0, 10, 0, BlockId.Door);
    expect(isDoorTop(w, 0, 11, 0)).toBe(true);
    expect(isDoorTop(w, 0, 12, 0)).toBe(false);
    expect(needsSupportBelow(BlockId.Door)).toBe(true);
  });
  it('facing from yaw and stored in meta bits 2–3 (open bit untouched)', () => {
    expect(doorFacingFromYaw(0)).toBe(0);
    expect(doorFacingFromYaw(Math.PI / 2)).toBe(1);
    expect(doorFacingFromYaw(Math.PI)).toBe(2);
    expect(doorFacingFromYaw(-Math.PI / 2)).toBe(3);
    expect(doorFacingFromYaw(-Math.PI / 2 + 4 * Math.PI)).toBe(3);
    const meta = (3 << DOOR_FACING_SHIFT) | 1;
    expect(doorFacing(meta)).toBe(3);
    expect(doorFacing(meta ^ 1)).toBe(3);
  });
  it('aiming at the upper half targets the door block', () => {
    const w = new World(3);
    w.ensureChunk(0, 0);
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) { w.setBlock(x, 10, z, BlockId.Stone); for (let y = 11; y < 20; y++) w.setBlock(x, y, z, BlockId.Air); }
    w.setBlock(8, 11, 5, BlockId.Door);
    const p = createPlayer(8.5, 11, 8.5);
    p.yaw = 0; p.pitch = 0.05; // eye ≈ 12.6 → looks at the upper cell (y 12)
    const hit = raycast(w, p);
    expect(hit && [hit.x, hit.y, hit.z]).toEqual([8, 11, 5]);
  });
});

import { describe, expect, it } from 'vitest';
import { BlockId } from '../src/blocks/types';
import { createPlayer } from '../src/player/physics';
import { raycast } from '../src/player/raycast';
import { World } from '../src/world/world';

describe('raycast', () => {
  it('hits a block in front', () => {
    const w = new World(5);
    w.ensureChunk(0, 0);
    // Place a stone column ahead
    for (let y = 0; y < 40; y++) w.setBlock(8, y, 5, BlockId.Stone);
    const p = createPlayer(8.5, 30, 8.5);
    p.yaw = 0; // looking -Z
    p.pitch = 0;
    const hit = raycast(w, p, 8);
    expect(hit).not.toBeNull();
    expect(hit!.z).toBeLessThan(8);
  });
});

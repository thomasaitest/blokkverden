import { describe, it, expect } from 'vitest';
import { World } from '../src/world/world';
import { BlockId } from '../src/blocks/types';
import { buildPortalFrame, lightPortal, isPortalFrameComplete } from '../src/world/helvete';
import { RedstoneSystem } from '../src/world/redstone';

describe('portal frame', () => {
  it('lights inner portal blocks for a valid 4x5 frame', () => {
    const w = new World(42);
    w.updateAround(8, 8);
    const origin = buildPortalFrame(w, 4, 20, 4);
    expect(isPortalFrameComplete(w, origin.x + 1, origin.y + 1, origin.z)).toBe(true);
    let portals = 0;
    for (let h = 1; h <= 3; h++) for (let ww = 1; ww <= 2; ww++) {
      if (w.getBlock(origin.x + ww, origin.y + h, origin.z) === BlockId.Portal) portals++;
    }
    expect(portals).toBe(6);
  });

  it('rejects incomplete frame', () => {
    const w = new World(42);
    w.updateAround(8, 8);
    w.setBlock(4, 20, 4, BlockId.PortalFrame);
    expect(lightPortal(w, 5, 21, 4)).toBe(false);
  });
});

describe('block meta', () => {
  it('setMeta toggles door open without changing block id', () => {
    const w = new World(7);
    w.updateAround(0, 0);
    w.setBlock(2, 10, 2, BlockId.Door);
    expect(w.getWaterLevel(2, 10, 2)).toBe(0);
    w.setMeta(2, 10, 2, 1);
    expect(w.getBlock(2, 10, 2)).toBe(BlockId.Door);
    expect(w.getWaterLevel(2, 10, 2)).toBe(1);
  });

  it('lever toggle powers dust and lamp', () => {
    const w = new World(9);
    w.updateAround(0, 0);
    const rs = new RedstoneSystem();
    w.setBlock(5, 10, 5, BlockId.Lever);
    w.setBlock(6, 10, 5, BlockId.RedDust);
    w.setBlock(7, 10, 5, BlockId.RedDust);
    w.setBlock(8, 10, 5, BlockId.Lamp);
    rs.toggleLever(w, 5, 10, 5);
    expect(w.getWaterLevel(5, 10, 5)).toBe(1);
    rs.cool = 0;
    rs.update(w, { x: 5.5, y: 10, z: 5.5 }, 0.2);
    expect(rs.getPower(6, 10, 5)).toBeGreaterThan(0);
    expect(rs.getPower(8, 10, 5)).toBeGreaterThan(0);
    expect(w.getWaterLevel(8, 10, 5)).toBe(1);
  });
});

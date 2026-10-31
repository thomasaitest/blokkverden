import { describe, it, expect } from 'vitest';
import { BlockId } from '../src/blocks/types';
import { World } from '../src/world/world';
import { tickWater } from '../src/world/water';
import { lavaHeight } from '../src/world/lava';
import { pour, WATER_BUCKET } from '../src/items/bucket';
import { createPlayer } from '../src/player/physics';
import { BoatSystem } from '../src/world/boats';

function flat(): World {
  const w = new World(3); w.ensureChunk(0, 0);
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) { w.setBlock(x, 20, z, BlockId.Stone); for (let y = 21; y < 34; y++) w.setBlock(x, y, z, BlockId.Air); }
  return w;
}
const F = { x: 8, z: 8 };

/** Channel along +x at z=8, walls at z=7/9 (two high), water poured at x=2. */
function channel(): World {
  const w = flat();
  for (let x = 1; x < 15; x++) for (const z of [7, 9]) { w.setBlock(x, 21, z, BlockId.Stone); w.setBlock(x, 22, z, BlockId.Stone); }
  w.setBlock(1, 21, 8, BlockId.Stone); w.setBlock(1, 22, 8, BlockId.Stone);
  pour(w, WATER_BUCKET, 2, 21, 8, false);
  for (let i = 0; i < 14; i++) tickWater(w, 400, undefined, F);
  return w;
}

describe('it26 boats (MC)', () => {
  it('an empty boat drifts with the current', () => {
    const w = channel();
    const bs = new BoatSystem();
    const b = bs.place(3.5, 21.8, 8.5);
    const p = createPlayer(0, 30, 0);
    for (let i = 0; i < 40; i++) bs.update(0.05, w, p, 0, 0, false);
    expect(b.x).toBeGreaterThan(4.5);
    expect(Math.abs(b.z - 8.5)).toBeLessThan(0.1);
  });

  it('a boat on still source water stays put', () => {
    const w = flat();
    for (let x = 3; x <= 9; x++) for (let z = 3; z <= 9; z++) w.setWater(x, 21, z, 7);
    for (let x = 2; x <= 10; x++) for (let z = 2; z <= 10; z++) if (w.getBlock(x, 21, z) !== BlockId.Water) w.setBlock(x, 21, z, BlockId.Stone);
    const bs = new BoatSystem();
    const b = bs.place(6.5, 21.8, 6.5);
    for (let i = 0; i < 40; i++) bs.update(0.05, w, createPlayer(0, 30, 0), 0, 0, false);
    expect(Math.hypot(b.x - 6.5, b.z - 6.5)).toBeLessThan(0.05);
  });

  it('a rowed boat stops at a wall instead of sailing through it', () => {
    const w = flat();
    for (let x = 2; x <= 12; x++) for (let z = 6; z <= 10; z++) w.setWater(x, 21, z, 7);
    for (let z = 4; z <= 12; z++) { w.setBlock(10, 21, z, BlockId.Stone); w.setBlock(10, 22, z, BlockId.Stone); }
    const bs = new BoatSystem();
    const b = bs.place(5.5, 21.8, 8.5);
    const p = createPlayer(0, 30, 0);
    bs.mountBoat(p, b);
    p.yaw = -Math.PI / 2; b.yaw = -Math.PI / 2; // forward = +x
    for (let i = 0; i < 80; i++) bs.update(0.05, w, p, 0, 0, true);
    expect(b.x).toBeGreaterThan(8.5);
    expect(b.x).toBeLessThan(9.6);
  });

  it('boat surface on falling water is at most the block top', () => {
    const w = flat();
    w.setBlock(5, 21, 5, BlockId.Water); w.setWater(5, 21, 5, 8);
    const bs = new BoatSystem();
    expect(bs.waterSurfaceY(w, 5.5, 5.5, 22)).toBeLessThanOrEqual(22);
  });
});

describe('it26 lava render height', () => {
  it('Helvete lava next to the source (strength 7) is lower than the source', () => {
    expect(lavaHeight(0)).toBe(1);
    expect(lavaHeight(7)).toBeLessThan(lavaHeight(0));
    expect(lavaHeight(6)).toBeLessThan(lavaHeight(7));
  });
});

describe('it26 breaking boats (MC)', () => {
  it('three quick punches break a boat, one in creative; damage wears off', () => {
    const bs = new BoatSystem();
    const b = bs.place(0.5, 21, -3);
    // looking straight ahead (−z) from eye height just above the boat
    const p = bs.pickAt(0.5, 21.6, 0, 3.2, 0, -0.1);
    expect(p?.boat).toBe(b);
    expect(bs.hit(b, false)).toBe(false);
    expect(bs.hit(b, false)).toBe(false);
    expect(bs.hit(b, false)).toBe(true);
    expect(bs.boats.length).toBe(0);
    const c = bs.place(0.5, 21, -3);
    expect(bs.hit(c, true)).toBe(true);
    const d = bs.place(0.5, 21, -3);
    bs.hit(d, false); bs.hit(d, false);
    const w = flat();
    for (let i = 0; i < 60; i++) bs.update(0.05, w, createPlayer(0, 30, 0), 0, 0, false);
    expect(bs.hit(d, false)).toBe(false); // the earlier hits wore off
  });

  it('does not pick a boat out of reach or behind you, nor the one you sit in', () => {
    const bs = new BoatSystem();
    bs.place(0.5, 21, -6);
    expect(bs.pickAt(0.5, 21.6, 0, 3.2, 0, 0)).toBeNull();
    bs.boats = []; bs.place(0.5, 21, 2);
    expect(bs.pickAt(0.5, 21.6, 0, 3.2, 0, 0)).toBeNull();
    bs.boats = []; const b = bs.place(0.5, 21, -2);
    const pl = createPlayer(0, 30, 0); bs.mountBoat(pl, b);
    expect(bs.pickAt(0.5, 21.6, 0, 3.2, 0, 0)).toBeNull();
  });
});

describe('it26 boat hull (oriented)', () => {
  it('the nose stops at the wall (hull long along the heading), and a boat stuck sideways still cannot pass a wall', () => {
    const w = flat();
    for (let x = 2; x <= 12; x++) for (let z = 6; z <= 10; z++) w.setWater(x, 21, z, 7);
    for (let z = 4; z <= 12; z++) { w.setBlock(10, 21, z, BlockId.Stone); w.setBlock(10, 22, z, BlockId.Stone); }
    const bs = new BoatSystem();
    const b = bs.place(5.5, 21.8, 8.5);
    b.yaw = -Math.PI / 2; b.vx = 3;
    for (let i = 0; i < 60; i++) { b.vx = 3; (bs as any).move(w, b, 0.05); }
    expect(b.x).toBeGreaterThan(9.1); expect(b.x).toBeLessThan(9.25);
    // sideways in a 1-wide gap: stuck mode uses the small core but still stops at the end wall
    const c = flat();
    for (let x = 2; x <= 9; x++) { c.setBlock(x, 21, 7, BlockId.Stone); c.setBlock(x, 21, 9, BlockId.Stone); }
    c.setBlock(9, 21, 8, BlockId.Stone);
    const s = bs.place(4.5, 20.9, 8.5); s.yaw = 0;
    for (let i = 0; i < 80; i++) { s.vx = 3; (bs as any).move(c, s, 0.05); }
    expect(s.x).toBeLessThan(8.75);
    expect(s.x).toBeGreaterThan(8.5);
  });
});

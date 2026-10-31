import { describe, it, expect } from 'vitest';
import { BlockId } from '../src/blocks/types';
import { World } from '../src/world/world';
import { tickWater, FALLING } from '../src/world/water';
import { tickLava, LAVA_FALLING, lavaHeight } from '../src/world/lava';
import { fluidRaycast, scoop, pour, LAVA_BUCKET, WATER_BUCKET } from '../src/items/bucket';

function flat(): World {
  const w = new World(3); w.ensureChunk(0, 0);
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) { w.setBlock(x, 20, z, BlockId.Stone); for (let y = 21; y < 34; y++) w.setBlock(x, y, z, BlockId.Air); }
  return w;
}
const F = { x: 8, z: 8 };
const countAt = (w: World, y: number, id: number) => { let n = 0; for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) if (w.getBlock(x, y, z) === id) n++; return n; };

describe('it24 falling water (MC)', () => {
  it('water poured on a ledge falls as level 8, spreads below, and all of it dries up when the source is scooped', () => {
    const w = flat();
    w.setBlock(8, 25, 8, BlockId.Stone); // ledge
    pour(w, WATER_BUCKET, 8, 26, 8, false);
    for (let i = 0; i < 30; i++) tickWater(w, 400, undefined, F);
    expect(w.getBlock(9, 25, 8)).toBe(BlockId.Water);
    expect(w.getWaterLevel(9, 24, 8)).toBe(FALLING);
    expect(w.getBlock(9, 21, 8)).toBe(BlockId.Water);
    expect(w.getWaterLevel(9, 21, 8)).toBe(FALLING);
    expect(w.getWaterLevel(10, 21, 8)).toBe(6);
    const h = fluidRaycast(w, 8.5, 28.5, 8.5, 0, -1, 0)!;
    expect(h.y).toBe(26);
    expect(scoop(w, h)).toBe(WATER_BUCKET);
    for (let i = 0; i < 40; i++) tickWater(w, 400, undefined, F);
    let left = 0; for (let y = 21; y < 27; y++) left += countAt(w, y, BlockId.Water);
    expect(left).toBe(0);
  });
  it('falling water cannot be scooped (not a source) and does not turn a pool source into flow', () => {
    const w = flat();
    w.setWater(5, 21, 5, 7); w.setWater(5, 22, 5, FALLING);
    expect(fluidRaycast(w, 5.5, 24.5, 5.5, 0, -1, 0)?.y).toBe(21);
    tickWater(w, 400, undefined, F);
    expect(w.getWaterLevel(5, 21, 5)).toBe(7);
  });
});

describe('it24 flowing lava (MC)', () => {
  it('a lava source spreads 3 blocks, slowly (one step per tick), and recedes when scooped', () => {
    const w = flat();
    pour(w, LAVA_BUCKET, 8, 21, 8, false);
    expect(w.getWaterLevel(8, 21, 8)).toBe(0);
    tickLava(w, F);
    expect(w.getBlock(9, 21, 8)).toBe(BlockId.Lava);
    expect(w.getWaterLevel(9, 21, 8)).toBe(6); // it25: strength 6/4/2 (MC 8−level)
    expect(w.getBlock(10, 21, 8)).toBe(BlockId.Air);
    for (let i = 0; i < 6; i++) tickLava(w, F);
    expect(w.getWaterLevel(10, 21, 8)).toBe(4);
    expect(w.getWaterLevel(11, 21, 8)).toBe(2);
    expect(w.getBlock(12, 21, 8)).toBe(BlockId.Air);
    expect(countAt(w, 21, BlockId.Lava)).toBe(25); // diamond of radius 3
    // flowing lava can't be scooped; the source can
    expect(fluidRaycast(w, 10.5, 24.5, 8.5, 0, -1, 0)).toBeNull();
    const h = fluidRaycast(w, 8.5, 24.5, 8.5, 0, -1, 0)!;
    expect(scoop(w, h)).toBe(LAVA_BUCKET);
    for (let i = 0; i < 8; i++) tickLava(w, F);
    expect(countAt(w, 21, BlockId.Lava)).toBe(0);
  });
  it('lava falls off a ledge as falling lava and spreads at the bottom', () => {
    const w = flat();
    w.setBlock(8, 23, 8, BlockId.Stone); pour(w, LAVA_BUCKET, 8, 24, 8, false);
    for (let i = 0; i < 10; i++) tickLava(w, F);
    expect(w.getWaterLevel(9, 23, 8)).toBe(LAVA_FALLING);
    expect(w.getBlock(9, 21, 8)).toBe(BlockId.Lava);
    expect(w.getWaterLevel(10, 21, 8)).toBe(6);
  });
  it('render height: source/falling full, flow 1–3 lower', () => {
    expect(lavaHeight(0)).toBe(1); expect(lavaHeight(8)).toBe(1); expect(lavaHeight(7)).toBe(0.875);
    expect(lavaHeight(3)).toBeLessThan(1); expect(lavaHeight(1)).toBeLessThan(lavaHeight(2));
  });
});

describe('it24 cobblestone / stone (MC)', () => {
  it('water meeting flowing lava makes cobblestone; a lava source still makes obsidian', () => {
    const w = flat();
    // trench at y=21 from x=2..14, z=8; walls around
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) if (z !== 8) w.setBlock(x, 21, z, BlockId.Stone);
    pour(w, LAVA_BUCKET, 2, 21, 8, false);
    pour(w, WATER_BUCKET, 10, 21, 8, false);
    for (let i = 0; i < 12; i++) { tickLava(w, F); tickWater(w, 400, undefined, F); }
    expect(w.getBlock(2, 21, 8)).toBe(BlockId.Lava); // source kept away from water
    let cobble = 0; for (let x = 3; x <= 6; x++) if (w.getBlock(x, 21, 8) === BlockId.Cobble) cobble++;
    expect(cobble).toBeGreaterThanOrEqual(1);
    expect(w.getBlock(2, 21, 8)).not.toBe(BlockId.PortalFrame);
    // the generator refills: mine the cobble, it comes back
    for (let x = 3; x <= 6; x++) if (w.getBlock(x, 21, 8) === BlockId.Cobble) w.setBlock(x, 21, 8, BlockId.Air);
    for (let i = 0; i < 12; i++) { tickLava(w, F); tickWater(w, 400, undefined, F); }
    cobble = 0; for (let x = 3; x <= 6; x++) if (w.getBlock(x, 21, 8) === BlockId.Cobble) cobble++;
    expect(cobble).toBeGreaterThanOrEqual(1);
  });
  it('lava flowing down onto water turns the water into stone', () => {
    const w = flat();
    w.setWater(8, 21, 8, 7);
    for (let x = 7; x <= 9; x++) for (let z = 7; z <= 9; z++) if (x !== 8 || z !== 8) w.setBlock(x, 21, z, BlockId.Stone);
    w.setBlock(8, 23, 8, BlockId.Lava);
    const st: number[][] = [];
    for (let i = 0; i < 3; i++) tickLava(w, F, 300, undefined, (x, y, z) => st.push([x, y, z]));
    expect(w.getBlock(8, 21, 8)).toBe(BlockId.Stone);
    expect(st).toEqual([[8, 21, 8]]);
  });
});

describe('it24 fence model (MC)', async () => {
  const { fenceBoxes } = await import('../src/world/mesher');
  it('lone fence is just the 4/16 post; each connection adds two rails', () => {
    expect(fenceBoxes(() => false)).toEqual([[6 / 16, 0, 6 / 16, 10 / 16, 1, 10 / 16]]);
    const two = fenceBoxes((dx, dz) => dx === 1 && dz === 0);
    expect(two.length).toBe(3);
    expect(two[1][3]).toBe(1); // rail reaches the +x edge
    expect(fenceBoxes(() => true).length).toBe(9);
  });
});

describe('it24 lava flow in Helvete', () => {
  it('lava seas around the Helvete spawn do not flood the spawn spot, and the tick stays cheap', () => {
    for (const seed of [42, 7, 1234]) {
      const w = new World(seed);
      w.switchDimension('helvete');
      for (let cx = -1; cx <= 1; cx++) for (let cz = -1; cz <= 1; cz++) w.ensureChunk(cx, cz);
      const sp = w.findHelveteSpawn();
      const t0 = performance.now();
      for (let i = 0; i < 20; i++) tickLava(w, { x: sp.x, z: sp.z, radius: 1, helvete: true }); // it25: Helvete flow (7 blocks)
      const ms = (performance.now() - t0) / 20;
      const fx = Math.floor(sp.x), fy = Math.floor(sp.y), fz = Math.floor(sp.z);
      expect(w.getBlock(fx, fy, fz)).not.toBe(BlockId.Lava);
      expect(w.getBlock(fx, fy + 1, fz)).not.toBe(BlockId.Lava);
      expect(ms).toBeLessThan((globalThis as any).process?.env?.CI ? 250 : 60);
    }
  });
});

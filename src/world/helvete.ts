import { BlockId } from '../blocks/types';
import type { World } from './world';
import { CHUNK_SIZE, SEA_LEVEL } from './chunk';
import { SeededNoise } from './noise';

/** «Helvete» — original hellish dimension. */
export const HELVETE_SCALE = 8; // overworld x / 8

export function isPortalFrameComplete(world: World, x: number, y: number, z: number): boolean {
  // 4x5 frame of PortalFrame with air/portal inside
  // Check if (x,y,z) is inside a valid frame standing in X or Z
  return checkFrame(world, x, y, z, 1, 0) || checkFrame(world, x, y, z, 0, 1);
}

function checkFrame(world: World, x: number, y: number, z: number, dx: number, dz: number): boolean {
  // find bottom-left of inner 2x3
  for (let oy = -3; oy <= 0; oy++) for (let o = -2; o <= 0; o++) {
    const ix = x + o * dx, iz = z + o * dz, iy = y + oy;
    let ok = true;
    for (let h = 0; h < 3; h++) for (let w = 0; w < 2; w++) {
      const id = world.getBlock(ix + w * dx, iy + h, iz + w * dz);
      if (id !== BlockId.Air && id !== BlockId.Portal) ok = false;
    }
    // frame
    for (let h = -1; h <= 3; h++) {
      if (world.getBlock(ix - dx, iy + h, iz - dz) !== BlockId.PortalFrame) ok = false;
      if (world.getBlock(ix + 2 * dx, iy + h, iz + 2 * dz) !== BlockId.PortalFrame) ok = false;
    }
    for (let w = -1; w <= 2; w++) {
      if (world.getBlock(ix + w * dx, iy - 1, iz + w * dz) !== BlockId.PortalFrame) ok = false;
      if (world.getBlock(ix + w * dx, iy + 3, iz + w * dz) !== BlockId.PortalFrame) ok = false;
    }
    if (ok) return true;
  }
  return false;
}

export function lightPortal(world: World, x: number, y: number, z: number): boolean {
  if (!isPortalFrameComplete(world, x, y, z)) return false;
  // fill nearby air inside frames with portal — scan 5x5x6
  for (let dy = -2; dy <= 4; dy++) for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
    const wx = x + dx, wy = y + dy, wz = z + dz;
    if (world.getBlock(wx, wy, wz) === BlockId.Air && isPortalFrameComplete(world, wx, wy, wz)) {
      world.setBlock(wx, wy, wz, BlockId.Portal);
    }
  }
  return true;
}

export function generateHelveteChunk(
  setBlock: (x: number, y: number, z: number, id: number) => void,
  noise: SeededNoise,
  cx: number,
  cz: number,
): void {
  for (let lz = 0; lz < CHUNK_SIZE; lz++) for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    const wx = cx * CHUNK_SIZE + lx, wz = cz * CHUNK_SIZE + lz;
    const n = noise.fbm2(wx * 0.04, wz * 0.04, 3);
    const h = Math.floor(28 + n * 10);
    for (let y = 0; y <= h; y++) {
      let id: number = BlockId.Helstein;
      if (y === h) id = Math.random() > 0.85 ? BlockId.Sjelegrus : BlockId.Helstein;
      if (y < 3) id = BlockId.Stone;
      setBlock(wx, y, wz, id);
    }
    // lava-like water at low
    if (h < 26) {
      for (let y = h + 1; y <= 26; y++) setBlock(wx, y, wz, BlockId.Water); // visual stand-in; tint via biome fog
    }
  }
}

export type DimId = 'overworld' | 'helvete';

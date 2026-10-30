import { BlockId } from '../blocks/types';
import type { World } from './world';
import { CHUNK_SIZE } from './chunk';
import { SeededNoise } from './noise';

/** «Helvete» — original hellish dimension (generation kept; transit deferred). */
export const HELVETE_SCALE = 8;

/**
 * Portal frame: 4 wide × 5 tall of PortalFrame, inner 2×3 air/portal.
 * Bottom-left corner of the OUTER frame is (fx, fy, fz), facing along X (dz=0) or Z (dx=0).
 */
export function findPortalFrame(
  world: World, x: number, y: number, z: number,
): { fx: number; fy: number; fz: number; dx: number; dz: number } | null {
  for (const [dx, dz] of [[1, 0], [0, 1]] as const) {
    for (let oy = -4; oy <= 1; oy++) {
      for (let o = -3; o <= 1; o++) {
        const fx = x + o * dx;
        const fz = z + o * dz;
        const fy = y + oy;
        if (isFrameAt(world, fx, fy, fz, dx, dz)) return { fx, fy, fz, dx, dz };
      }
    }
  }
  return null;
}

function isFrameAt(world: World, fx: number, fy: number, fz: number, dx: number, dz: number): boolean {
  // Outer 4×5 must be PortalFrame on border; interior 2×3 air or portal
  for (let h = 0; h < 5; h++) {
    for (let w = 0; w < 4; w++) {
      const wx = fx + w * dx;
      const wz = fz + w * dz;
      const wy = fy + h;
      const border = h === 0 || h === 4 || w === 0 || w === 3;
      const id = world.getBlock(wx, wy, wz);
      if (border) {
        if (id !== BlockId.PortalFrame) return false;
      } else {
        if (id !== BlockId.Air && id !== BlockId.Portal) return false;
      }
    }
  }
  return true;
}

export function isPortalFrameComplete(world: World, x: number, y: number, z: number): boolean {
  return findPortalFrame(world, x, y, z) != null;
}

export function lightPortal(world: World, x: number, y: number, z: number): boolean {
  const frame = findPortalFrame(world, x, y, z);
  if (!frame) return false;
  const { fx, fy, fz, dx, dz } = frame;
  for (let h = 1; h <= 3; h++) {
    for (let w = 1; w <= 2; w++) {
      const wx = fx + w * dx;
      const wz = fz + w * dz;
      const wy = fy + h;
      if (world.getBlock(wx, wy, wz) === BlockId.Air) world.setBlock(wx, wy, wz, BlockId.Portal);
    }
  }
  return true;
}

/** Build a lit portal standing on ground at (ox, oy, oz) facing X. Returns frame origin. */
export function buildPortalFrame(world: World, ox: number, oy: number, oz: number): { x: number; y: number; z: number } {
  // Clear interior + place frame: bottom at oy, top at oy+4
  for (let h = 0; h < 5; h++) {
    for (let w = 0; w < 4; w++) {
      const border = h === 0 || h === 4 || w === 0 || w === 3;
      world.setBlock(ox + w, oy + h, oz, border ? BlockId.PortalFrame : BlockId.Air);
    }
  }
  lightPortal(world, ox + 1, oy + 1, oz);
  return { x: ox, y: oy, z: oz };
}

export function generateHelveteChunk(
  setBlock: (x: number, y: number, z: number, id: number) => void,
  noise: SeededNoise,
  cx: number,
  cz: number,
): void {
  const lavaTop = 28;
  for (let lz = 0; lz < CHUNK_SIZE; lz++) for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    const wx = cx * CHUNK_SIZE + lx, wz = cz * CHUNK_SIZE + lz;
    const n = noise.fbm2(wx * 0.035, wz * 0.035, 3);
    // Lower baseline so most columns are lava seas; ridges poke through
    const h = Math.floor(18 + n * 14); // ~11–32
    for (let y = 0; y <= h; y++) {
      let id: number = BlockId.Helstein;
      if (y === h) id = Math.random() > 0.8 ? BlockId.Sjelegrus : BlockId.Helstein;
      if (y < 3) id = BlockId.Stone;
      if (y === 0) id = BlockId.Bedrock; // MC nether also has a bedrock floor
      setBlock(wx, y, wz, id);
    }
    if (h < lavaTop) {
      for (let y = h + 1; y <= lavaTop; y++) setBlock(wx, y, wz, BlockId.Lava);
    }
    // Ceiling glowstone veins above lava / ridges
    const ceilN = noise.fbm2(wx * 0.08 + 40, wz * 0.08 + 40, 2);
    if (ceilN > 0.35) {
      const cy = Math.min(48, lavaTop + 8 + ((ceilN * 10) | 0));
      setBlock(wx, cy, wz, BlockId.Glodstein);
      if (ceilN > 0.55) setBlock(wx, cy - 1, wz, BlockId.Glodstein);
    }
  }
  // Guaranteed glowstone clusters near chunk centers (visible from spawn pads)
  const baseX = cx * CHUNK_SIZE + 8;
  const baseZ = cz * CHUNK_SIZE + 8;
  for (let i = 0; i < 5; i++) {
    const ox = baseX + ((i * 3) % 7) - 3;
    const oz = baseZ + ((i * 5) % 7) - 3;
    const oy = lavaTop + 3 + (i % 3);
    setBlock(ox, oy, oz, BlockId.Glodstein);
    setBlock(ox + 1, oy, oz, BlockId.Glodstein);
    setBlock(ox, oy, oz + 1, BlockId.Glodstein);
  }
}

export type DimId = 'overworld' | 'helvete';

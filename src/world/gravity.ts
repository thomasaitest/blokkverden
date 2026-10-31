import { BlockId, isSolid } from '../blocks/types';

/** Minimal world surface used by gravity / leaf decay (easy to fake in vitest). */
export interface BlockAccess {
  getBlock(x: number, y: number, z: number): number;
  setBlock(x: number, y: number, z: number, id: number): unknown;
}

/** MC: sand (and gravel) are gravity blocks. */
export function isGravityBlock(id: number): boolean { return id === BlockId.Sand || id === BlockId.Gravel; }

/** MC: blocks that need the block below them and pop off as an item when it goes. */
export function needsSupportBelow(id: number): boolean {
  return id === BlockId.Torch || id === BlockId.RedDust || id === BlockId.PressurePlate
    || id === BlockId.Crop || id === BlockId.Sapling || id === BlockId.TallGrass
    || id === BlockId.Dandelion || id === BlockId.Poppy || id === BlockId.Door
    || id === BlockId.DoubleGrass || id === BlockId.DoubleGrassTop;
}

/** Cells a falling block passes through (MC: air, water, lava, fire). */
function passable(id: number): boolean {
  return id === BlockId.Air || id === BlockId.Water || id === BlockId.Lava || id === BlockId.TallGrass || id === BlockId.Fire
    || id === BlockId.DoubleGrass || id === BlockId.DoubleGrassTop;
}

export type FallResult = { landedY: number } | { popped: true; atY: number } | null;

/**
 * Make the gravity block at (x,y,z) fall straight down if unsupported.
 * Lands on top of the first non-passable cell. If that cell is a non-colliding block
 * (torch, crop, red dust, sign…) the falling block breaks and drops as an item (MC).
 */
export function settleColumn(w: BlockAccess, x: number, y: number, z: number): FallResult {
  const id = w.getBlock(x, y, z);
  if (!isGravityBlock(id) || y <= 0) return null;
  if (!passable(w.getBlock(x, y - 1, z))) return null;
  let ny = y - 1;
  while (ny > 0 && passable(w.getBlock(x, ny - 1, z))) ny--;
  w.setBlock(x, y, z, BlockId.Air);
  const under = w.getBlock(x, ny - 1, z);
  if (ny > 0 && !isSolid(under) && !passable(under)) return { popped: true, atY: ny };
  w.setBlock(x, ny, z, id);
  return { landedY: ny };
}

/**
 * After the block at (x,y,z) changed: let any gravity column standing on it fall
 * (the whole stack above, bottom-up, like MC sand towers).
 */
export function updateGravityAround(w: BlockAccess, x: number, y: number, z: number, onPop?: (x: number, y: number, z: number, id: number) => void): number {
  let moved = 0;
  // the block itself (e.g. sand just placed in mid-air)
  const self = w.getBlock(x, y, z);
  if (isGravityBlock(self)) {
    const r = settleColumn(w, x, y, z);
    if (r) { moved++; if ('popped' in r) onPop?.(x, r.atY, z, self); }
  }
  // the column above, bottom-up
  for (let yy = y + 1; yy < y + 256; yy++) {
    const id = w.getBlock(x, yy, z);
    if (!isGravityBlock(id)) break;
    const r = settleColumn(w, x, yy, z);
    if (!r) break;
    moved++;
    if ('popped' in r) onPop?.(x, r.atY, z, id);
  }
  return moved;
}

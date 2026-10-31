import { BlockId } from '../blocks/types';
import type { BlockAccess } from './gravity';

/**
 * it21 (MC): double tall grass ("Large Fern/Tall Grass"): a two-block cross plant. The lower half (84)
 * stands on grass/dirt, the upper half (85) sits on top of it. Breaking or replacing either half removes both;
 * only the lower half drops anything. Bone meal on (short) tall grass grows it into double tall grass.
 */
export function isDoublePlant(id: number): boolean { return id === BlockId.DoubleGrass || id === BlockId.DoubleGrassTop; }

/** Grow tall grass at (x,y,z) into double tall grass (needs air above). Returns true if it grew. */
export function growDoubleGrass(w: BlockAccess, x: number, y: number, z: number): boolean {
  if (w.getBlock(x, y, z) !== BlockId.TallGrass || w.getBlock(x, y + 1, z) !== BlockId.Air) return false;
  w.setBlock(x, y, z, BlockId.DoubleGrass);
  w.setBlock(x, y + 1, z, BlockId.DoubleGrassTop);
  return true;
}

/**
 * The other half of a double plant at (x,y,z), or null. Used when one half is broken/replaced/washed away/burnt.
 */
export function otherHalf(w: BlockAccess, x: number, y: number, z: number): [number, number, number] | null {
  const id = w.getBlock(x, y, z);
  if (id === BlockId.DoubleGrass && w.getBlock(x, y + 1, z) === BlockId.DoubleGrassTop) return [x, y + 1, z];
  if (id === BlockId.DoubleGrassTop && w.getBlock(x, y - 1, z) === BlockId.DoubleGrass) return [x, y - 1, z];
  return null;
}

/** Remove the partner of the double plant that is (or was) at (x,y,z) with id `id`. Returns the lower half's position if one was removed. */
export function breakPartner(w: BlockAccess, x: number, y: number, z: number, id: number): [number, number, number] | null {
  if (id === BlockId.DoubleGrass && w.getBlock(x, y + 1, z) === BlockId.DoubleGrassTop) { w.setBlock(x, y + 1, z, BlockId.Air); return [x, y, z]; }
  if (id === BlockId.DoubleGrassTop && w.getBlock(x, y - 1, z) === BlockId.DoubleGrass) { w.setBlock(x, y - 1, z, BlockId.Air); return [x, y - 1, z]; }
  return null;
}

/** Sweep (cheap, local): an upper half with no lower half, or a lower half with no upper half, disappears. */
export function fixOrphans(w: BlockAccess, cx: number, cy: number, cz: number, r = 6): number {
  let n = 0;
  for (let y = cy - r; y <= cy + r; y++) for (let z = cz - r; z <= cz + r; z++) for (let x = cx - r; x <= cx + r; x++) {
    const id = w.getBlock(x, y, z);
    if (id === BlockId.DoubleGrassTop && w.getBlock(x, y - 1, z) !== BlockId.DoubleGrass) { w.setBlock(x, y, z, BlockId.Air); n++; }
    else if (id === BlockId.DoubleGrass && w.getBlock(x, y + 1, z) !== BlockId.DoubleGrassTop) { w.setBlock(x, y, z, BlockId.TallGrass); n++; }
  }
  return n;
}

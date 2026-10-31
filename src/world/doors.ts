import { BlockId, isReplaceable } from '../blocks/types';

/**
 * MC doors are two blocks tall. Blokkverden stores a door as one Door block (the lower half);
 * the cell above it is the door's upper half: it must stay free, and aiming at it targets the door.
 * Meta: bit0 = open, bit1 = opened by redstone, bits2–3 = facing (0..3, from the placer's yaw).
 */
export const DOOR_FACING_SHIFT = 2;

/** Facing 0..3 from player yaw (0 = looking −Z, 1 = −X, 2 = +Z, 3 = +X). */
export function doorFacingFromYaw(yaw: number): number {
  const q = Math.round(yaw / (Math.PI / 2));
  return ((q % 4) + 4) % 4;
}
export function doorFacing(meta: number): number { return (meta >> DOOR_FACING_SHIFT) & 3; }
export function doorOpen(meta: number): boolean { return (meta & 1) === 1; }

interface Access { getBlock(x: number, y: number, z: number): number }

/** True if (x,y,z) is the (virtual) upper half of a door. */
export function isDoorTop(w: Access, x: number, y: number, z: number): boolean {
  return w.getBlock(x, y, z) === BlockId.Air && w.getBlock(x, y - 1, z) === BlockId.Door;
}

/** MC: a door needs a solid block below and a free cell above. */
export function canPlaceDoor(w: Access, x: number, y: number, z: number, isSolidFn: (id: number) => boolean): boolean {
  return isReplaceable(w.getBlock(x, y, z)) && isReplaceable(w.getBlock(x, y + 1, z)) && w.getBlock(x, y + 1, z) !== BlockId.Water
    && isSolidFn(w.getBlock(x, y - 1, z));
}

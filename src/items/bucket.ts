/**
 * it23 (MC): buckets. An empty bucket scoops up a water source (level 7) or lava; a water/lava bucket pours a
 * source into the cell in front of the clicked face (or replaces a plant / fire there). In Helvete water boils
 * away. Pure logic (no rendering) so it can be unit tested.
 */
import { BlockId, isSolid } from '../blocks/types';
import type { World } from '../world/world';
import { isWashable } from '../world/water';

export const BUCKET = 87, WATER_BUCKET = 88, LAVA_BUCKET = 89, MILK_BUCKET = 90;

/** it25 (MC): drinking milk (hold RMB 1.6 s) clears status effects (here: Sult from rotten flesh) and gives the bucket back. */
export function drinkMilk(p: { hungerEffect?: number }): number {
  p.hungerEffect = 0;
  return BUCKET;
}

/** First fluid cell along the ray (stops at any non-fluid, non-air block). Water must be a source (level 7). */
export function fluidRaycast(world: World, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist = 5):
  { x: number; y: number; z: number; id: number; dist: number } | null {
  let lx = NaN, ly = NaN, lz = NaN;
  for (let t = 0; t <= maxDist; t += 0.02) {
    const x = Math.floor(ox + dx * t), y = Math.floor(oy + dy * t), z = Math.floor(oz + dz * t);
    if (x === lx && y === ly && z === lz) continue;
    lx = x; ly = y; lz = z;
    const id = world.getBlock(x, y, z);
    if (id === BlockId.Water) { if ((world.getWaterLevel(x, y, z) || 7) === 7) return { x, y, z, id, dist: t }; continue; }
    if (id === BlockId.Lava) { if (world.getWaterLevel(x, y, z) === 0) return { x, y, z, id, dist: t }; continue; } // it24: only a lava source
    if (id !== BlockId.Air) return null;
  }
  return null;
}

/** Can a poured fluid go into this cell? (MC: air, flowing water, fire and plants are replaced.) */
export function pourable(world: World, x: number, y: number, z: number, fluid: number): boolean {
  const id = world.getBlock(x, y, z);
  if (id === BlockId.Air || id === BlockId.Fire) return true;
  if (id === BlockId.Water) return fluid === BlockId.Water;
  return isWashable(id) && !isSolid(id) && id !== BlockId.Torch && id !== BlockId.RedDust;
}

/** Scoop: returns the filled bucket id, or null if nothing was picked up. */
export function scoop(world: World, hit: { x: number; y: number; z: number; id: number }): number | null {
  if (hit.id === BlockId.Water) { world.setBlock(hit.x, hit.y, hit.z, BlockId.Air); return WATER_BUCKET; }
  if (hit.id === BlockId.Lava) { world.setBlock(hit.x, hit.y, hit.z, BlockId.Air); return LAVA_BUCKET; }
  return null;
}

/**
 * Pour: returns 'placed', 'boiled' (water in Helvete — bucket still empties), or null (nothing happened).
 * onReplace is called with the old block (plant/fire) before it is replaced, e.g. to drop it as an item.
 */
export function pour(world: World, bucketId: number, x: number, y: number, z: number, inHelvete: boolean,
  onReplace?: (id: number) => void): 'placed' | 'boiled' | null {
  const fluid = bucketId === WATER_BUCKET ? BlockId.Water : bucketId === LAVA_BUCKET ? BlockId.Lava : -1;
  if (fluid < 0 || !pourable(world, x, y, z, fluid)) return null;
  if (fluid === BlockId.Water && inHelvete) return 'boiled';
  const old = world.getBlock(x, y, z);
  if (old !== BlockId.Air && old !== BlockId.Water) onReplace?.(old);
  if (fluid === BlockId.Water) {
    if (old !== BlockId.Water) world.setBlock(x, y, z, BlockId.Air);
    world.setWater(x, y, z, 7);
  } else {
    world.setBlock(x, y, z, BlockId.Lava);
  }
  return 'placed';
}

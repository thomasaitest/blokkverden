import { BlockId } from '../blocks/types';
import type { BlockAccess } from './gravity';

/** MC: saplings can be planted on grass, dirt (and podzol/farmland). */
export function canPlantSapling(ground: number): boolean {
  return ground === BlockId.Grass || ground === BlockId.Dirt || ground === BlockId.SnowGrass || ground === BlockId.Farmland;
}

/** Blocks a growing tree may overwrite (MC: air, leaves, plants). */
function treeReplaceable(id: number): boolean {
  return id === BlockId.Air || id === BlockId.Leaves || id === BlockId.TallGrass || id === BlockId.Sapling;
}

/**
 * Grow an oak at the sapling (x,y,z): 4–6 log trunk + leaf canopy (same shape as world-gen trees).
 * MC: needs room — every trunk cell and the space above must be free, else the sapling waits.
 * Returns true if the tree grew.
 */
export function growOak(w: BlockAccess, x: number, y: number, z: number, rnd: () => number = Math.random, maxY = 127): boolean {
  if (w.getBlock(x, y, z) !== BlockId.Sapling) return false;
  if (!canPlantSapling(w.getBlock(x, y - 1, z))) return false;
  const trunkH = 4 + Math.floor(rnd() * 3);
  if (y + trunkH + 2 > maxY) return false;
  for (let i = 1; i <= trunkH + 1; i++) if (!treeReplaceable(w.getBlock(x, y + i, z))) return false;
  const top = y + trunkH - 1;
  const cut = rnd();
  if (w.getBlock(x, y - 1, z) !== BlockId.Farmland) w.setBlock(x, y - 1, z, BlockId.Dirt); // MC: grass under a tree turns to dirt
  for (let i = 0; i < trunkH; i++) w.setBlock(x, y + i, z, BlockId.Log);
  for (let dy = -1; dy <= 2; dy++) {
    const r = dy >= 1 ? 1 : 2;
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      if (dx === 0 && dz === 0 && dy < 2) continue;
      if (Math.abs(dx) === r && Math.abs(dz) === r && cut < 0.4) continue;
      const px = x + dx, py = top + dy, pz = z + dz;
      const cur = w.getBlock(px, py, pz);
      if (cur === BlockId.Air || cur === BlockId.TallGrass) w.setBlock(px, py, pz, BlockId.Leaves);
    }
  }
  return true;
}

/** Light needed for a sapling to grow (MC: 9). */
export const SAPLING_MIN_LIGHT = 9;
/**
 * Chance per sapling per 1.2 s growth tick. MC oak: random tick (~68 s avg at speed 3) × 1/7 × 2 stages
 * ≈ 16 min. Blokkverden uses ~2–5 min so a planted forest is visible within a play session.
 */
export const SAPLING_GROW_CHANCE = 0.0075;

import { BlockId } from '../blocks/types';
import { growOak } from './saplings';
import { growDoubleGrass } from './doubleGrass';

export interface BoneMealAccess {
  getBlock(x: number, y: number, z: number): number;
  setBlock(x: number, y: number, z: number, id: number): unknown;
  getWaterLevel(x: number, y: number, z: number): number;
  setMeta(x: number, y: number, z: number, meta: number): void;
}

/** What bone meal can be used on (MC: unripe crops, saplings, grass blocks with air above). */
export function boneMealTarget(w: BoneMealAccess, x: number, y: number, z: number): 'crop' | 'sapling' | 'grass' | 'tallgrass' | null {
  const id = w.getBlock(x, y, z);
  if (id === BlockId.Crop) return w.getWaterLevel(x, y, z) < 7 ? 'crop' : null;
  if (id === BlockId.Sapling) return 'sapling';
  // it21 (MC): bone meal on tall grass grows double tall grass (needs room above)
  if (id === BlockId.TallGrass && w.getBlock(x, y + 1, z) === BlockId.Air) return 'tallgrass';
  if (id === BlockId.Grass && w.getBlock(x, y + 1, z) === BlockId.Air) return 'grass';
  return null;
}

/**
 * MC bone meal (right-click). Returns true if it was used up.
 * - crop: +2–5 growth stages (max 7)
 * - sapling: 45 % chance to grow the tree now (needs room); used up either way
 * - grass block: tall grass (and the odd flower) on nearby grass blocks with air above
 */
export function applyBoneMeal(w: BoneMealAccess, x: number, y: number, z: number, rnd: () => number = Math.random, maxY = 127): boolean {
  const t = boneMealTarget(w, x, y, z);
  if (!t) return false;
  if (t === 'crop') {
    const lvl = w.getWaterLevel(x, y, z);
    w.setMeta(x, y, z, Math.min(7, lvl + 2 + Math.floor(rnd() * 4)));
    return true;
  }
  if (t === 'sapling') {
    if (rnd() < 0.45) growOak(w, x, y, z, rnd, maxY);
    return true;
  }
  if (t === 'tallgrass') return growDoubleGrass(w, x, y, z);
  // grass: the clicked block's top always gets a tuft; then 32 random spots within 3 blocks (±1 in height)
  w.setBlock(x, y + 1, z, BlockId.TallGrass);
  for (let i = 0; i < 32; i++) {
    const gx = x + Math.floor(rnd() * 7) - 3, gz = z + Math.floor(rnd() * 7) - 3;
    let gy = -1;
    for (const dy of [0, 1, -1]) if (w.getBlock(gx, y + dy, gz) === BlockId.Grass && w.getBlock(gx, y + dy + 1, gz) === BlockId.Air) { gy = y + dy; break; }
    if (gy < 0) continue;
    if (rnd() < 0.35) continue; // MC: patchy, not a full carpet
    const r = rnd();
    w.setBlock(gx, gy + 1, gz, r < 0.06 ? BlockId.Dandelion : r < 0.1 ? BlockId.Poppy : BlockId.TallGrass);
  }
  return true;
}

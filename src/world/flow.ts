/**
 * it25 (MC): liquid current. Like MC's FlowingFluid.getFlow: the flow direction of a liquid cell is the sum of
 * height differences to its horizontal neighbours (towards lower liquid, and towards a drop where the liquid below
 * the neighbour is the same liquid). Entities in flowing liquid are pushed along it; still pools (all sources) don't push.
 */
import { BlockId } from '../blocks/types';
import { lavaHeight } from './lava';

type Get = (x: number, y: number, z: number) => number;

const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

/** Liquid surface height (0..1) of a cell, 0 if not that liquid. Water: source 7 → 7/8, flowing n → n/8, falling 1. */
export function liquidHeight(id: number, meta: number, liquid: number): number {
  if (id !== liquid) return 0;
  if (liquid === BlockId.Lava) return meta === 0 ? 1 : lavaHeight(meta);
  const lvl = meta || 7;
  return lvl >= 8 ? 1 : lvl / 8;
}

function solidish(id: number): boolean {
  return id !== BlockId.Air && id !== BlockId.Water && id !== BlockId.Lava && id !== BlockId.Fire
    && id !== BlockId.Torch && id !== BlockId.TallGrass && id !== BlockId.Dandelion && id !== BlockId.Poppy
    && id !== BlockId.Sapling && id !== BlockId.Crop && id !== BlockId.RedDust
    && id !== BlockId.DoubleGrass && id !== BlockId.DoubleGrassTop;
}

/** Normalised horizontal flow (x,z) at a liquid cell, or {0,0}. */
export function flowAt(getBlock: Get, getMeta: Get, x: number, y: number, z: number): { x: number; z: number } {
  const id = getBlock(x, y, z);
  if (id !== BlockId.Water && id !== BlockId.Lava) return { x: 0, z: 0 };
  const own = liquidHeight(id, getMeta(x, y, z), id);
  let fx = 0, fz = 0;
  for (const [dx, dz] of SIDES) {
    const nx = x + dx, nz = z + dz;
    const nid = getBlock(nx, y, nz);
    let diff = 0;
    if (nid === id) {
      diff = own - liquidHeight(nid, getMeta(nx, y, nz), id);
    } else if (!solidish(nid)) {
      // MC: an open neighbour with the same liquid below it pulls the flow towards the drop
      const bid = getBlock(nx, y - 1, nz);
      if (bid === id) diff = own - (liquidHeight(bid, getMeta(nx, y - 1, nz), id) - 0.875);
    }
    fx += dx * diff; fz += dz * diff;
  }
  const len = Math.hypot(fx, fz);
  if (len < 1e-6) return { x: 0, z: 0 };
  return { x: fx / len, z: fz / len };
}

/** MC push speeds (blocks/s at steady state): water ≈ 1.4, lava much weaker (stronger in Helvete). */
export const WATER_PUSH = 1.4;
export const LAVA_PUSH = 0.35;
export const LAVA_PUSH_HELVETE = 0.9;

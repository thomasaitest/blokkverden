import { BlockId } from '../blocks/types';
import { CHUNK_HEIGHT, CHUNK_SIZE, chunkKey } from './chunk';
import type { World } from './world';

/** MC: flowing water breaks these and pops them as items (torch, red dust, plants). */
export function isWashable(id: number): boolean {
  return id === BlockId.Torch || id === BlockId.RedDust || id === BlockId.Crop
    || id === BlockId.Sapling || id === BlockId.TallGrass || id === BlockId.Dandelion || id === BlockId.Poppy;
}

/** Update budget for the 3×3 chunks around the focus (player). */
export const NEAR_BUDGET = 400;

/** Tick flowing water with a budget. onWash is called for each washable block water flows into (before it is replaced). */
export function tickWater(
  world: World, budget = 80, onWash?: (x: number, y: number, z: number, id: number) => void,
  focus?: { x: number; z: number; radius?: number },
): number {
  let n = 0;
  const updates: { x: number; y: number; z: number; level: number }[] = [];
  // Never flow into chunks that aren't generated (it18: water at the edge of the loaded area kept
  // generating new chunks forever and ate the whole update budget, so water near you never moved).
  const loaded = (x: number, z: number) => world.hasChunkAt(x, z);

  // Nearest chunks first (MC only ticks fluids near players)
  let chunks = [...world.chunks.values()];
  if (focus) {
    const fcx = Math.floor(focus.x / CHUNK_SIZE), fcz = Math.floor(focus.z / CHUNK_SIZE), r = focus.radius ?? 4;
    chunks = chunks.filter((c) => Math.abs(c.cx - fcx) <= r && Math.abs(c.cz - fcz) <= r)
      .sort((a, b) => (Math.abs(a.cx - fcx) + Math.abs(a.cz - fcz)) - (Math.abs(b.cx - fcx) + Math.abs(b.cz - fcz)));
  }

  const fcx = focus ? Math.floor(focus.x / CHUNK_SIZE) : 0, fcz = focus ? Math.floor(focus.z / CHUNK_SIZE) : 0;
  for (const c of chunks) {
    // the 3×3 chunks around the focus get a much larger budget so water you pour always flows
    const near = !!focus && Math.abs(c.cx - fcx) <= 1 && Math.abs(c.cz - fcz) <= 1;
    const limit = near ? Math.max(budget, NEAR_BUDGET) : budget;
    if (n >= limit) { if (near) continue; break; }
    const ox = c.cx * CHUNK_SIZE;
    const oz = c.cz * CHUNK_SIZE;
    for (let y = 0; y < CHUNK_HEIGHT && n < limit; y++) {
      for (let lz = 0; lz < CHUNK_SIZE && n < limit; lz++) {
        for (let lx = 0; lx < CHUNK_SIZE && n < limit; lx++) {
          if (c.get(lx, y, lz) !== BlockId.Water) continue;
          const level = c.waterLevel[c.index(lx, y, lz)] || 7;
          const wx = ox + lx;
          const wz = oz + lz;

          // Fall down
          if (y > 0) {
            const below = world.getBlock(wx, y - 1, wz);
            if (below === BlockId.Air || isWashable(below)) {
              updates.push({ x: wx, y: y - 1, z: wz, level: 7 });
              n++;
              continue;
            }
            if (below === BlockId.Water) {
              const bl = world.getWaterLevel(wx, y - 1, wz);
              if (bl < 7) {
                updates.push({ x: wx, y: y - 1, z: wz, level: 7 });
                n++;
              }
            }
          }

          if (level <= 1) continue;
          // Spread horizontally
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
            const nx = wx + dx;
            const nz = wz + dz;
            if (!loaded(nx, nz)) continue;
            const nb = world.getBlock(nx, y, nz);
            if (nb === BlockId.Air || isWashable(nb)) {
              updates.push({ x: nx, y, z: nz, level: level - 1 });
              n++;
            } else if (nb === BlockId.Water) {
              const ol = world.getWaterLevel(nx, y, nz);
              if (ol < level - 1) {
                updates.push({ x: nx, y, z: nz, level: level - 1 });
                n++;
              }
            }
          }
        }
      }
    }
  }

  for (const u of updates) {
    const cur = world.getBlock(u.x, u.y, u.z);
    if (isWashable(cur)) {
      onWash?.(u.x, u.y, u.z, cur);
      if (world.getBlock(u.x, u.y, u.z) !== BlockId.Air) world.setBlock(u.x, u.y, u.z, BlockId.Air);
    }
    world.setWater(u.x, u.y, u.z, u.level);
  }
  return updates.length;
}

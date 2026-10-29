import { BlockId } from '../blocks/types';
import { CHUNK_HEIGHT, CHUNK_SIZE, chunkKey } from './chunk';
import type { World } from './world';

/** Tick flowing water with a budget. */
export function tickWater(world: World, budget = 80): number {
  let n = 0;
  const updates: { x: number; y: number; z: number; level: number }[] = [];

  for (const c of world.chunks.values()) {
    if (n >= budget) break;
    const ox = c.cx * CHUNK_SIZE;
    const oz = c.cz * CHUNK_SIZE;
    for (let y = 0; y < CHUNK_HEIGHT && n < budget; y++) {
      for (let lz = 0; lz < CHUNK_SIZE && n < budget; lz++) {
        for (let lx = 0; lx < CHUNK_SIZE && n < budget; lx++) {
          if (c.get(lx, y, lz) !== BlockId.Water) continue;
          const level = c.waterLevel[c.index(lx, y, lz)] || 7;
          const wx = ox + lx;
          const wz = oz + lz;

          // Fall down
          if (y > 0) {
            const below = world.getBlock(wx, y - 1, wz);
            if (below === BlockId.Air) {
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
            const nb = world.getBlock(nx, y, nz);
            if (nb === BlockId.Air) {
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
    world.setWater(u.x, u.y, u.z, u.level);
  }
  return updates.length;
}

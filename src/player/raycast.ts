import { isSolid, BlockId, BLOCKS } from '../blocks/types';
import type { World } from '../world/world';
import type { PlayerState } from './physics';
import { EYE_HEIGHT } from './physics';
import { selectionBox } from '../world/outline';
import { ladderWall } from '../world/ladder';

/** it21 (MC): thin/small blocks are only hit inside their real outline — you can click the wall beside a ladder
 * or past the edge of a tuft of grass instead of the whole cell. */
function shapedTarget(id: number): boolean {
  return id === BlockId.Ladder || id === BlockId.TallGrass || id === BlockId.Sapling || id === BlockId.Dandelion
    || id === BlockId.Poppy || id === BlockId.DoubleGrass || id === BlockId.DoubleGrassTop;
}

/** Ray vs. box (cell + local box). Returns entry t and face normal, or null. */
function rayBox(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, b: number[], cx: number, cy: number, cz: number):
  { t: number; nx: number; ny: number; nz: number } | null {
  let tmin = -Infinity, tmax = Infinity, nx = 0, ny = 0, nz = 0;
  const o = [ox, oy, oz], d = [dx, dy, dz], c = [cx, cy, cz];
  for (let a = 0; a < 3; a++) {
    const lo = c[a] + b[a], hi = c[a] + b[a + 3];
    if (Math.abs(d[a]) < 1e-12) { if (o[a] < lo || o[a] > hi) return null; continue; }
    let t1 = (lo - o[a]) / d[a], t2 = (hi - o[a]) / d[a];
    let sgn = -1;
    if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; sgn = 1; }
    if (t1 > tmin) { tmin = t1; nx = a === 0 ? sgn : 0; ny = a === 1 ? sgn : 0; nz = a === 2 ? sgn : 0; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (tmax < 0) return null;
  return { t: Math.max(0, tmin), nx, ny, nz };
}

export interface Hit {
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
  dist: number;
}

/** DDA voxel raycast from eye. */
export function raycast(world: World, p: PlayerState, maxDist = 6): Hit | null {
  const eyeY = p.y + EYE_HEIGHT;
  const cosP = Math.cos(p.pitch);
  const dx = -Math.sin(p.yaw) * cosP;
  const dy = Math.sin(p.pitch);
  const dz = -Math.cos(p.yaw) * cosP;

  let x = p.x;
  let y = eyeY;
  let z = p.z;

  let ix = Math.floor(x);
  let iy = Math.floor(y);
  let iz = Math.floor(z);

  const stepX = dx >= 0 ? 1 : -1;
  const stepY = dy >= 0 ? 1 : -1;
  const stepZ = dz >= 0 ? 1 : -1;

  const tDeltaX = dx === 0 ? Infinity : Math.abs(1 / dx);
  const tDeltaY = dy === 0 ? Infinity : Math.abs(1 / dy);
  const tDeltaZ = dz === 0 ? Infinity : Math.abs(1 / dz);

  let tMaxX = dx === 0 ? Infinity : ((stepX > 0 ? ix + 1 - x : x - ix) * tDeltaX);
  let tMaxY = dy === 0 ? Infinity : ((stepY > 0 ? iy + 1 - y : y - iy) * tDeltaY);
  let tMaxZ = dz === 0 ? Infinity : ((stepZ > 0 ? iz + 1 - z : z - iz) * tDeltaZ);

  let nx = 0;
  let ny = 0;
  let nz = 0;
  let t = 0;

  for (let i = 0; i < 100 && t <= maxDist; i++) {
    const id = world.getBlock(ix, iy, iz);
    // MC: every block with an outline is targetable — incl. torches, crops, plants, ladders, red dust (it17: were skipped)
    if (id !== BlockId.Air && id !== BlockId.Water && id !== BlockId.Lava && id !== BlockId.Portal && (isSolid(id) || BLOCKS[id] != null)) {
      if (!shapedTarget(id)) return { x: ix, y: iy, z: iz, nx, ny, nz, dist: t };
      const meta = world.getWaterLevel(ix, iy, iz);
      const box = selectionBox(id, meta, meta, id === BlockId.Ladder ? ladderWall(meta, (a, b, c) => world.getBlock(a, b, c), ix, iy, iz) : 2);
      const h = rayBox(x, y, z, dx, dy, dz, box, ix, iy, iz);
      if (h && h.t <= maxDist) return { x: ix, y: iy, z: iz, nx: h.nx, ny: h.ny, nz: h.nz, dist: h.t };
    }
    // MC: a door is 2 blocks tall — the cell above a Door block is its upper half and targets the door
    if (id === BlockId.Air && world.getBlock(ix, iy - 1, iz) === BlockId.Door) {
      return { x: ix, y: iy - 1, z: iz, nx, ny, nz, dist: t };
    }

    if (tMaxX < tMaxY) {
      if (tMaxX < tMaxZ) {
        ix += stepX;
        t = tMaxX;
        tMaxX += tDeltaX;
        nx = -stepX;
        ny = 0;
        nz = 0;
      } else {
        iz += stepZ;
        t = tMaxZ;
        tMaxZ += tDeltaZ;
        nx = 0;
        ny = 0;
        nz = -stepZ;
      }
    } else {
      if (tMaxY < tMaxZ) {
        iy += stepY;
        t = tMaxY;
        tMaxY += tDeltaY;
        nx = 0;
        ny = -stepY;
        nz = 0;
      } else {
        iz += stepZ;
        t = tMaxZ;
        tMaxZ += tDeltaZ;
        nx = 0;
        ny = 0;
        nz = -stepZ;
      }
    }
  }
  return null;
}

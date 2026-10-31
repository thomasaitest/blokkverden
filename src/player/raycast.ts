import { isSolid, BlockId, BLOCKS } from '../blocks/types';
import type { World } from '../world/world';
import type { PlayerState } from './physics';
import { EYE_HEIGHT } from './physics';

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
      return { x: ix, y: iy, z: iz, nx, ny, nz, dist: t };
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

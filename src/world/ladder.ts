import { BlockId, isSolid } from '../blocks/types';

/**
 * it21 (MC): a ladder hangs flat against the wall it was placed on (thin 3/16 panel), not a full see-through cube.
 * Meta = 1 + wall direction (0 = wall on −X, 1 = +X, 2 = −Z, 3 = +Z). Meta 0 (old worlds / setup) = the first
 * solid neighbour, or −Z.
 */
const DIRS: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];

/** Wall direction for a ladder placed against the face with normal (nx, nz) of the clicked block. null = not a side face. */
export function ladderMetaFromNormal(nx: number, ny: number, nz: number): number | null {
  if (ny !== 0) return null;
  if (nx === 1) return 1 + 0;
  if (nx === -1) return 1 + 1;
  if (nz === 1) return 1 + 2;
  if (nz === -1) return 1 + 3;
  return null;
}

export function ladderWall(meta: number, get: (x: number, y: number, z: number) => number, x: number, y: number, z: number): number {
  if (meta >= 1 && meta <= 4) return meta - 1;
  for (let d = 0; d < 4; d++) if (isSolid(get(x + DIRS[d][0], y, z + DIRS[d][1]))) return d;
  return 2;
}

export const LADDER_THICKNESS = 3 / 16;

/** [x0, z0, x1, z1] of the ladder panel inside its block. */
export function ladderPanel(wall: number): [number, number, number, number] {
  const t = LADDER_THICKNESS;
  switch (wall) {
    case 0: return [0, 0, t, 1];
    case 1: return [1 - t, 0, 1, 1];
    case 2: return [0, 0, 1, t];
    default: return [0, 1 - t, 1, 1];
  }
}

export function isLadder(id: number): boolean { return id === BlockId.Ladder; }

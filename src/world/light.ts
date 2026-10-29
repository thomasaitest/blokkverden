import { isOpaque, lightEmission, BlockId } from '../blocks/types';
import { CHUNK_HEIGHT, CHUNK_SIZE, type Chunk } from './chunk';

type GetBlock = (x: number, y: number, z: number) => number;

const DIRS: [number, number, number][] = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];

/** Recompute sky + block light for one chunk (local only, neighbors read-only for emission edges). */
export function relightChunk(chunk: Chunk, getBlock: GetBlock): void {
  const ox = chunk.cx * CHUNK_SIZE;
  const oz = chunk.cz * CHUNK_SIZE;

  chunk.skyLight.fill(0);
  chunk.blockLight.fill(0);

  // Sky columns
  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      let light = 15;
      for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
        const id = chunk.get(lx, y, lz);
        if (isOpaque(id)) light = 0;
        else if (id === BlockId.Water || id === BlockId.Leaves) light = Math.max(0, light - 2);
        chunk.skyLight[chunk.index(lx, y, lz)] = light;
      }
    }
  }

  // Propagate sky within chunk only
  const skyQ: number[] = [];
  for (let y = 0; y < CHUNK_HEIGHT; y++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const v = chunk.skyLight[chunk.index(lx, y, lz)];
        if (v > 1) skyQ.push(lx, y, lz, v);
      }
    }
  }
  floodLocal(chunk, skyQ, true);

  // Block light emitters in this chunk
  const blkQ: number[] = [];
  for (let y = 0; y < CHUNK_HEIGHT; y++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const emit = lightEmission(chunk.get(lx, y, lz));
        if (emit > 0) {
          chunk.blockLight[chunk.index(lx, y, lz)] = emit;
          blkQ.push(lx, y, lz, emit);
        }
      }
    }
  }
  // Also check world neighbors for torches just outside — sample border via getBlock
  for (let y = 0; y < CHUNK_HEIGHT; y++) {
    for (let t = 0; t < CHUNK_SIZE; t++) {
      const borders: [number, number, number][] = [
        [ox - 1, y, oz + t],
        [ox + CHUNK_SIZE, y, oz + t],
        [ox + t, y, oz - 1],
        [ox + t, y, oz + CHUNK_SIZE],
      ];
      for (const [wx, wy, wz] of borders) {
        const emit = lightEmission(getBlock(wx, wy, wz));
        if (emit <= 1) continue;
        // Seed into adjacent in-chunk cell
        const lx = Math.min(CHUNK_SIZE - 1, Math.max(0, wx - ox));
        const lz = Math.min(CHUNK_SIZE - 1, Math.max(0, wz - oz));
        // Better: neighbor cell just inside
        let ilx = lx, ilz = lz;
        if (wx < ox) ilx = 0;
        else if (wx >= ox + CHUNK_SIZE) ilx = CHUNK_SIZE - 1;
        if (wz < oz) ilz = 0;
        else if (wz >= oz + CHUNK_SIZE) ilz = CHUNK_SIZE - 1;
        const next = emit - 1;
        if (next > chunk.blockLight[chunk.index(ilx, wy, ilz)]) {
          chunk.blockLight[chunk.index(ilx, wy, ilz)] = next;
          blkQ.push(ilx, wy, ilz, next);
        }
      }
    }
  }
  floodLocal(chunk, blkQ, false);

  chunk.lightDirty = false;
}

function floodLocal(chunk: Chunk, q: number[], isSky: boolean): void {
  const light = isSky ? chunk.skyLight : chunk.blockLight;
  let qi = 0;
  let guard = 0;
  const maxSteps = CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT * 6;
  while (qi < q.length && guard++ < maxSteps) {
    const lx = q[qi++];
    const y = q[qi++];
    const lz = q[qi++];
    const lv = q[qi++];
    for (const [dx, dy, dz] of DIRS) {
      const nx = lx + dx;
      const ny = y + dy;
      const nz = lz + dz;
      if (nx < 0 || nz < 0 || ny < 0 || nx >= CHUNK_SIZE || nz >= CHUNK_SIZE || ny >= CHUNK_HEIGHT) continue;
      const id = chunk.get(nx, ny, nz);
      if (isOpaque(id)) continue;
      let next = lv - 1;
      if (id === BlockId.Water || id === BlockId.Leaves) next -= 1;
      if (next <= 0) continue;
      const i = chunk.index(nx, ny, nz);
      if (light[i] >= next) continue;
      light[i] = next;
      q.push(nx, ny, nz, next);
    }
  }
}

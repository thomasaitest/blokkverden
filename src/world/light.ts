import { isOpaque, lightEmission, BlockId } from '../blocks/types';
import { CHUNK_HEIGHT, CHUNK_SIZE, type Chunk, chunkKey } from './chunk';

type GetBlock = (x: number, y: number, z: number) => number;
type GetChunk = (cx: number, cz: number) => Chunk | undefined;

const DIRS: [number, number, number][] = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];

/** Relight chunk and push light into loaded neighbors (bounded). */
export function relightChunk(chunk: Chunk, getBlock: GetBlock, getChunk: GetChunk): void {
  const ox = chunk.cx * CHUNK_SIZE;
  const oz = chunk.cz * CHUNK_SIZE;
  chunk.skyLight.fill(0);
  chunk.blockLight.fill(0);

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

  const skyQ: number[] = [];
  for (let y = 0; y < CHUNK_HEIGHT; y++)
    for (let lz = 0; lz < CHUNK_SIZE; lz++)
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const v = chunk.skyLight[chunk.index(lx, y, lz)];
        if (v > 1) skyQ.push(ox + lx, y, oz + lz, v);
      }
  floodWorld(skyQ, getBlock, getChunk, true);

  const blkQ: number[] = [];
  for (let y = 0; y < CHUNK_HEIGHT; y++)
    for (let lz = 0; lz < CHUNK_SIZE; lz++)
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const bid = chunk.get(lx, y, lz);
        let emit = lightEmission(bid);
        // Powered lamp (meta bit0) emits like a torch
        if (bid === BlockId.Lamp && (chunk.waterLevel[chunk.index(lx, y, lz)] & 1)) emit = 15;
        if (emit > 0) {
          chunk.blockLight[chunk.index(lx, y, lz)] = emit;
          blkQ.push(ox + lx, y, oz + lz, emit);
        }
      }
  // Neighbor emitters near border
  for (const [dcx, dcz] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
    const n = getChunk(chunk.cx + dcx, chunk.cz + dcz);
    if (!n) continue;
    const nox = n.cx * CHUNK_SIZE, noz = n.cz * CHUNK_SIZE;
    for (let y = 0; y < CHUNK_HEIGHT; y++)
      for (let t = 0; t < CHUNK_SIZE; t++) {
        let lx = 0, lz = 0;
        if (dcx === -1) { lx = CHUNK_SIZE - 1; lz = t; }
        if (dcx === 1) { lx = 0; lz = t; }
        if (dcz === -1) { lx = t; lz = CHUNK_SIZE - 1; }
        if (dcz === 1) { lx = t; lz = 0; }
        const emit = lightEmission(n.get(lx, y, lz));
        if (emit > 1) blkQ.push(nox + lx, y, noz + lz, emit);
      }
  }
  floodWorld(blkQ, getBlock, getChunk, false);
  chunk.lightDirty = false;
}

function floodWorld(q: number[], getBlock: GetBlock, getChunk: GetChunk, isSky: boolean): void {
  let qi = 0;
  let guard = 0;
  const maxSteps = CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT * 24;
  while (qi < q.length && guard++ < maxSteps) {
    const x = q[qi++], y = q[qi++], z = q[qi++], lv = q[qi++];
    for (const [dx, dy, dz] of DIRS) {
      const nx = x + dx, ny = y + dy, nz = z + dz;
      if (ny < 0 || ny >= CHUNK_HEIGHT) continue;
      const id = getBlock(nx, ny, nz);
      if (isOpaque(id)) continue;
      let next = lv - 1;
      if (id === BlockId.Water || id === BlockId.Leaves) next -= 1;
      if (next <= 0) continue;
      const cx = Math.floor(nx / CHUNK_SIZE);
      const cz = Math.floor(nz / CHUNK_SIZE);
      const ch = getChunk(cx, cz);
      if (!ch) continue;
      const lx = nx - cx * CHUNK_SIZE;
      const lz = nz - cz * CHUNK_SIZE;
      const light = isSky ? ch.skyLight : ch.blockLight;
      const i = ch.index(lx, ny, lz);
      if (light[i] >= next) continue;
      light[i] = next;
      ch.dirty = true;
      q.push(nx, ny, nz, next);
    }
  }
}

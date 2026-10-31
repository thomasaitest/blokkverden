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
  floodWorld(blkQ, getBlock, getChunk, false);
  // it20: light from emitters in the 8 neighbouring chunks (torch a few blocks from the border). Before only
  // emitters right on the border row were seeded, so a torch 2+ blocks inside the neighbour lit nothing here.
  // Seeding from real emitters (not from the neighbour's stored light) can't create "ghost light".
  floodFromNeighbourEmitters(chunk, getBlock, getChunk);
  chunk.lightDirty = false;
}

function emissionAt(n: Chunk, lx: number, y: number, lz: number): number {
  const bid = n.get(lx, y, lz);
  let emit = lightEmission(bid);
  if (bid === BlockId.Lamp && (n.waterLevel[n.index(lx, y, lz)] & 1)) emit = 15;
  return emit;
}

/** Multi-source BFS from neighbour emitters; foreign cells use a scratch map, only `chunk` is written. */
export function floodFromNeighbourEmitters(chunk: Chunk, getBlock: GetBlock, getChunk: GetChunk): void {
  const ox = chunk.cx * CHUNK_SIZE, oz = chunk.cz * CHUNK_SIZE;
  const q: number[] = [];
  const seen = new Map<number, number>();
  const key = (x: number, y: number, z: number) => ((x + 32768) * 65536 + (z + 32768)) * 64 + y;
  for (let dcz = -1; dcz <= 1; dcz++) for (let dcx = -1; dcx <= 1; dcx++) {
    if (!dcx && !dcz) continue;
    const n = getChunk(chunk.cx + dcx, chunk.cz + dcz);
    if (!n) continue;
    const nox = n.cx * CHUNK_SIZE, noz = n.cz * CHUNK_SIZE;
    for (let lz = 0; lz < CHUNK_SIZE; lz++) for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const wx = nox + lx, wz = noz + lz;
      const ddx = wx < ox ? ox - wx : wx >= ox + CHUNK_SIZE ? wx - (ox + CHUNK_SIZE - 1) : 0;
      const ddz = wz < oz ? oz - wz : wz >= oz + CHUNK_SIZE ? wz - (oz + CHUNK_SIZE - 1) : 0;
      if (ddx + ddz >= 15) continue;
      for (let y = 0; y < CHUNK_HEIGHT; y++) {
        const emit = emissionAt(n, lx, y, lz);
        if (emit <= ddx + ddz) continue;
        q.push(wx, y, wz, emit);
        seen.set(key(wx, y, wz), emit);
      }
    }
  }
  if (!q.length) return;
  let qi = 0;
  while (qi < q.length) {
    const x = q[qi++], y = q[qi++], z = q[qi++], lv = q[qi++];
    for (const [dx, dy, dz] of DIRS) {
      const nx = x + dx, ny = y + dy, nz = z + dz;
      if (ny < 0 || ny >= CHUNK_HEIGHT) continue;
      // can't reach the chunk any more → stop early
      const ddx = nx < ox ? ox - nx : nx >= ox + CHUNK_SIZE ? nx - (ox + CHUNK_SIZE - 1) : 0;
      const ddz = nz < oz ? oz - nz : nz >= oz + CHUNK_SIZE ? nz - (oz + CHUNK_SIZE - 1) : 0;
      const id = getBlock(nx, ny, nz);
      if (isOpaque(id)) continue;
      let next = lv - 1;
      if (id === BlockId.Water || id === BlockId.Leaves) next -= 1;
      if (next <= 0 || next <= ddx + ddz) continue;
      if (!ddx && !ddz) {
        const i = chunk.index(nx - ox, ny, nz - oz);
        if (chunk.blockLight[i] >= next) continue;
        chunk.blockLight[i] = next;
      } else {
        const k = key(nx, ny, nz);
        if ((seen.get(k) ?? 0) >= next) continue;
        seen.set(k, next);
      }
      q.push(nx, ny, nz, next);
    }
  }
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

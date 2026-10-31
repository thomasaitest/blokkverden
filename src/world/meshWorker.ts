/// <reference lib="webworker" />
import { Chunk, CHUNK_HEIGHT, CHUNK_SIZE } from './chunk';
import { meshChunk, meshToTransferables } from './mesher';

export interface MeshJob {
  key: string;
  dim?: string;
  cx: number;
  cz: number;
  blocks: Uint8Array;
  skyLight: Uint8Array;
  blockLight: Uint8Array;
  waterLevel: Uint8Array;
  /** Neighbor edge strips for face culling: -X,+X,-Z,+Z as packed blocks+light */
  edges: {
    negX: Uint8Array; posX: Uint8Array; negZ: Uint8Array; posZ: Uint8Array;
    negXLight: Uint8Array; posXLight: Uint8Array; negZLight: Uint8Array; posZLight: Uint8Array;
  };
}

function buildGetters(job: MeshJob) {
  const chunk = new Chunk(job.cx, job.cz);
  chunk.blocks.set(job.blocks);
  chunk.skyLight.set(job.skyLight);
  chunk.blockLight.set(job.blockLight);
  chunk.waterLevel.set(job.waterLevel);
  chunk.generated = true;

  const ox = job.cx * CHUNK_SIZE;
  const oz = job.cz * CHUNK_SIZE;

  const edgeBlock = (arr: Uint8Array, y: number, t: number) => arr[t + y * CHUNK_SIZE];
  const edgeLight = (arr: Uint8Array, y: number, t: number) => arr[t + y * CHUNK_SIZE];

  const getBlock = (x: number, y: number, z: number): number => {
    if (y < 0 || y >= CHUNK_HEIGHT) return 0;
    const lx = x - ox;
    const lz = z - oz;
    if (lx >= 0 && lx < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE) return chunk.get(lx, y, lz);
    if (lx === -1 && lz >= 0 && lz < CHUNK_SIZE) return edgeBlock(job.edges.negX, y, lz);
    if (lx === CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE) return edgeBlock(job.edges.posX, y, lz);
    if (lz === -1 && lx >= 0 && lx < CHUNK_SIZE) return edgeBlock(job.edges.negZ, y, lx);
    if (lz === CHUNK_SIZE && lx >= 0 && lx < CHUNK_SIZE) return edgeBlock(job.edges.posZ, y, lx);
    return 0;
  };

  const getLight = (x: number, y: number, z: number): number => {
    if (y < 0 || y >= CHUNK_HEIGHT) return 15;
    const lx = x - ox;
    const lz = z - oz;
    if (lx >= 0 && lx < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE) {
      return chunk.skyLight[chunk.index(lx, y, lz)] | (chunk.blockLight[chunk.index(lx, y, lz)] << 4);
    }
    if (lx === -1 && lz >= 0 && lz < CHUNK_SIZE) return edgeLight(job.edges.negXLight, y, lz);
    if (lx === CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE) return edgeLight(job.edges.posXLight, y, lz);
    if (lz === -1 && lx >= 0 && lx < CHUNK_SIZE) return edgeLight(job.edges.negZLight, y, lx);
    if (lz === CHUNK_SIZE && lx >= 0 && lx < CHUNK_SIZE) return edgeLight(job.edges.posZLight, y, lx);
    return 15;
  };

  return { chunk, getBlock, getLight };
}

self.onmessage = (ev: MessageEvent<MeshJob>) => {
  const job = ev.data;
  const { chunk, getBlock, getLight } = buildGetters(job);
  const meshes = meshChunk(chunk, getBlock, getLight);
  const packed = meshToTransferables(meshes);
  const transfer: Transferable[] = [
    packed.opaque.p.buffer, packed.opaque.n.buffer, packed.opaque.u.buffer, packed.opaque.c.buffer, packed.opaque.i.buffer,
    packed.transparent.p.buffer, packed.transparent.n.buffer, packed.transparent.u.buffer, packed.transparent.c.buffer, packed.transparent.i.buffer,
  ];
  (self as unknown as Worker).postMessage({ key: job.key, dim: job.dim ?? 'overworld', meshes: packed }, transfer);
};

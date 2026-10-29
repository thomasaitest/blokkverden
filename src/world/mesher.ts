import { BLOCKS, isOpaque, BlockId } from '../blocks/types';
import { tileUV } from '../blocks/textures';
import { CHUNK_HEIGHT, CHUNK_SIZE, type Chunk } from './chunk';

export interface MeshData {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
}

export interface ChunkMeshes {
  opaque: MeshData;
  transparent: MeshData;
}

export type GetBlock = (x: number, y: number, z: number) => number;
export type GetLight = (x: number, y: number, z: number) => number;

const FACES: {
  dir: [number, number, number];
  corners: [number, number, number][];
  normal: [number, number, number];
  tile: 'top' | 'bottom' | 'side';
}[] = [
  { dir: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], normal: [0, 1, 0], tile: 'top' },
  { dir: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], normal: [0, -1, 0], tile: 'bottom' },
  { dir: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], normal: [0, 0, 1], tile: 'side' },
  { dir: [0, 0, -1], corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], normal: [0, 0, -1], tile: 'side' },
  { dir: [1, 0, 0], corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], normal: [1, 0, 0], tile: 'side' },
  { dir: [-1, 0, 0], corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], normal: [-1, 0, 0], tile: 'side' },
];

function aoCorner(get: GetBlock, x: number, y: number, z: number, dx: number, dy: number, dz: number): number {
  const side1 = isOpaque(get(x + dx, y + dy, z)) ? 1 : 0;
  const side2 = isOpaque(get(x, y + dy, z + dz)) ? 1 : 0;
  const corner = isOpaque(get(x + dx, y + dy, z + dz)) ? 1 : 0;
  if (side1 && side2) return 0;
  return 3 - (side1 + side2 + corner);
}

function emptyMesh(): MeshData {
  return {
    positions: new Float32Array(0),
    normals: new Float32Array(0),
    uvs: new Float32Array(0),
    colors: new Float32Array(0),
    indices: new Uint32Array(0),
  };
}

function buildMesh(
  chunk: Chunk,
  getWorld: GetBlock,
  getLight: GetLight,
  transparentPass: boolean,
): MeshData {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  let vBase = 0;
  const ox = chunk.cx * CHUNK_SIZE;
  const oz = chunk.cz * CHUNK_SIZE;

  for (let y = 0; y < CHUNK_HEIGHT; y++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const id = chunk.get(lx, y, lz);
        if (id === BlockId.Air) continue;
        // Torch: small cross — still use full block for simplicity, or skip opaque mesh and draw as transparent thin
        const def = BLOCKS[id];
        if (!def) continue;
        if (transparentPass !== def.transparent) continue;
        const wx = ox + lx;
        const wz = oz + lz;

        for (const face of FACES) {
          const nx = wx + face.dir[0];
          const ny = y + face.dir[1];
          const nz = wz + face.dir[2];
          const neighbor = getWorld(nx, ny, nz);
          const nDef = BLOCKS[neighbor];
          if (nDef?.opaque) continue;
          if (def.liquid && neighbor === id) continue;
          if (def.transparent && neighbor === id && id !== BlockId.Torch) continue;
          if (!def.transparent && nDef && !nDef.transparent && !nDef.liquid) continue;

          const tileIdx = def.tiles[face.tile];
          const uv = tileUV(tileIdx);
          const shade =
            face.dir[1] === 1 ? 1.0 : face.dir[1] === -1 ? 0.55 : face.dir[0] !== 0 ? 0.75 : 0.85;

          const aos: number[] = [];
          for (const c of face.corners) {
            let ao = 3;
            if (face.dir[1] !== 0) {
              ao = aoCorner(getWorld, wx + c[0], y + (face.dir[1] > 0 ? 1 : -1), wz + c[2], c[0] === 0 ? -1 : 1, 0, c[2] === 0 ? -1 : 1);
            } else if (face.dir[0] !== 0) {
              ao = aoCorner(getWorld, wx + face.dir[0], y + c[1], wz + c[2], 0, c[1] === 0 ? -1 : 1, c[2] === 0 ? -1 : 1);
            } else {
              ao = aoCorner(getWorld, wx + c[0], y + c[1], wz + face.dir[2], c[0] === 0 ? -1 : 1, c[1] === 0 ? -1 : 1, 0);
            }
            aos.push(ao / 3);
            positions.push(wx + c[0], y + c[1], wz + c[2]);
            normals.push(face.normal[0], face.normal[1], face.normal[2]);
          }
          uvs.push(uv.u0, uv.v1, uv.u1, uv.v1, uv.u1, uv.v0, uv.u0, uv.v0);

          // Sample light at face outward center
          const lx2 = getLight(wx + face.dir[0], y + face.dir[1], wz + face.dir[2]);
          const lightMul = 0.15 + (lx2 / 15) * 0.85;

          for (let i = 0; i < 4; i++) {
            const a = aos[i] * shade * lightMul;
            const alpha = def.transparent ? (def.liquid ? 0.55 : id === BlockId.Torch ? 0.95 : 0.75) : 1;
            colors.push(a, a, a, alpha);
          }

          if (aos[0] + aos[2] > aos[1] + aos[3]) {
            indices.push(vBase, vBase + 1, vBase + 2, vBase, vBase + 2, vBase + 3);
          } else {
            indices.push(vBase + 1, vBase + 2, vBase + 3, vBase + 1, vBase + 3, vBase);
          }
          vBase += 4;
        }
      }
    }
  }

  if (!positions.length) return emptyMesh();
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    colors: new Float32Array(colors),
    indices: new Uint32Array(indices),
  };
}

export function meshChunk(chunk: Chunk, getWorld: GetBlock, getLight: GetLight): ChunkMeshes {
  return {
    opaque: buildMesh(chunk, getWorld, getLight, false),
    transparent: buildMesh(chunk, getWorld, getLight, true),
  };
}

/** Serialize mesh to transferable buffers for worker replies. */
export function meshToTransferables(m: ChunkMeshes): {
  opaque: { p: Float32Array; n: Float32Array; u: Float32Array; c: Float32Array; i: Uint32Array };
  transparent: { p: Float32Array; n: Float32Array; u: Float32Array; c: Float32Array; i: Uint32Array };
} {
  const pack = (md: MeshData) => ({
    p: md.positions, n: md.normals, u: md.uvs, c: md.colors, i: md.indices,
  });
  return { opaque: pack(m.opaque), transparent: pack(m.transparent) };
}

export function meshFromTransferables(t: {
  opaque: { p: Float32Array; n: Float32Array; u: Float32Array; c: Float32Array; i: Uint32Array };
  transparent: { p: Float32Array; n: Float32Array; u: Float32Array; c: Float32Array; i: Uint32Array };
}): ChunkMeshes {
  const unpack = (x: { p: Float32Array; n: Float32Array; u: Float32Array; c: Float32Array; i: Uint32Array }): MeshData => ({
    positions: x.p, normals: x.n, uvs: x.u, colors: x.c, indices: x.i,
  });
  return { opaque: unpack(t.opaque), transparent: unpack(t.transparent) };
}

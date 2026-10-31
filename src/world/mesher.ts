import { BLOCKS, isOpaque, BlockId, isCrossPlant } from '../blocks/types';
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
export type GetMeta = (x: number, y: number, z: number) => number;

const FACES: {
  dir: [number, number, number];
  corners: [number, number, number][];
  normal: [number, number, number];
  tile: 'top' | 'bottom' | 'side';
  /** u axis and v axis in world space for greedy quad */
  uAxis: [number, number, number];
  vAxis: [number, number, number];
}[] = [
  { dir: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], normal: [0, 1, 0], tile: 'top', uAxis: [1,0,0], vAxis: [0,0,1] },
  { dir: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], normal: [0, -1, 0], tile: 'bottom', uAxis: [1,0,0], vAxis: [0,0,1] },
  { dir: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], normal: [0, 0, 1], tile: 'side', uAxis: [1,0,0], vAxis: [0,1,0] },
  { dir: [0, 0, -1], corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], normal: [0, 0, -1], tile: 'side', uAxis: [1,0,0], vAxis: [0,1,0] },
  { dir: [1, 0, 0], corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], normal: [1, 0, 0], tile: 'side', uAxis: [0,0,1], vAxis: [0,1,0] },
  { dir: [-1, 0, 0], corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], normal: [-1, 0, 0], tile: 'side', uAxis: [0,0,1], vAxis: [0,1,0] },
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

function isFullCube(id: number): boolean {
  if (id === BlockId.Air || id === BlockId.Water || id === BlockId.Lava) return false;
  if (id === BlockId.Torch || id === BlockId.Crop || id === BlockId.RedDust || isCrossPlant(id) || id === BlockId.Fire) return false;
  if (id === BlockId.Ladder || id === BlockId.Sign || id === BlockId.Portal) return false;
  if (id === BlockId.PressurePlate || id === BlockId.Button || id === BlockId.Lever) return false;
  if (id === BlockId.Slab || id === BlockId.Stairs || id === BlockId.Fence || id === BlockId.GlassPane) return false;
  if (id === BlockId.Door || id === BlockId.Gate || id === BlockId.Trapdoor) return false;
  if (id === BlockId.Lamp) return false; // emissive overlay in renderer
  const def = BLOCKS[id];
  return !!def && !def.liquid;
}

function faceExposed(id: number, neighbor: number, def: (typeof BLOCKS)[number]): boolean {
  const nDef = BLOCKS[neighbor];
  if (nDef?.opaque) return false;
  if (def.liquid && neighbor === id) return false;
  if (def.transparent && neighbor === id && id !== BlockId.Torch) return false;
  if (!def.transparent && nDef && !nDef.transparent && !nDef.liquid) return false;
  return true;
}

type Arrays = { positions: number[]; normals: number[]; uvs: number[]; colors: number[]; indices: number[]; vBase: number };

function emitQuad(
  a: Arrays,
  face: (typeof FACES)[number],
  wx: number, y: number, wz: number,
  du: number, dv: number,
  id: number,
  getWorld: GetBlock,
  getLight: GetLight,
  getMeta: GetMeta,
  hTop = 1,
): void {
  const def = BLOCKS[id]!;
  let tileIdx = def.tiles[face.tile];
  const meta = getMeta(wx, y, wz);
  if (id === BlockId.Crop) tileIdx = meta >= 7 ? 38 : 37;
  if (id === BlockId.RedDust && meta > 0) tileIdx = 69; // powered glow tile
  if (id === BlockId.Lamp && (meta & 1)) tileIdx = 70;
  const uv = tileUV(tileIdx);
  const shade = face.dir[1] === 1 ? 1.0 : face.dir[1] === -1 ? 0.55 : face.dir[0] !== 0 ? 0.75 : 0.85;
  const lx2 = getLight(wx + face.dir[0], y + face.dir[1], wz + face.dir[2]);
  // MC-like light curve: unlit caves (light 0) are near-black, torch/sky light ramps up steeply.
  // it16: the scene ambient now gives full texture colour at noon, so the old linear 0.15 floor made
  // pitch-dark caves look grey and lit.
  // it19: light is packed sky | block << 4. Vertex colour R(=B) = sky light, G = block light; the chunk
  // shader dims only the sky part at night (MC: torches/fire keep lighting the night).
  const lightMul = lightCurve(lx2 & 15);
  let blockMul = lightCurve(lx2 >> 4);
  // Powered redstone / lit lamp boost
  if (id === BlockId.RedDust && meta > 0) blockMul = Math.max(blockMul, 0.55 + meta / 15 * 0.45);
  if (id === BlockId.Lamp && (meta & 1)) blockMul = Math.max(blockMul, 1.0);

  // Quad corners: origin + u*du + v*dv mapped through face corners scale
  // Use face.corners as unit quad, scale U by du and V by dv along uAxis/vAxis
  const [ux, uy, uz] = face.uAxis;
  const [vx, vy, vz] = face.vAxis;
  // Base corner depends on face orientation — use first corner of unit face as origin of the merged rect
  // Simpler: place at (wx,y,wz) with size du×dv on the face plane using the 4 corners of a stretched unit face

  const corners: [number, number, number][] = [];
  // Map unit face corners: corner components that align with uAxis get *du, with vAxis get *dv
  for (const c of face.corners) {
    let px = wx, py = y, pz = wz;
    // apply corner offsets; stretch axes
    if (face.dir[1] !== 0) {
      // horizontal face: x and z
      px += c[0] === 0 ? 0 : du;
      pz += c[2] === 0 ? 0 : dv;
      py += c[1] === 1 ? hTop : 0;
    } else if (face.dir[0] !== 0) {
      px += face.dir[0] > 0 ? 1 : 0;
      pz += c[2] === 0 ? 0 : du;
      py += c[1] === 0 ? 0 : dv * hTop;
    } else {
      pz += face.dir[2] > 0 ? 1 : 0;
      px += c[0] === 0 ? 0 : du;
      py += c[1] === 0 ? 0 : dv * hTop;
    }
    corners.push([px, py, pz]);
  }
  void ux; void uy; void uz; void vx; void vy; void vz;

  const aos: number[] = [];
  for (let i = 0; i < 4; i++) {
    const c = face.corners[i];
    let ao = 3;
    if (du === 1 && dv === 1) {
      if (face.dir[1] !== 0) {
        ao = aoCorner(getWorld, wx + c[0], y + (face.dir[1] > 0 ? 1 : -1), wz + c[2], c[0] === 0 ? -1 : 1, 0, c[2] === 0 ? -1 : 1);
      } else if (face.dir[0] !== 0) {
        ao = aoCorner(getWorld, wx + face.dir[0], y + c[1], wz + c[2], 0, c[1] === 0 ? -1 : 1, c[2] === 0 ? -1 : 1);
      } else {
        ao = aoCorner(getWorld, wx + c[0], y + c[1], wz + face.dir[2], c[0] === 0 ? -1 : 1, c[1] === 0 ? -1 : 1, 0);
      }
    }
    // MC smooth lighting: each occluding neighbour (side, side, corner) costs ~20 % → darkest corner 0.4.
    // Was ao/3 → a fully enclosed corner went pitch black (1×1 shafts/tunnels were black even with a torch).
    aos.push(1 - 0.2 * (3 - ao));
    a.positions.push(corners[i][0], corners[i][1], corners[i][2]);
    a.normals.push(face.normal[0], face.normal[1], face.normal[2]);
  }
  // it19: tile-local UVs (0..du, 0..dv) + tile index in colour B (negative) — the chunk shader repeats the
  // tile once per block. Was: one atlas tile stretched across the whole greedy quad (flat ground showed
  // huge blurry squares, a 5×3 wall one giant plank texture).
  void uv;
  a.uvs.push(0, dv, du, dv, du, 0, 0, 0);
  const tileCode = -(tileIdx + 1);

  let powerBoost = 1;
  if (id === BlockId.RedDust && meta > 0) powerBoost = 1.35;
  if (id === BlockId.Lamp && (meta & 1)) powerBoost = 1.5;
  for (let i = 0; i < 4; i++) {
    const col = Math.min(1.5, aos[i] * shade * lightMul * powerBoost);
    const bcol = Math.min(1.5, aos[i] * shade * blockMul * powerBoost);
    const alpha = def.transparent ? (def.liquid ? (id === BlockId.Lava ? 0.85 : 0.55) : id === BlockId.Torch ? 0.95 : 0.75) : 1;
    a.colors.push(col, bcol, tileCode, alpha);
  }
  const vb = a.vBase;
  if (aos[0] + aos[2] > aos[1] + aos[3]) {
    a.indices.push(vb, vb + 1, vb + 2, vb, vb + 2, vb + 3);
  } else {
    a.indices.push(vb + 1, vb + 2, vb + 3, vb + 1, vb + 3, vb);
  }
  a.vBase += 4;
}

/** MC "X" plant model: two diagonal double-sided quads (sapling, tall grass). */
function emitCross(a: Arrays, wx: number, y: number, wz: number, tile: number, light: number): void {
  const uv = tileUV(tile);
  const col = Math.min(1.5, lightCurve(light & 15) * 0.95);
  const bcol = Math.min(1.5, lightCurve(light >> 4) * 0.95);
  const k = 0.15, K = 0.85; // MC inset
  const planes: [number, number, number, number][] = [[k, k, K, K], [k, K, K, k]];
  for (const [x0, z0, x1, z1] of planes) {
    for (const side of [1, -1]) {
      const p = side === 1
        ? [[x0, 0, z0], [x1, 0, z1], [x1, 1, z1], [x0, 1, z0]]
        : [[x1, 0, z1], [x0, 0, z0], [x0, 1, z0], [x1, 1, z1]];
      for (const c of p) {
        a.positions.push(wx + c[0], y + c[1], wz + c[2]);
        a.normals.push(0, 1, 0); // MC: plants lit uniformly (no side shading)
        a.colors.push(col, bcol, col, 1);
      }
      a.uvs.push(uv.u0, uv.v1, uv.u1, uv.v1, uv.u1, uv.v0, uv.u0, uv.v0);
      const vb = a.vBase;
      a.indices.push(vb, vb + 1, vb + 2, vb, vb + 2, vb + 3);
      a.vBase += 4;
    }
  }
}

/** Double-sided vertical quad from (x0,z0) to (x1,z1), height h (plants). */
function emitPlane(a: Arrays, wx: number, y: number, wz: number, x0: number, z0: number, x1: number, z1: number, h: number, tile: number, col: number, bcol = col): void {
  const uv = tileUV(tile);
  for (const side of [1, -1]) {
    const p = side === 1
      ? [[x0, 0, z0], [x1, 0, z1], [x1, h, z1], [x0, h, z0]]
      : [[x1, 0, z1], [x0, 0, z0], [x0, h, z0], [x1, h, z1]];
    for (const c of p) {
      a.positions.push(wx + c[0], y + c[1], wz + c[2]);
      a.normals.push(0, 1, 0);
      a.colors.push(col, bcol, col, 1);
    }
    a.uvs.push(uv.u0, uv.v1, uv.u1, uv.v1, uv.u1, uv.v0, uv.u0, uv.v0);
    const vb = a.vBase;
    a.indices.push(vb, vb + 1, vb + 2, vb, vb + 2, vb + 3);
    a.vBase += 4;
  }
}

/** MC crop model: '#' of four planes at 1/4 and 3/4. */
function emitHash(a: Arrays, wx: number, y: number, wz: number, tile: number, light: number, h: number): void {
  const col = Math.min(1.5, lightCurve(light & 15) * 0.95);
  const bcol = Math.min(1.5, lightCurve(light >> 4) * 0.95);
  for (const t of [0.25, 0.75]) {
    emitPlane(a, wx, y, wz, t, 0, t, 1, h, tile, col, bcol);
    emitPlane(a, wx, y, wz, 0, t, 1, t, h, tile, col, bcol);
  }
}

/** Greedy mesh opaque full cubes; naive mesh for specials/transparent. */
function buildMesh(
  chunk: Chunk,
  getWorld: GetBlock,
  getLight: GetLight,
  getMeta: GetMeta,
  transparentPass: boolean,
): MeshData {
  const a: Arrays = { positions: [], normals: [], uvs: [], colors: [], indices: [], vBase: 0 };
  const ox = chunk.cx * CHUNK_SIZE;
  const oz = chunk.cz * CHUNK_SIZE;

  // --- Special / non-full / transparent: naive per-face ---
  for (let y = 0; y < CHUNK_HEIGHT; y++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const id = chunk.get(lx, y, lz);
        if (id === BlockId.Air) continue;
        const def = BLOCKS[id];
        if (!def) continue;
        if (transparentPass !== def.transparent) continue;
        if (!transparentPass && isFullCube(id)) continue; // handled by greedy
        // Doors/lamps rendered as special meshes in renderer
        if (id === BlockId.Door || id === BlockId.Lamp) continue;
        const wx = ox + lx;
        const wz = oz + lz;
        if (isCrossPlant(id) || id === BlockId.Fire) { emitCross(a, wx, y, wz, def.tiles.side, getLight(wx, y, wz)); continue; }
        if (id === BlockId.Crop) {
          // MC crop '#' model: 4 vertical planes, height grows with the stage (was a translucent box)
          const stage = chunk.waterLevel[chunk.index(lx, y, lz)] || 0;
          emitHash(a, wx, y, wz, stage >= 7 ? 38 : 37, getLight(wx, y, wz), 0.3 + stage * 0.1);
          continue;
        }
        const wLevel = id === BlockId.Water || id === BlockId.Lava || id === BlockId.Crop
          ? (chunk.waterLevel[chunk.index(lx, y, lz)] || (id === BlockId.Crop ? 0 : 7)) : 7;
        let hTop = id === BlockId.Water || id === BlockId.Lava ? Math.max(0.125, wLevel / 7)
          : id === BlockId.Crop ? Math.min(1, 0.4 + wLevel * 0.085) : 1;
        if (id === BlockId.Slab || id === BlockId.PressurePlate) hTop = id === BlockId.PressurePlate ? 0.1 : 0.5;
        const skipTop = (id === BlockId.Water || id === BlockId.Lava) && getWorld(wx, y + 1, wz) === id;

        for (const face of FACES) {
          if (skipTop && face.dir[1] === 1) continue;
          if ((id === BlockId.Water || id === BlockId.Lava) && face.dir[1] === -1 && getWorld(wx, y - 1, wz) === id) continue;
          const neighbor = getWorld(wx + face.dir[0], y + face.dir[1], wz + face.dir[2]);
          if (!faceExposed(id, neighbor, def)) continue;
          emitQuad(a, face, wx, y, wz, 1, 1, id, getWorld, getLight, getMeta, hTop);
        }
      }
    }
  }

  if (transparentPass) {
    // Also naive-mesh transparent full cubes (glass, leaves, portal, glødstein, lamp)
    for (let y = 0; y < CHUNK_HEIGHT; y++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          const id = chunk.get(lx, y, lz);
          if (!isFullCube(id)) continue;
          const def = BLOCKS[id];
          if (!def?.transparent) continue;
          const wx = ox + lx, wz = oz + lz;
          for (const face of FACES) {
            const neighbor = getWorld(wx + face.dir[0], y + face.dir[1], wz + face.dir[2]);
            if (!faceExposed(id, neighbor, def)) continue;
            emitQuad(a, face, wx, y, wz, 1, 1, id, getWorld, getLight, getMeta, 1);
          }
        }
      }
    }
  }

  // --- Greedy mesh opaque full cubes ---
  if (!transparentPass) {
    for (const face of FACES) {
      // Sweep slices perpendicular to face.dir
      const dim = face.dir[1] !== 0 ? 'y' : face.dir[0] !== 0 ? 'x' : 'z';
      const sliceCount = dim === 'y' ? CHUNK_HEIGHT : CHUNK_SIZE;
      for (let slice = 0; slice < sliceCount; slice++) {
        // mask[u][v] = block id or 0 if no face
        const uSize = dim === 'x' ? CHUNK_SIZE : CHUNK_SIZE; // both xz are SIZE; for y-slice u=x v=z
        const vSize = dim === 'y' ? CHUNK_SIZE : CHUNK_HEIGHT;
        // Actually:
        // +Y/-Y: slice=y, u=lx, v=lz  (SIZE × SIZE)
        // +Z/-Z: slice=lz, u=lx, v=y  (SIZE × HEIGHT)
        // +X/-X: slice=lx, u=lz, v=y  (SIZE × HEIGHT)
        let mu: number, mv: number;
        if (dim === 'y') { mu = CHUNK_SIZE; mv = CHUNK_SIZE; }
        else { mu = CHUNK_SIZE; mv = CHUNK_HEIGHT; }
        const mask = new Int32Array(mu * mv);
        const lightMask = new Uint8Array(mu * mv);

        for (let v = 0; v < mv; v++) {
          for (let u = 0; u < mu; u++) {
            let lx: number, y: number, lz: number;
            if (dim === 'y') { lx = u; y = slice; lz = v; }
            else if (dim === 'z') { lx = u; y = v; lz = slice; }
            else { lx = slice; y = v; lz = u; }
            const id = chunk.get(lx, y, lz);
            if (!isFullCube(id) || BLOCKS[id]?.transparent) { mask[u + v * mu] = 0; continue; }
            const wx = ox + lx, wz = oz + lz;
            const neighbor = getWorld(wx + face.dir[0], y + face.dir[1], wz + face.dir[2]);
            if (!faceExposed(id, neighbor, BLOCKS[id]!)) { mask[u + v * mu] = 0; continue; }
            mask[u + v * mu] = id;
            lightMask[u + v * mu] = getLight(wx + face.dir[0], y + face.dir[1], wz + face.dir[2]);
          }
        }

        // Greedy merge
        for (let v = 0; v < mv; v++) {
          for (let u = 0; u < mu; ) {
            const id = mask[u + v * mu];
            if (!id) { u++; continue; }
            const light = lightMask[u + v * mu];
            // width
            let w = 1;
            while (u + w < mu && mask[u + w + v * mu] === id && lightMask[u + w + v * mu] === light) w++;
            // height
            let h = 1;
            outer: while (v + h < mv) {
              for (let k = 0; k < w; k++) {
                const i = u + k + (v + h) * mu;
                if (mask[i] !== id || lightMask[i] !== light) break outer;
              }
              h++;
            }
            // emit
            let wx: number, y: number, wz: number, du: number, dv: number;
            if (dim === 'y') {
              wx = ox + u; y = slice; wz = oz + v; du = w; dv = h;
            } else if (dim === 'z') {
              wx = ox + u; y = v; wz = oz + slice; du = w; dv = h;
            } else {
              wx = ox + slice; y = v; wz = oz + u; du = w; dv = h;
            }
            emitQuad(a, face, wx, y, wz, du, dv, id, getWorld, getLight, getMeta, 1);
            // clear mask
            for (let dvv = 0; dvv < h; dvv++)
              for (let duu = 0; duu < w; duu++)
                mask[u + duu + (v + dvv) * mu] = 0;
            u += w;
          }
        }
      }
    }
  }

  if (!a.positions.length) return emptyMesh();
  return {
    positions: new Float32Array(a.positions),
    normals: new Float32Array(a.normals),
    uvs: new Float32Array(a.uvs),
    colors: new Float32Array(a.colors),
    indices: new Uint32Array(a.indices),
  };
}

export function meshChunk(
  chunk: Chunk,
  getWorld: GetBlock,
  getLight: GetLight,
  getMeta?: GetMeta,
): ChunkMeshes {
  const meta = getMeta ?? ((x, y, z) => {
    // fallback: read from chunk if inside
    const lx = x - chunk.cx * CHUNK_SIZE;
    const lz = z - chunk.cz * CHUNK_SIZE;
    if (lx >= 0 && lx < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE && y >= 0 && y < CHUNK_HEIGHT) {
      return chunk.waterLevel[chunk.index(lx, y, lz)] || 0;
    }
    return 0;
  });
  return {
    opaque: buildMesh(chunk, getWorld, getLight, meta, false),
    transparent: buildMesh(chunk, getWorld, getLight, meta, true),
  };
}

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

/** Count triangles for tests. */
export function triCount(m: ChunkMeshes): number {
  return (m.opaque.indices.length + m.transparent.indices.length) / 3;
}

/** Light level 0–15 → vertex brightness (linear). l0 ≈ 0.04, l7 ≈ 0.35, l15 = 1. */
export function lightCurve(l: number): number {
  const f = Math.max(0, Math.min(15, l)) / 15;
  return 0.04 + 0.96 * Math.pow(f, 1.5);
}

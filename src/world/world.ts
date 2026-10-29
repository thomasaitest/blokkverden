import { BlockId, isSolid } from '../blocks/types';
import { Chunk, CHUNK_HEIGHT, CHUNK_SIZE, chunkKey, SEA_LEVEL } from './chunk';
import { meshChunk, meshFromTransferables, type ChunkMeshes } from './mesher';
import MeshWorker from './meshWorker.ts?worker';
import { SeededNoise } from './noise';
import { generateTerrain, placeTreesForChunk } from './terrain';
import { relightChunk } from './light';
import { generateHelveteChunk, type DimId } from './helvete';

export let VIEW_RADIUS = 7;
export function setViewRadius(r: number): void {
  VIEW_RADIUS = Math.max(3, Math.min(10, r | 0));
}

export class World {
  readonly seed: number;
  readonly noise: SeededNoise;
  /** Active dimension chunk/mesh maps (swapped on switchDimension). */
  chunks = new Map<string, Chunk>();
  meshes = new Map<string, ChunkMeshes>();
  private dirtyMeshes = new Set<string>();
  private pending = new Map<string, { lx: number; y: number; lz: number; id: number }[]>();
  private worker: Worker | null = null;
  private meshing = new Set<string>();
  private useWorker = true;
  meshRevision = 0;
  dimension: DimId = 'overworld';
  private stores: Record<DimId, {
    chunks: Map<string, Chunk>;
    meshes: Map<string, ChunkMeshes>;
    dirtyMeshes: Set<string>;
    pending: Map<string, { lx: number; y: number; lz: number; id: number }[]>;
    meshing: Set<string>;
  }>;

  constructor(seed = 42) {
    this.seed = seed;
    this.noise = new SeededNoise(seed);
    this.stores = {
      overworld: {
        chunks: this.chunks,
        meshes: this.meshes,
        dirtyMeshes: this.dirtyMeshes,
        pending: this.pending,
        meshing: this.meshing,
      },
      helvete: {
        chunks: new Map(),
        meshes: new Map(),
        dirtyMeshes: new Set(),
        pending: new Map(),
        meshing: new Set(),
      },
    };
    try {
      this.worker = new MeshWorker();
      this.worker.onmessage = (ev: MessageEvent<{ key: string; dim: DimId; meshes: Parameters<typeof meshFromTransferables>[0] }>) => {
        const { key, dim, meshes } = ev.data;
        const store = dim === this.dimension
          ? { chunks: this.chunks, meshes: this.meshes, meshing: this.meshing }
          : this.stores[dim];
        store.meshing.delete(key);
        if (!store.chunks.has(key)) return;
        store.meshes.set(key, meshFromTransferables(meshes));
        if (dim === this.dimension) this.meshRevision++;
        const c = store.chunks.get(key);
        if (c) {
          c.dirty = false;
          c.meshVersion++;
        }
      };
      this.worker.onerror = () => {
        this.useWorker = false;
      };
    } catch {
      this.useWorker = false;
      this.worker = null;
    }
  }

  meshQueue(): { dirty: number; meshing: number } {
    return { dirty: this.dirtyMeshes.size, meshing: this.meshing.size };
  }

  markMeshDirty(cx: number, cz: number): void {
    this.dirtyMeshes.add(chunkKey(cx, cz));
    const c = this.chunks.get(chunkKey(cx, cz));
    if (c) c.dirty = true;
  }

  getChunk(cx: number, cz: number): Chunk | undefined {
    return this.chunks.get(chunkKey(cx, cz));
  }

  private setAbs(wx: number, y: number, wz: number, id: number): void {
    if (y < 0 || y >= CHUNK_HEIGHT) return;
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const lx = wx - cx * CHUNK_SIZE;
    const lz = wz - cz * CHUNK_SIZE;
    const key = chunkKey(cx, cz);
    const c = this.chunks.get(key);
    if (!c || !c.generated) {
      let list = this.pending.get(key);
      if (!list) {
        list = [];
        this.pending.set(key, list);
      }
      list.push({ lx, y, lz, id });
      return;
    }
    const cur = c.get(lx, y, lz);
    if (id === BlockId.Log) {
      if (cur !== BlockId.Air && cur !== BlockId.Leaves) return;
    } else if (id === BlockId.Leaves) {
      if (cur !== BlockId.Air) return;
    } else if (cur !== BlockId.Air) return;
    c.set(lx, y, lz, id);
    this.dirtyMeshes.add(key);
  }

  private applyPending(c: Chunk): void {
    const key = chunkKey(c.cx, c.cz);
    const list = this.pending.get(key);
    if (!list) return;
    for (const p of list) {
      const cur = c.get(p.lx, p.y, p.lz);
      if (cur === BlockId.Air) c.set(p.lx, p.y, p.lz, p.id);
      else if (p.id === BlockId.Log && cur === BlockId.Leaves) c.set(p.lx, p.y, p.lz, p.id);
    }
    this.pending.delete(key);
    c.dirty = true;
  }

  ensureChunk(cx: number, cz: number): Chunk {
    const key = chunkKey(cx, cz);
    let c = this.chunks.get(key);
    if (!c) {
      c = new Chunk(cx, cz);
      if (this.dimension === 'helvete') {
        generateHelveteChunk((wx, y, wz, id) => {
          if (y < 0 || y >= CHUNK_HEIGHT) return;
          const lx = wx - cx * CHUNK_SIZE;
          const lz = wz - cz * CHUNK_SIZE;
          if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) return;
          c!.set(lx, y, lz, id);
        }, this.noise, cx, cz);
        c.generated = true;
        this.chunks.set(key, c);
        this.applyPending(c);
      } else {
        generateTerrain(c, this.noise);
        this.chunks.set(key, c);
        this.applyPending(c);
        placeTreesForChunk(c, this.noise, (wx, y, wz, id) => this.setAbs(wx, y, wz, id));
      }
      this.relight(c);
      this.dirtyMeshes.add(key);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nk = chunkKey(cx + dx, cz + dz);
        if (this.chunks.has(nk)) this.dirtyMeshes.add(nk);
      }
    }
    return c;
  }

  /** Swap active chunk store. Overworld stays untouched while in Helvete. */
  switchDimension(dim: DimId): void {
    if (dim === this.dimension) return;
    this.stores[this.dimension] = {
      chunks: this.chunks,
      meshes: this.meshes,
      dirtyMeshes: this.dirtyMeshes,
      pending: this.pending,
      meshing: this.meshing,
    };
    this.dimension = dim;
    const s = this.stores[dim];
    this.chunks = s.chunks;
    this.meshes = s.meshes;
    this.dirtyMeshes = s.dirtyMeshes;
    this.pending = s.pending;
    this.meshing = s.meshing;
    // Force full remesh of visible chunks after swap
    for (const key of this.chunks.keys()) this.dirtyMeshes.add(key);
    this.meshRevision++;
  }

  /** Snapshot of a column for integrity tests (overworld store, not active). */
  peekBlock(dim: DimId, wx: number, y: number, wz: number): number {
    if (y < 0 || y >= CHUNK_HEIGHT) return BlockId.Air;
    const store = dim === this.dimension
      ? { chunks: this.chunks }
      : this.stores[dim];
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const c = store.chunks.get(chunkKey(cx, cz));
    if (!c) return BlockId.Air;
    const lx = Math.floor(wx) - cx * CHUNK_SIZE;
    const lz = Math.floor(wz) - cz * CHUNK_SIZE;
    return c.get(lx, y, lz);
  }

  findHelveteSpawn(): { x: number; y: number; z: number } {
    this.ensureChunk(0, 0);
    this.ensureChunk(0, -1);
    this.ensureChunk(-1, 0);
    // Prefer a ridge above lava so seas + glowstone are visible
    for (let r = 0; r < 24; r++) {
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r && r > 0) continue;
        const wx = 8 + dx, wz = 8 + dz;
        this.ensureChunk(Math.floor(wx / CHUNK_SIZE), Math.floor(wz / CHUNK_SIZE));
        for (let y = 45; y > 8; y--) {
          const id = this.getBlock(wx, y, wz);
          const above = this.getBlock(wx, y + 1, wz);
          if (!isSolid(id) || id === BlockId.Lava || above !== BlockId.Air) continue;
          // Look for nearby lava column
          let nearLava = false;
          for (let oy = y - 8; oy <= y; oy++) {
            if (this.getBlock(wx + 2, oy, wz) === BlockId.Lava
              || this.getBlock(wx - 2, oy, wz) === BlockId.Lava
              || this.getBlock(wx, oy, wz + 2) === BlockId.Lava
              || this.getBlock(wx, oy, wz - 2) === BlockId.Lava) {
              nearLava = true; break;
            }
          }
          if (nearLava || r > 12) {
            return { x: wx + 0.5, y: y + 1.05, z: wz + 0.5 };
          }
        }
      }
    }
    // Safe pad with lava overlook + glowstone
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      this.setBlock(8 + dx, 32, 8 + dz, BlockId.Helstein);
      this.setBlock(8 + dx, 33, 8 + dz, BlockId.Air);
      this.setBlock(8 + dx, 34, 8 + dz, BlockId.Air);
    }
    for (let z = 11; z <= 16; z++) for (let x = 6; x <= 10; x++) {
      for (let y = 20; y <= 28; y++) this.setBlock(x, y, z, BlockId.Lava);
    }
    this.setBlock(8, 36, 8, BlockId.Glodstein);
    this.setBlock(9, 36, 8, BlockId.Glodstein);
    this.setBlock(8, 36, 9, BlockId.Glodstein);
    return { x: 8.5, y: 33.05, z: 8.5 };
  }

  worldToChunk(wx: number, wz: number): { cx: number; cz: number; lx: number; lz: number } {
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    return { cx, cz, lx: Math.floor(wx) - cx * CHUNK_SIZE, lz: Math.floor(wz) - cz * CHUNK_SIZE };
  }

  getBlock(wx: number, y: number, wz: number): number {
    if (y < 0 || y >= CHUNK_HEIGHT) return BlockId.Air;
    const { cx, cz, lx, lz } = this.worldToChunk(wx, wz);
    const c = this.chunks.get(chunkKey(cx, cz));
    if (!c) return BlockId.Air;
    return c.get(lx, y, lz);
  }

  getLight(wx: number, y: number, wz: number): number {
    if (y < 0 || y >= CHUNK_HEIGHT) return 15;
    const { cx, cz, lx, lz } = this.worldToChunk(wx, wz);
    const c = this.chunks.get(chunkKey(cx, cz));
    if (!c) return 15;
    return c.getLight(lx, y, lz);
  }

  /** Block (torch etc.) light only — ignores skylight. */
  getBlockLight(wx: number, y: number, wz: number): number {
    if (y < 0 || y >= CHUNK_HEIGHT) return 0;
    const { cx, cz, lx, lz } = this.worldToChunk(wx, wz);
    const c = this.chunks.get(chunkKey(cx, cz));
    if (!c) return 0;
    return c.blockLight[c.index(lx, y, lz)] ?? 0;
  }

  getWaterLevel(wx: number, y: number, wz: number): number {
    const { cx, cz, lx, lz } = this.worldToChunk(wx, wz);
    const c = this.chunks.get(chunkKey(cx, cz));
    if (!c) return 0;
    return c.waterLevel[c.index(lx, y, lz)] || 0;
  }

  setWater(wx: number, y: number, wz: number, level: number): void {
    if (y < 0 || y >= CHUNK_HEIGHT) return;
    const { cx, cz, lx, lz } = this.worldToChunk(wx, wz);
    const c = this.ensureChunk(cx, cz);
    const i = c.index(lx, y, lz);
    const cur = c.blocks[i];
    if (cur !== BlockId.Air && cur !== BlockId.Water) return;
    c.blocks[i] = BlockId.Water;
    c.waterLevel[i] = Math.max(c.waterLevel[i], level);
    c.dirty = true;
    c.lightDirty = true;
    this.dirtyMeshes.add(chunkKey(cx, cz));
  }

  /** Set block meta (open/powered/crop stage) without changing block id. */
  setMeta(wx: number, y: number, wz: number, meta: number): void {
    if (y < 0 || y >= CHUNK_HEIGHT) return;
    const { cx, cz, lx, lz } = this.worldToChunk(wx, wz);
    const c = this.ensureChunk(cx, cz);
    c.setMeta(lx, y, lz, meta);
    this.markLightAround(cx, cz);
    this.dirtyMeshes.add(chunkKey(cx, cz));
  }

  setBlock(wx: number, y: number, wz: number, id: number): boolean {
    if (y < 0 || y >= CHUNK_HEIGHT) return false;
    const { cx, cz, lx, lz } = this.worldToChunk(wx, wz);
    const c = this.ensureChunk(cx, cz);
    c.set(lx, y, lz, id);
    this.markLightAround(cx, cz);
    this.dirtyMeshes.add(chunkKey(cx, cz));
    if (lx === 0) this.dirtyMeshes.add(chunkKey(cx - 1, cz));
    if (lx === CHUNK_SIZE - 1) this.dirtyMeshes.add(chunkKey(cx + 1, cz));
    if (lz === 0) this.dirtyMeshes.add(chunkKey(cx, cz - 1));
    if (lz === CHUNK_SIZE - 1) this.dirtyMeshes.add(chunkKey(cx, cz + 1));
    return true;
  }

  private markLightAround(cx: number, cz: number): void {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const c = this.chunks.get(chunkKey(cx + dx, cz + dz));
        if (c) c.lightDirty = true;
      }
    }
  }

  private relight(c: Chunk): void {
    relightChunk(c, (x, y, z) => this.getBlock(x, y, z), (cx, cz) => this.chunks.get(chunkKey(cx, cz)));
    // Light values updated in-place; remesh only this chunk unless torch border (handled by setBlock)
    c.dirty = true;
    this.dirtyMeshes.add(chunkKey(c.cx, c.cz));
  }

  updateAround(px: number, pz: number): void {
    const pcx = Math.floor(px / CHUNK_SIZE);
    const pcz = Math.floor(pz / CHUNK_SIZE);
    for (let dz = -VIEW_RADIUS; dz <= VIEW_RADIUS; dz++) {
      for (let dx = -VIEW_RADIUS; dx <= VIEW_RADIUS; dx++) {
        if (dx * dx + dz * dz > VIEW_RADIUS * VIEW_RADIUS + 1) continue;
        this.ensureChunk(pcx + dx, pcz + dz);
      }
    }
    for (const [key, c] of this.chunks) {
      const ddx = c.cx - pcx;
      const ddz = c.cz - pcz;
      if (ddx * ddx + ddz * ddz > (VIEW_RADIUS + 2) * (VIEW_RADIUS + 2)) {
        this.chunks.delete(key);
        this.meshes.delete(key);
        this.dirtyMeshes.delete(key);
        this.meshing.delete(key);
      }
    }
    // Relight dirty (budgeted)
    let lit = 0;
    for (const c of this.chunks.values()) {
      if (!c.lightDirty) continue;
      this.relight(c);
      if (++lit >= 2) break;
    }
  }

  private packEdge(cx: number, cz: number, dir: 'negX' | 'posX' | 'negZ' | 'posZ'): { blocks: Uint8Array; light: Uint8Array } {
    const blocks = new Uint8Array(CHUNK_SIZE * CHUNK_HEIGHT);
    const light = new Uint8Array(CHUNK_SIZE * CHUNK_HEIGHT);
    const ncx = dir === 'negX' ? cx - 1 : dir === 'posX' ? cx + 1 : cx;
    const ncz = dir === 'negZ' ? cz - 1 : dir === 'posZ' ? cz + 1 : cz;
    const n = this.chunks.get(chunkKey(ncx, ncz));
    for (let y = 0; y < CHUNK_HEIGHT; y++) {
      for (let t = 0; t < CHUNK_SIZE; t++) {
        let lx = 0;
        let lz = 0;
        if (dir === 'negX') { lx = CHUNK_SIZE - 1; lz = t; }
        if (dir === 'posX') { lx = 0; lz = t; }
        if (dir === 'negZ') { lx = t; lz = CHUNK_SIZE - 1; }
        if (dir === 'posZ') { lx = t; lz = 0; }
        const i = t + y * CHUNK_SIZE;
        if (n) {
          blocks[i] = n.get(lx, y, lz);
          light[i] = n.getLight(lx, y, lz);
        } else {
          blocks[i] = 0;
          light[i] = 15;
        }
      }
    }
    return { blocks, light };
  }

  remeshDirty(budget = 2): string[] {
    const done: string[] = [];
    for (const key of [...this.dirtyMeshes]) {
      if (done.length >= budget) break;
      if (this.meshing.has(key)) {
        this.dirtyMeshes.delete(key);
        continue;
      }
      const c = this.chunks.get(key);
      if (!c) {
        this.dirtyMeshes.delete(key);
        continue;
      }
      if (c.lightDirty) this.relight(c);

      if (this.useWorker && this.worker) {
        const negX = this.packEdge(c.cx, c.cz, 'negX');
        const posX = this.packEdge(c.cx, c.cz, 'posX');
        const negZ = this.packEdge(c.cx, c.cz, 'negZ');
        const posZ = this.packEdge(c.cx, c.cz, 'posZ');
        const blocks = c.blocks.slice();
        const skyLight = c.skyLight.slice();
        const blockLight = c.blockLight.slice();
        const waterLevel = c.waterLevel.slice();
        this.meshing.add(key);
        this.dirtyMeshes.delete(key);
        this.worker.postMessage(
          {
            key,
            dim: this.dimension,
            cx: c.cx,
            cz: c.cz,
            blocks,
            skyLight,
            blockLight,
            waterLevel,
            edges: {
              negX: negX.blocks, posX: posX.blocks, negZ: negZ.blocks, posZ: posZ.blocks,
              negXLight: negX.light, posXLight: posX.light, negZLight: negZ.light, posZLight: posZ.light,
            },
          },
          [blocks.buffer, skyLight.buffer, blockLight.buffer, waterLevel.buffer,
            negX.blocks.buffer, posX.blocks.buffer, negZ.blocks.buffer, posZ.blocks.buffer,
            negX.light.buffer, posX.light.buffer, negZ.light.buffer, posZ.light.buffer],
        );
        done.push(key);
      } else {
        const get = (x: number, y: number, z: number) => this.getBlock(x, y, z);
        const getL = (x: number, y: number, z: number) => this.getLight(x, y, z);
        this.meshes.set(key, meshChunk(c, get, getL));
        c.dirty = false;
        c.meshVersion++;
        this.dirtyMeshes.delete(key);
        done.push(key);
      }
    }
    return done;
  }

  /** Sync remesh for tests / initial load */
  remeshSync(key: string): void {
    const c = this.chunks.get(key);
    if (!c) return;
    if (c.lightDirty) this.relight(c);
    this.meshes.set(key, meshChunk(c, (x, y, z) => this.getBlock(x, y, z), (x, y, z) => this.getLight(x, y, z)));
    c.dirty = false;
    c.meshVersion++;
    this.meshRevision++;
  }

  findSpawn(): { x: number; y: number; z: number } {
    this.ensureChunk(0, 0);
    const prefer = (id: number) => id === BlockId.Grass || id === BlockId.Sand || id === BlockId.SnowGrass || id === BlockId.Dirt;
    for (let pass = 0; pass < 2; pass++) {
      for (let r = 0; r < 64; r++) {
        for (let dx = -r; dx <= r; dx++) {
          for (let dz = -r; dz <= r; dz++) {
            if (Math.max(Math.abs(dx), Math.abs(dz)) !== r && r > 0) continue;
            const wx = 8 + dx;
            const wz = 8 + dz;
            this.ensureChunk(Math.floor(wx / CHUNK_SIZE), Math.floor(wz / CHUNK_SIZE));
            for (let y = CHUNK_HEIGHT - 2; y > SEA_LEVEL; y--) {
              const id = this.getBlock(wx, y, wz);
              const above = this.getBlock(wx, y + 1, wz);
              const above2 = this.getBlock(wx, y + 2, wz);
              if (!isSolid(id) || above !== BlockId.Air || above2 !== BlockId.Air) continue;
              if (this.getBlock(wx, y + 1, wz) === BlockId.Water) continue;
              if (pass === 0 && !prefer(id)) continue;
              return { x: wx + 0.5, y: y + 1.05, z: wz + 0.5 };
            }
          }
        }
      }
    }
    // Fallback: build a grass pad
    const y = SEA_LEVEL + 4;
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      this.setBlock(8 + dx, y, 8 + dz, BlockId.Grass);
      this.setBlock(8 + dx, y + 1, 8 + dz, BlockId.Air);
      this.setBlock(8 + dx, y + 2, 8 + dz, BlockId.Air);
    }
    return { x: 8.5, y: y + 1.05, z: 8.5 };
  }

  serializeModified(): { cx: number; cz: number; blocks: number[]; waterLevel: number[] }[] {
    return [...this.chunks.values()].map((c) => c.toJSON());
  }

  loadChunks(data: { cx: number; cz: number; blocks: number[]; waterLevel?: number[] }[]): void {
    this.chunks.clear();
    this.meshes.clear();
    this.dirtyMeshes.clear();
    this.pending.clear();
    this.meshing.clear();
    for (const d of data) {
      const c = Chunk.fromJSON(d);
      this.chunks.set(chunkKey(c.cx, c.cz), c);
      this.dirtyMeshes.add(chunkKey(c.cx, c.cz));
    }
  }
}

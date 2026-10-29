import { BlockId, isSolid } from '../blocks/types';
import { Chunk, CHUNK_HEIGHT, CHUNK_SIZE, chunkKey, SEA_LEVEL } from './chunk';
import { meshChunk, meshFromTransferables, type ChunkMeshes } from './mesher';
import MeshWorker from './meshWorker.ts?worker';
import { SeededNoise } from './noise';
import { generateTerrain, placeTreesForChunk } from './terrain';
import { relightChunk } from './light';

export const VIEW_RADIUS = 4;

export class World {
  readonly seed: number;
  readonly noise: SeededNoise;
  readonly chunks = new Map<string, Chunk>();
  readonly meshes = new Map<string, ChunkMeshes>();
  private dirtyMeshes = new Set<string>();
  private pending = new Map<string, { lx: number; y: number; lz: number; id: number }[]>();
  private worker: Worker | null = null;
  private meshing = new Set<string>();
  private useWorker = true;

  constructor(seed = 42) {
    this.seed = seed;
    this.noise = new SeededNoise(seed);
    try {
      this.worker = new MeshWorker();
      this.worker.onmessage = (ev: MessageEvent<{ key: string; meshes: Parameters<typeof meshFromTransferables>[0] }>) => {
        const { key, meshes } = ev.data;
        this.meshing.delete(key);
        if (!this.chunks.has(key)) return;
        this.meshes.set(key, meshFromTransferables(meshes));
        const c = this.chunks.get(key);
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
      generateTerrain(c, this.noise);
      this.chunks.set(key, c);
      this.applyPending(c);
      placeTreesForChunk(c, this.noise, (wx, y, wz, id) => this.setAbs(wx, y, wz, id));
      this.relight(c);
      this.dirtyMeshes.add(key);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nk = chunkKey(cx + dx, cz + dz);
        if (this.chunks.has(nk)) this.dirtyMeshes.add(nk);
      }
    }
    return c;
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
    relightChunk(c, (x, y, z) => this.getBlock(x, y, z));
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
    // Relight dirty
    for (const c of this.chunks.values()) {
      if (c.lightDirty) this.relight(c);
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

  remeshDirty(budget = 3): string[] {
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
        this.meshing.add(key);
        this.dirtyMeshes.delete(key);
        this.worker.postMessage(
          {
            key,
            cx: c.cx,
            cz: c.cz,
            blocks,
            skyLight,
            blockLight,
            edges: {
              negX: negX.blocks, posX: posX.blocks, negZ: negZ.blocks, posZ: posZ.blocks,
              negXLight: negX.light, posXLight: posX.light, negZLight: negZ.light, posZLight: posZ.light,
            },
          },
          [blocks.buffer, skyLight.buffer, blockLight.buffer,
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
  }

  findSpawn(): { x: number; y: number; z: number } {
    this.ensureChunk(0, 0);
    // Prefer dry grass/sand near origin
    for (let r = 0; r < 48; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r && r > 0) continue;
          const wx = 8 + dx;
          const wz = 8 + dz;
          this.ensureChunk(Math.floor(wx / CHUNK_SIZE), Math.floor(wz / CHUNK_SIZE));
          for (let y = CHUNK_HEIGHT - 1; y > SEA_LEVEL; y--) {
            const id = this.getBlock(wx, y, wz);
            if (isSolid(id) && this.getBlock(wx, y + 1, wz) === BlockId.Air && this.getBlock(wx, y + 2, wz) === BlockId.Air) {
              return { x: wx + 0.5, y: y + 1.01, z: wz + 0.5 };
            }
          }
        }
      }
    }
    for (let y = CHUNK_HEIGHT - 1; y > 0; y--) {
      if (isSolid(this.getBlock(8, y, 8))) return { x: 8.5, y: y + 2, z: 8.5 };
    }
    return { x: 8.5, y: SEA_LEVEL + 5, z: 8.5 };
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

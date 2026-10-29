import { BlockId, isSolid } from '../blocks/types';
import { Chunk, CHUNK_HEIGHT, CHUNK_SIZE, chunkKey, SEA_LEVEL } from './chunk';
import { meshChunk, type ChunkMeshes } from './mesher';
import { SeededNoise } from './noise';
import { generateTerrain, placeTreesForChunk } from './terrain';

export const VIEW_RADIUS = 4;

export class World {
  readonly seed: number;
  readonly noise: SeededNoise;
  readonly chunks = new Map<string, Chunk>();
  readonly meshes = new Map<string, ChunkMeshes>();
  private dirtyMeshes = new Set<string>();
  /** Pending leaf/log decorations for chunks not yet generated */
  private pending = new Map<string, { lx: number; y: number; lz: number; id: number }[]>();

  constructor(seed = 42) {
    this.seed = seed;
    this.noise = new SeededNoise(seed);
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
    // Logs replace air/leaves; leaves only fill air
    if (id === BlockId.Log) {
      if (cur !== BlockId.Air && cur !== BlockId.Leaves) return;
    } else if (id === BlockId.Leaves) {
      if (cur !== BlockId.Air) return;
    } else if (cur !== BlockId.Air) {
      return;
    }
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
      this.dirtyMeshes.add(key);
      for (const [dx, dz] of [
        [1, 0], [-1, 0], [0, 1], [0, -1],
      ] as const) {
        const nk = chunkKey(cx + dx, cz + dz);
        if (this.chunks.has(nk)) this.dirtyMeshes.add(nk);
      }
    }
    return c;
  }

  worldToChunk(wx: number, wz: number): { cx: number; cz: number; lx: number; lz: number } {
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const flx = Math.floor(wx) - cx * CHUNK_SIZE;
    const flz = Math.floor(wz) - cz * CHUNK_SIZE;
    return { cx, cz, lx: flx, lz: flz };
  }

  getBlock(wx: number, y: number, wz: number): number {
    if (y < 0 || y >= CHUNK_HEIGHT) return BlockId.Air;
    const { cx, cz, lx, lz } = this.worldToChunk(wx, wz);
    const c = this.chunks.get(chunkKey(cx, cz));
    if (!c) return BlockId.Air;
    return c.get(lx, y, lz);
  }

  setBlock(wx: number, y: number, wz: number, id: number): boolean {
    if (y < 0 || y >= CHUNK_HEIGHT) return false;
    const { cx, cz, lx, lz } = this.worldToChunk(wx, wz);
    const c = this.ensureChunk(cx, cz);
    c.set(lx, y, lz, id);
    this.dirtyMeshes.add(chunkKey(cx, cz));
    if (lx === 0) this.dirtyMeshes.add(chunkKey(cx - 1, cz));
    if (lx === CHUNK_SIZE - 1) this.dirtyMeshes.add(chunkKey(cx + 1, cz));
    if (lz === 0) this.dirtyMeshes.add(chunkKey(cx, cz - 1));
    if (lz === CHUNK_SIZE - 1) this.dirtyMeshes.add(chunkKey(cx, cz + 1));
    return true;
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
      }
    }
  }

  remeshDirty(budget = 4): string[] {
    const done: string[] = [];
    const get = (x: number, y: number, z: number) => this.getBlock(x, y, z);
    for (const key of [...this.dirtyMeshes]) {
      if (done.length >= budget) break;
      const c = this.chunks.get(key);
      if (!c) {
        this.dirtyMeshes.delete(key);
        continue;
      }
      this.meshes.set(key, meshChunk(c, get));
      c.dirty = false;
      c.meshVersion++;
      this.dirtyMeshes.delete(key);
      done.push(key);
    }
    return done;
  }

  findSpawn(): { x: number; y: number; z: number } {
    this.ensureChunk(0, 0);
    for (let y = CHUNK_HEIGHT - 1; y > 0; y--) {
      if (isSolid(this.getBlock(8, y, 8))) {
        return { x: 8.5, y: y + 2, z: 8.5 };
      }
    }
    return { x: 8.5, y: SEA_LEVEL + 5, z: 8.5 };
  }

  serializeModified(): { cx: number; cz: number; blocks: number[] }[] {
    return [...this.chunks.values()].map((c) => c.toJSON());
  }

  loadChunks(data: { cx: number; cz: number; blocks: number[] }[]): void {
    this.chunks.clear();
    this.meshes.clear();
    this.dirtyMeshes.clear();
    this.pending.clear();
    for (const d of data) {
      const c = Chunk.fromJSON(d);
      this.chunks.set(chunkKey(c.cx, c.cz), c);
      this.dirtyMeshes.add(chunkKey(c.cx, c.cz));
    }
  }
}

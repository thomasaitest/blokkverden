import { BlockId } from '../blocks/types';

export const CHUNK_SIZE = 16;
export const CHUNK_HEIGHT = 64;
export const SEA_LEVEL = 28;

export function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

export class Chunk {
  readonly cx: number;
  readonly cz: number;
  readonly blocks: Uint8Array;
  readonly skyLight: Uint8Array;
  readonly blockLight: Uint8Array;
  /** Water flow level 0–7 (7 = source). 0 = not water / empty meta */
  readonly waterLevel: Uint8Array;
  meshVersion = 0;
  dirty = true;
  lightDirty = true;
  generated = false;

  constructor(cx: number, cz: number) {
    this.cx = cx;
    this.cz = cz;
    const n = CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT;
    this.blocks = new Uint8Array(n);
    this.skyLight = new Uint8Array(n);
    this.blockLight = new Uint8Array(n);
    this.waterLevel = new Uint8Array(n);
  }

  index(lx: number, y: number, lz: number): number {
    return lx + lz * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE;
  }

  get(lx: number, y: number, lz: number): number {
    if (lx < 0 || lz < 0 || y < 0 || lx >= CHUNK_SIZE || lz >= CHUNK_SIZE || y >= CHUNK_HEIGHT) {
      return BlockId.Air;
    }
    return this.blocks[this.index(lx, y, lz)];
  }

  set(lx: number, y: number, lz: number, id: number): void {
    if (lx < 0 || lz < 0 || y < 0 || lx >= CHUNK_SIZE || lz >= CHUNK_SIZE || y >= CHUNK_HEIGHT) return;
    const i = this.index(lx, y, lz);
    const prev = this.blocks[i];
    this.blocks[i] = id;
    if (id === BlockId.Water && this.waterLevel[i] === 0) this.waterLevel[i] = 7;
    else if (id !== BlockId.Water && id !== prev) {
      // Clear meta when block type changes; Crop/Door/etc keep via setMeta
      this.waterLevel[i] = 0;
    }
    this.dirty = true;
    this.lightDirty = true;
  }

  setMeta(lx: number, y: number, lz: number, meta: number): void {
    if (lx < 0 || lz < 0 || y < 0 || lx >= CHUNK_SIZE || lz >= CHUNK_SIZE || y >= CHUNK_HEIGHT) return;
    this.waterLevel[this.index(lx, y, lz)] = meta & 255;
    this.dirty = true;
    this.lightDirty = true;
  }

  getLight(lx: number, y: number, lz: number): number {
    if (lx < 0 || lz < 0 || y < 0 || lx >= CHUNK_SIZE || lz >= CHUNK_SIZE || y >= CHUNK_HEIGHT) return 15;
    const i = this.index(lx, y, lz);
    return Math.max(this.skyLight[i], this.blockLight[i]);
  }

  toJSON(): { cx: number; cz: number; blocks: number[]; waterLevel: number[] } {
    return {
      cx: this.cx,
      cz: this.cz,
      blocks: Array.from(this.blocks),
      waterLevel: Array.from(this.waterLevel),
    };
  }

  static fromJSON(data: { cx: number; cz: number; blocks: number[]; waterLevel?: number[] }): Chunk {
    const c = new Chunk(data.cx, data.cz);
    c.blocks.set(data.blocks);
    if (data.waterLevel) c.waterLevel.set(data.waterLevel);
    else {
      for (let i = 0; i < c.blocks.length; i++) {
        if (c.blocks[i] === BlockId.Water) c.waterLevel[i] = 7;
      }
    }
    c.generated = true;
    c.dirty = true;
    c.lightDirty = true;
    return c;
  }
}

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
  /** Flat array [x + z*SIZE + y*SIZE*SIZE] */
  readonly blocks: Uint8Array;
  meshVersion = 0;
  dirty = true;
  generated = false;

  constructor(cx: number, cz: number) {
    this.cx = cx;
    this.cz = cz;
    this.blocks = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT);
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
    if (lx < 0 || lz < 0 || y < 0 || lx >= CHUNK_SIZE || lz >= CHUNK_SIZE || y >= CHUNK_HEIGHT) {
      return;
    }
    this.blocks[this.index(lx, y, lz)] = id;
    this.dirty = true;
  }

  toJSON(): { cx: number; cz: number; blocks: number[] } {
    return { cx: this.cx, cz: this.cz, blocks: Array.from(this.blocks) };
  }

  static fromJSON(data: { cx: number; cz: number; blocks: number[] }): Chunk {
    const c = new Chunk(data.cx, data.cz);
    c.blocks.set(data.blocks);
    c.generated = true;
    c.dirty = true;
    return c;
  }
}

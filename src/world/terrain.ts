import { BlockId } from '../blocks/types';
import { Chunk, CHUNK_HEIGHT, CHUNK_SIZE, SEA_LEVEL } from './chunk';
import { SeededNoise } from './noise';

export function generateChunk(chunk: Chunk, noise: SeededNoise): void {
  const ox = chunk.cx * CHUNK_SIZE;
  const oz = chunk.cz * CHUNK_SIZE;

  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const wx = ox + lx;
      const wz = oz + lz;
      const n = noise.fbm2(wx * 0.02, wz * 0.02, 5, 2.0, 0.5);
      const hill = noise.fbm2(wx * 0.008, wz * 0.008, 3, 2.1, 0.55);
      let h = Math.floor(SEA_LEVEL + n * 8 + hill * 14);
      h = Math.max(4, Math.min(CHUNK_HEIGHT - 8, h));

      const beach = h <= SEA_LEVEL + 1;

      for (let y = 0; y < CHUNK_HEIGHT; y++) {
        let id: number = BlockId.Air;
        if (y === 0) id = BlockId.Stone;
        else if (y < h - 4) id = BlockId.Stone;
        else if (y < h) id = BlockId.Dirt;
        else if (y === h) id = beach ? BlockId.Sand : BlockId.Grass;
        else if (y <= SEA_LEVEL && y > h) id = BlockId.Water;
        chunk.set(lx, y, lz, id);
      }

      // Trees on grass, sparse
      if (!beach && h > SEA_LEVEL && h < CHUNK_HEIGHT - 8) {
        const t = noise.hash2(wx, wz);
        if (t > 0.97) {
          placeTree(chunk, lx, h + 1, lz, noise.hash2(wx + 7, wz + 3));
        }
      }
    }
  }
  chunk.generated = true;
  chunk.dirty = true;
}

function placeTree(chunk: Chunk, lx: number, y: number, lz: number, rnd: number): void {
  const trunkH = 4 + Math.floor(rnd * 3);
  for (let i = 0; i < trunkH; i++) {
    if (y + i >= CHUNK_HEIGHT) break;
    chunk.set(lx, y + i, lz, BlockId.Log);
  }
  const top = y + trunkH - 1;
  for (let dy = -1; dy <= 2; dy++) {
    const r = dy >= 1 ? 1 : 2;
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (dx === 0 && dz === 0 && dy < 2) continue;
        if (Math.abs(dx) === r && Math.abs(dz) === r && rnd < 0.4) continue;
        const px = lx + dx;
        const pz = lz + dz;
        const py = top + dy;
        if (px < 0 || pz < 0 || px >= CHUNK_SIZE || pz >= CHUNK_SIZE || py >= CHUNK_HEIGHT) continue;
        if (chunk.get(px, py, pz) === BlockId.Air) {
          chunk.set(px, py, pz, BlockId.Leaves);
        }
      }
    }
  }
}

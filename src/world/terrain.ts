import { BlockId } from '../blocks/types';
import { Chunk, CHUNK_HEIGHT, CHUNK_SIZE, SEA_LEVEL } from './chunk';
import { SeededNoise } from './noise';

export type SetAbs = (wx: number, y: number, wz: number, id: number) => void;

/** Terrain only — trees placed afterwards via placeTreesForChunk. */
export function generateTerrain(chunk: Chunk, noise: SeededNoise): void {
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
    }
  }
  chunk.generated = true;
  chunk.dirty = true;
}

/** Place trees whose trunks are in this chunk; canopy may cross borders via setAbs. */
export function placeTreesForChunk(chunk: Chunk, noise: SeededNoise, setAbs: SetAbs): void {
  const ox = chunk.cx * CHUNK_SIZE;
  const oz = chunk.cz * CHUNK_SIZE;

  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const wx = ox + lx;
      const wz = oz + lz;
      // Find surface
      let surface = -1;
      for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
        const id = chunk.get(lx, y, lz);
        if (id === BlockId.Grass) {
          surface = y;
          break;
        }
        if (id !== BlockId.Air && id !== BlockId.Leaves && id !== BlockId.Water) break;
      }
      if (surface < 0 || surface <= SEA_LEVEL) continue;
      const t = noise.hash2(wx, wz);
      if (t <= 0.97) continue;
      placeTreeAbs(wx, surface + 1, wz, noise.hash2(wx + 7, wz + 3), setAbs);
    }
  }
}

function placeTreeAbs(wx: number, y: number, wz: number, rnd: number, setAbs: SetAbs): void {
  const trunkH = 4 + Math.floor(rnd * 3);
  for (let i = 0; i < trunkH; i++) {
    if (y + i >= CHUNK_HEIGHT) break;
    setAbs(wx, y + i, wz, BlockId.Log);
  }
  const top = y + trunkH - 1;
  for (let dy = -1; dy <= 2; dy++) {
    const r = dy >= 1 ? 1 : 2;
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (dx === 0 && dz === 0 && dy < 2) continue;
        if (Math.abs(dx) === r && Math.abs(dz) === r && rnd < 0.4) continue;
        const px = wx + dx;
        const pz = wz + dz;
        const py = top + dy;
        if (py < 0 || py >= CHUNK_HEIGHT) continue;
        setAbs(px, py, pz, BlockId.Leaves);
      }
    }
  }
}

/** @deprecated use generateTerrain + placeTreesForChunk */
export function generateChunk(chunk: Chunk, noise: SeededNoise, setAbs?: SetAbs): void {
  generateTerrain(chunk, noise);
  if (setAbs) placeTreesForChunk(chunk, noise, setAbs);
}

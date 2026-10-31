import { BlockId } from '../blocks/types';
import { Chunk, CHUNK_HEIGHT, CHUNK_SIZE, SEA_LEVEL } from './chunk';
import { SeededNoise } from './noise';

export type SetAbs = (wx: number, y: number, wz: number, id: number) => void;

export type Biome = 'ocean' | 'beach' | 'plains' | 'forest' | 'desert' | 'snow';

export function biomeAt(noise: SeededNoise, wx: number, wz: number): Biome {
  const t = noise.fbm2(wx * 0.003, wz * 0.003, 4, 2.0, 0.5); // temperature-ish
  const m = noise.fbm2(wx * 0.003 + 100, wz * 0.003 + 100, 4, 2.0, 0.5); // moisture
  const h = noise.fbm2(wx * 0.008, wz * 0.008, 3, 2.1, 0.55);
  if (h < -0.25) return 'ocean';
  if (h < -0.12) return 'beach';
  if (t < -0.25) return 'snow';
  if (t > 0.35 && m < 0) return 'desert';
  if (m > 0.2) return 'forest';
  return 'plains';
}

export function generateTerrain(chunk: Chunk, noise: SeededNoise): void {
  const ox = chunk.cx * CHUNK_SIZE;
  const oz = chunk.cz * CHUNK_SIZE;

  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const wx = ox + lx;
      const wz = oz + lz;
      const n = noise.fbm2(wx * 0.02, wz * 0.02, 5, 2.0, 0.5);
      const hill = noise.fbm2(wx * 0.008, wz * 0.008, 3, 2.1, 0.55);
      const biome = biomeAt(noise, wx, wz);

      let h = Math.floor(SEA_LEVEL + n * 8 + hill * 14);
      if (biome === 'ocean') h = Math.floor(SEA_LEVEL - 6 + n * 3);
      if (biome === 'beach') h = Math.floor(SEA_LEVEL + n * 2);
      if (biome === 'desert') h = Math.floor(SEA_LEVEL + 2 + n * 6 + hill * 8);
      h = Math.max(3, Math.min(CHUNK_HEIGHT - 8, h));

      for (let y = 0; y < CHUNK_HEIGHT; y++) {
        let id: number = BlockId.Air;
        if (y === 0) id = BlockId.Bedrock;
        else if (y <= 2 && noise.hash2(wx * 13 + y * 101, wz * 7 - y * 37) < (y === 1 ? 0.6 : 0.3)) id = BlockId.Bedrock;
        else if (y < h - 4) id = BlockId.Stone;
        else if (y < h) {
          if (biome === 'desert' || biome === 'beach') id = BlockId.Sand;
          else id = BlockId.Dirt;
        } else if (y === h) {
          if (biome === 'desert' || biome === 'beach') id = BlockId.Sand;
          else if (biome === 'snow') id = BlockId.SnowGrass;
          // MC: ocean floors are patchy gravel
          else if (biome === 'ocean' && h < SEA_LEVEL) id = noise.hash2(Math.floor(wx / 3) * 7 + 11, Math.floor(wz / 3) * 5 - 3) < 0.55 ? BlockId.Gravel : BlockId.Dirt;
          else id = BlockId.Grass;
        } else if (y <= SEA_LEVEL && y > h) {
          id = BlockId.Water;
        }
        chunk.set(lx, y, lz, id);
        if (id === BlockId.Water) chunk.waterLevel[chunk.index(lx, y, lz)] = 7;
      }

      // Caves — 3D noise carve
      for (let y = 2; y < h - 2; y++) {
        const cave = noise.fbm2(wx * 0.06 + y * 0.04, wz * 0.06 - y * 0.03, 3, 2.0, 0.5);
        const cave2 = noise.fbm2(wx * 0.05 - 50, y * 0.05, 2, 2.0, 0.5);
        if (cave > 0.45 && cave2 > 0.2 && chunk.get(lx, y, lz) === BlockId.Stone) {
          chunk.set(lx, y, lz, y < SEA_LEVEL - 8 && noise.hash2(wx + y, wz) > 0.92 ? BlockId.Water : BlockId.Air);
        }
      }

      // Ores in stone
      for (let y = 1; y < h; y++) {
        if (chunk.get(lx, y, lz) !== BlockId.Stone) continue;
        // MC: gravel blobs in stone (≈4×4×4 cells, ragged edges)
        if (y > 4 && y < h - 5 && noise.hash2(Math.floor(wx / 4) * 131 + Math.floor(y / 4) * 977, Math.floor(wz / 4) * 59 - Math.floor(y / 4) * 13) > 0.985
          && noise.hash2(wx * 3 + y * 5, wz * 7 - y) > 0.25) { chunk.set(lx, y, lz, BlockId.Gravel); continue; }
        const r = noise.hash2(wx * 31 + y * 7, wz * 17 + y);
        if (y < 12 && r > 0.985) chunk.set(lx, y, lz, BlockId.DiamondOre);
        else if (y < 28 && r > 0.975) chunk.set(lx, y, lz, BlockId.GoldOre);
        else if (y < 40 && r > 0.96) chunk.set(lx, y, lz, BlockId.IronOre);
        else if (y < 50 && r > 0.94) chunk.set(lx, y, lz, BlockId.CoalOre);
      }
    }
  }
  chunk.generated = true;
  chunk.dirty = true;
  chunk.lightDirty = true;
}

export function placeTreesForChunk(chunk: Chunk, noise: SeededNoise, setAbs: SetAbs): void {
  const ox = chunk.cx * CHUNK_SIZE;
  const oz = chunk.cz * CHUNK_SIZE;

  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const wx = ox + lx;
      const wz = oz + lz;
      const biome = biomeAt(noise, wx, wz);
      if (biome === 'desert' || biome === 'ocean' || biome === 'beach') continue;

      let surface = -1;
      for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
        const id = chunk.get(lx, y, lz);
        if (id === BlockId.Grass || id === BlockId.SnowGrass) {
          surface = y;
          break;
        }
        if (id !== BlockId.Air && id !== BlockId.Leaves && id !== BlockId.Water) break;
      }
      if (surface < 0 || surface <= SEA_LEVEL) continue;
      const dens = biome === 'forest' ? 0.92 : 0.97;
      const t = noise.hash2(wx, wz);
      if (t <= dens) {
        // MC: tall grass tufts on grass (plains denser than forest; none on snow)
        const g = noise.hash2(wx * 3 + 101, wz * 5 - 77);
        const gd = biome === 'snow' ? 0 : biome === 'forest' ? 0.08 : 0.14;
        if (g < gd && chunk.get(lx, surface, lz) === BlockId.Grass && surface + 1 < CHUNK_HEIGHT && chunk.get(lx, surface + 1, lz) === BlockId.Air) {
          chunk.set(lx, surface + 1, lz, BlockId.TallGrass);
        } else if (biome !== 'snow' && g > 0.985 && chunk.get(lx, surface, lz) === BlockId.Grass && surface + 1 < CHUNK_HEIGHT && chunk.get(lx, surface + 1, lz) === BlockId.Air) {
          // MC: scattered dandelions and poppies on grass (plains/forest)
          chunk.set(lx, surface + 1, lz, noise.hash2(wx - 31, wz + 59) < 0.5 ? BlockId.Dandelion : BlockId.Poppy);
        }
        continue;
      }
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
        const py = top + dy;
        if (py < 0 || py >= CHUNK_HEIGHT) continue;
        setAbs(wx + dx, py, wz + dz, BlockId.Leaves);
      }
    }
  }
}

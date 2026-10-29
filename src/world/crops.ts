import { BlockId } from '../blocks/types';
import { chunkKey } from './chunk';
import type { World } from './world';
import type { DropSystem } from './drops';
import { ItemId, stack } from '../items/types';

export function setCropStage(world: World, x: number, y: number, z: number, stage: number): void {
  const { cx, cz, lx, lz } = world.worldToChunk(x, z);
  const c = world.getChunk(cx, cz);
  if (!c) return;
  const i = c.index(lx, y, lz);
  if (c.blocks[i] !== BlockId.Crop) return;
  c.waterLevel[i] = Math.max(0, Math.min(7, stage));
  c.dirty = true;
  world.markMeshDirty(cx, cz);
}

export function tickCrops(world: World, budget = 24): number {
  let n = 0;
  const dirty = new Set<string>();
  for (const c of world.chunks.values()) {
    if (n >= budget) break;
    for (let i = 0; i < c.blocks.length && n < budget; i++) {
      if (c.blocks[i] !== BlockId.Crop) continue;
      if (Math.random() > 0.05) continue;
      const lvl = c.waterLevel[i] || 0;
      if (lvl >= 7) continue;
      c.waterLevel[i] = lvl + 1;
      c.dirty = true;
      dirty.add(chunkKey(c.cx, c.cz));
      n++;
    }
  }
  for (const key of dirty) {
    const [cx, cz] = key.split(',').map(Number);
    world.markMeshDirty(cx, cz);
  }
  return n;
}

export function plantCrop(world: World, x: number, y: number, z: number): boolean {
  if (world.getBlock(x, y - 1, z) !== BlockId.Farmland) return false;
  if (world.getBlock(x, y, z) !== BlockId.Air) return false;
  world.setBlock(x, y, z, BlockId.Crop);
  setCropStage(world, x, y, z, 0);
  return true;
}

export function harvestCrop(world: World, x: number, y: number, z: number, drops: DropSystem): boolean {
  if (world.getBlock(x, y, z) !== BlockId.Crop) return false;
  const lvl = world.getWaterLevel(x, y, z);
  world.setBlock(x, y, z, BlockId.Air);
  if (lvl >= 7) {
    drops.spawn(x, y, z, stack(ItemId.Wheat, 1));
    drops.spawn(x, y, z, stack(ItemId.Seeds, 1 + ((Math.random() * 2) | 0)));
  } else {
    drops.spawn(x, y, z, stack(ItemId.Seeds, 1));
  }
  return true;
}

export function hoeDirt(world: World, x: number, y: number, z: number): boolean {
  const id = world.getBlock(x, y, z);
  if (id !== BlockId.Dirt && id !== BlockId.Grass && id !== BlockId.SnowGrass) return false;
  world.setBlock(x, y, z, BlockId.Farmland);
  return true;
}

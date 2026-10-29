import { BlockId } from '../blocks/types';
import type { World } from './world';
import { CHUNK_SIZE } from './chunk';
import { ItemId, stack } from '../items/types';
import type { ContainerStore } from './containers';

const placed = new Set<string>();

export function tryPlaceStructures(world: World, containers: ContainerStore, cx: number, cz: number): void {
  const key = `${cx},${cz}`;
  if (placed.has(key)) return;
  placed.add(key);
  // Deterministic from chunk coords
  const h = ((cx * 374761393 + cz * 668265263) >>> 0) % 1000;
  if (h < 18) placeVillage(world, cx * CHUNK_SIZE + 4, cz * CHUNK_SIZE + 4);
  else if (h < 28) placeRuin(world, containers, cx * CHUNK_SIZE + 6, cz * CHUNK_SIZE + 6);
  else if (h < 35) placeDungeon(world, containers, cx * CHUNK_SIZE + 5, cz * CHUNK_SIZE + 5);
}

function surfaceY(world: World, x: number, z: number): number {
  for (let y = 70; y > 20; y--) {
    const id = world.getBlock(x, y, z);
    if (id === BlockId.Grass || id === BlockId.Sand || id === BlockId.SnowGrass || id === BlockId.Dirt) return y;
  }
  return 40;
}

function house(world: World, ox: number, oy: number, oz: number): void {
  for (let dx = 0; dx < 5; dx++) for (let dz = 0; dz < 5; dz++) {
    world.setBlock(ox + dx, oy, oz + dz, BlockId.Cobble);
    for (let dy = 1; dy <= 3; dy++) {
      const wall = dx === 0 || dx === 4 || dz === 0 || dz === 4;
      if (wall) world.setBlock(ox + dx, oy + dy, oz + dz, BlockId.Planks);
      else world.setBlock(ox + dx, oy + dy, oz + dz, BlockId.Air);
    }
    world.setBlock(ox + dx, oy + 4, oz + dz, BlockId.Log);
  }
  // door
  world.setBlock(ox + 2, oy + 1, oz, BlockId.Air);
  world.setBlock(ox + 2, oy + 2, oz, BlockId.Air);
  // window
  world.setBlock(ox, oy + 2, oz + 2, BlockId.Glass);
  world.setBlock(ox + 4, oy + 2, oz + 2, BlockId.Glass);
  world.setBlock(ox + 2, oy + 1, oz + 3, BlockId.CraftingTable);
}

function placeVillage(world: World, x: number, z: number): void {
  const y = surfaceY(world, x, z);
  house(world, x, y, z);
  house(world, x + 8, y, z + 2);
  house(world, x + 3, y, z + 9);
  // path
  for (let i = 0; i < 10; i++) {
    world.setBlock(x + 2 + (i % 5), y, z + 5 + ((i / 5) | 0), BlockId.Cobble);
  }
  world.setBlock(x + 5, y + 1, z + 5, BlockId.Torch);
}

function placeRuin(world: World, containers: ContainerStore, x: number, z: number): void {
  const y = surfaceY(world, x, z);
  for (let dx = 0; dx < 6; dx++) for (let dz = 0; dz < 6; dz++) {
    if ((dx + dz) % 3 !== 0) world.setBlock(x + dx, y, z + dz, BlockId.Cobble);
    if (dx === 0 || dz === 0 || dx === 5 || dz === 5) {
      if (Math.random() > 0.4) world.setBlock(x + dx, y + 1, z + dz, BlockId.Cobble);
      if (Math.random() > 0.7) world.setBlock(x + dx, y + 2, z + dz, BlockId.Cobble);
    }
  }
  world.setBlock(x + 2, y + 1, z + 2, BlockId.Chest);
  const chest = containers.getChest(x + 2, y + 1, z + 2);
  chest[0] = stack(ItemId.IronIngot, 3);
  chest[1] = stack(ItemId.Apple, 5);
  chest[2] = stack(ItemId.Torch, 8);
}

function placeDungeon(world: World, containers: ContainerStore, x: number, z: number): void {
  const y = Math.max(12, surfaceY(world, x, z) - 12);
  for (let dx = 0; dx < 7; dx++) for (let dy = 0; dy < 5; dy++) for (let dz = 0; dz < 7; dz++) {
    const wall = dx === 0 || dy === 0 || dz === 0 || dx === 6 || dy === 4 || dz === 6;
    world.setBlock(x + dx, y + dy, z + dz, wall ? BlockId.Cobble : BlockId.Air);
  }
  world.setBlock(x + 3, y + 1, z + 3, BlockId.MobSpawner);
  world.setBlock(x + 1, y + 1, z + 1, BlockId.Chest);
  const chest = containers.getChest(x + 1, y + 1, z + 1);
  chest[0] = stack(ItemId.GoldIngot, 2);
  chest[1] = stack(ItemId.Diamond, 1);
  chest[2] = stack(ItemId.IronSword, 1, 250);
  world.setBlock(x + 3, y + 1, z + 5, BlockId.Torch);
}

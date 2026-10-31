/**
 * it24 (MC): flowing lava. Lava meta: 0 = source, 1–3 = flowing strength (3 next to a source, overworld lava
 * reaches 3 blocks like MC's 8→6→4→2), 8 = falling. Lava is slow (one step per tick, ticked every ~1.5 s near
 * the player). Flowing lava that is no longer fed recedes and disappears. Lava falling onto water makes stone;
 * water touching flowing lava makes cobblestone (handled in water.ts), a source makes obsidian.
 */
import { BlockId } from '../blocks/types';
import { CHUNK_HEIGHT, CHUNK_SIZE } from './chunk';
import type { World } from './world';
import { isWashable } from './water';

export const LAVA_FALLING = 8;

/**
 * Render height of a lava cell from its meta (as read by the mesher: 0 → 7).
 * it25: flowing strength 1–7 (MC level 8−n); overworld lava drops 2 per block (6, 4, 2 → 3 blocks),
 * Helvete lava drops 1 (7…1 → 7 blocks). Height = strength/8, so overworld heights are unchanged (0.75/0.5/0.25).
 */
export function lavaHeight(meta: number): number {
  // it26: source (0) and falling (8) are full; flowing strength 7 (next to a Helvete source) is 7/8, not full
  if (meta === 0 || meta >= LAVA_FALLING) return 1;
  return Math.max(0.125, meta / 8);
}

/** Strength used for spreading: source/falling 8, flowing 1–7. */
function strength(meta: number): number {
  return meta === 0 || meta === LAVA_FALLING ? 8 : meta;
}

/** it25 (MC): lava in Helvete flows 7 blocks (drop 1) and three times as fast; overworld 3 blocks (drop 2). */
export const LAVA_DROP_OVERWORLD = 2;
export const LAVA_DROP_HELVETE = 1;
export const LAVA_TICK_OVERWORLD = 1.5;
export const LAVA_TICK_HELVETE = 0.5;

const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

/**
 * One lava step for the chunks within `radius` chunks of the focus. Returns number of changes.
 * onWash: plant/torch/fire the lava flows into (before it is replaced). onStone: lava fell onto water → stone.
 */
export function tickLava(
  world: World, focus: { x: number; z: number; radius?: number; helvete?: boolean }, budget = 300,
  onWash?: (x: number, y: number, z: number, id: number) => void,
  onStone?: (x: number, y: number, z: number) => void,
): number {
  const fcx = Math.floor(focus.x / CHUNK_SIZE), fcz = Math.floor(focus.z / CHUNK_SIZE), r = focus.radius ?? 1;
  const sets: { x: number; y: number; z: number; meta: number }[] = [];
  const recede: { x: number; y: number; z: number; meta: number }[] = [];
  const stones: { x: number; y: number; z: number }[] = [];
  let n = 0;
  const drop = focus.helvete ? LAVA_DROP_HELVETE : LAVA_DROP_OVERWORLD;
  const lavaMeta = (x: number, y: number, z: number) => world.getWaterLevel(x, y, z);
  for (const c of world.chunks.values()) {
    if (Math.abs(c.cx - fcx) > r || Math.abs(c.cz - fcz) > r) continue;
    const ox = c.cx * CHUNK_SIZE, oz = c.cz * CHUNK_SIZE;
    for (let y = 0; y < CHUNK_HEIGHT && n < budget; y++) for (let lz = 0; lz < CHUNK_SIZE && n < budget; lz++) for (let lx = 0; lx < CHUNK_SIZE && n < budget; lx++) {
      if (c.get(lx, y, lz) !== BlockId.Lava) continue;
      const meta = c.waterLevel[c.index(lx, y, lz)];
      const x = ox + lx, z = oz + lz;
      const above = y + 1 < CHUNK_HEIGHT ? world.getBlock(x, y + 1, z) : BlockId.Air;
      // feed check (sources never recede)
      if (meta === LAVA_FALLING) {
        if (above !== BlockId.Lava) { recede.push({ x, y, z, meta: -1 }); n++; continue; }
      } else if (meta !== 0) {
        let fed = above === BlockId.Lava;
        for (const [dx, dz] of SIDES) {
          if (fed) break;
          if (world.getBlock(x + dx, y, z + dz) === BlockId.Lava && strength(lavaMeta(x + dx, y, z + dz)) > meta) fed = true;
        }
        if (!fed) { recede.push({ x, y, z, meta: meta - drop }); n++; continue; }
      }
      // fall
      if (y > 0) {
        const below = world.getBlock(x, y - 1, z);
        if (below === BlockId.Air || (isWashable(below) && below !== BlockId.Water)) { sets.push({ x, y: y - 1, z, meta: LAVA_FALLING }); n++; continue; }
        if (below === BlockId.Water) { stones.push({ x, y: y - 1, z }); n++; continue; }
        if (below === BlockId.Lava && lavaMeta(x, y - 1, z) !== 0 && lavaMeta(x, y - 1, z) !== LAVA_FALLING) { sets.push({ x, y: y - 1, z, meta: LAVA_FALLING }); n++; continue; }
      }
      if (meta !== 0 && y > 0 && world.getBlock(x, y - 1, z) === BlockId.Lava && lavaMeta(x, y - 1, z) !== 0) continue; // MC: keeps falling, no side spread
      const s = strength(meta);
      const spread = s - drop;
      if (spread < 1) continue;
      for (const [dx, dz] of SIDES) {
        const nx = x + dx, nz = z + dz;
        if (!world.hasChunkAt(nx, nz)) continue;
        const nb = world.getBlock(nx, y, nz);
        if (nb === BlockId.Air || (isWashable(nb) && nb !== BlockId.Water)) { sets.push({ x: nx, y, z: nz, meta: spread }); n++; }
        else if (nb === BlockId.Lava) {
          const om = lavaMeta(nx, y, nz);
          if (om !== 0 && om !== LAVA_FALLING && om < spread) { sets.push({ x: nx, y, z: nz, meta: spread }); n++; }
        }
      }
    }
  }
  for (const rc of recede) {
    if (world.getBlock(rc.x, rc.y, rc.z) !== BlockId.Lava) continue;
    if (rc.meta <= 0) world.setBlock(rc.x, rc.y, rc.z, BlockId.Air);
    else world.setMeta(rc.x, rc.y, rc.z, rc.meta);
  }
  for (const st of stones) {
    if (world.getBlock(st.x, st.y, st.z) !== BlockId.Water) continue;
    world.setBlock(st.x, st.y, st.z, BlockId.Stone);
    onStone?.(st.x, st.y, st.z);
  }
  for (const u of sets) {
    const cur = world.getBlock(u.x, u.y, u.z);
    if (cur === BlockId.Lava) {
      const om = lavaMeta(u.x, u.y, u.z);
      if (om === 0 || om === LAVA_FALLING || (u.meta !== LAVA_FALLING && om >= u.meta)) continue;
      world.setMeta(u.x, u.y, u.z, u.meta);
      continue;
    }
    if (cur !== BlockId.Air && !(isWashable(cur) && cur !== BlockId.Water)) continue;
    if (cur !== BlockId.Air) onWash?.(u.x, u.y, u.z, cur);
    world.setBlock(u.x, u.y, u.z, BlockId.Lava);
    world.setMeta(u.x, u.y, u.z, u.meta);
  }
  return sets.length + recede.length + stones.length;
}

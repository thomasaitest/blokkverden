/**
 * Minecraft-style explosion (ray march). Original implementation.
 * MC: 16×16×16 grid of rays from the centre; each ray starts with power·(0.7..1.3) and
 * loses (resistance+0.3)·0.3 + 0.225 per 0.3-block step; blocks whose ray still has
 * intensity > 0 are destroyed. Stone (6) only goes very close to the centre, dirt/wood further.
 */
import { BlockId } from '../blocks/types';

/** Blast resistance like MC (approx). Unknown blocks default to 3. */
export function blastResistance(id: number): number {
  switch (id) {
    case BlockId.Air: return 0;
    case BlockId.Water: case BlockId.Lava: return 100;
    case BlockId.Bedrock: case BlockId.PortalFrame: case BlockId.Portal: return 3_600_000;
    case BlockId.Grass: case BlockId.Dirt: case BlockId.Sand: case BlockId.SnowGrass: case BlockId.Farmland: return 0.5;
    case BlockId.Stone: case BlockId.Cobble: return 6;
    case BlockId.CoalOre: case BlockId.IronOre: case BlockId.GoldOre: case BlockId.DiamondOre: return 3;
    case BlockId.Log: return 2;
    case BlockId.Planks: case BlockId.Fence: case BlockId.Gate: case BlockId.Stairs: case BlockId.Slab: case BlockId.Door: case BlockId.Trapdoor: return 3;
    case BlockId.Leaves: return 0.2;
    case BlockId.Glass: case BlockId.GlassPane: case BlockId.Lamp: return 0.3;
    case BlockId.CraftingTable: case BlockId.Chest: return 2.5;
    case BlockId.Furnace: return 3.5;
    case BlockId.Wool: case BlockId.Bed: return 0.8;
    case BlockId.Sapling: case BlockId.TallGrass: return 0;
    case BlockId.Gravel: return 0.6;
    case BlockId.Torch: case BlockId.Crop: case BlockId.RedDust: case BlockId.Lever: case BlockId.Button: return 0;
    case BlockId.Ladder: return 0.4;
    case BlockId.Sign: return 1;
    case BlockId.Anvil: return 1200;
    case BlockId.EnchantTable: return 1200;
    default: return 3;
  }
}

export interface Blasted { x: number; y: number; z: number; id: number }

/** Returns the blocks an explosion of `power` at (cx,cy,cz) destroys. Does not modify the world. */
export function explosionBlocks(
  getBlock: (x: number, y: number, z: number) => number,
  cx: number, cy: number, cz: number, power: number, rnd: () => number = Math.random,
): Blasted[] {
  const hit = new Map<string, Blasted>();
  const N = 16;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) for (let k = 0; k < N; k++) {
    if (i !== 0 && i !== N - 1 && j !== 0 && j !== N - 1 && k !== 0 && k !== N - 1) continue;
    let dx = (i / (N - 1)) * 2 - 1, dy = (j / (N - 1)) * 2 - 1, dz = (k / (N - 1)) * 2 - 1;
    const len = Math.hypot(dx, dy, dz);
    dx /= len; dy /= len; dz /= len;
    let intensity = power * (0.7 + rnd() * 0.6);
    let x = cx, y = cy, z = cz;
    const step = 0.3;
    while (intensity > 0) {
      const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z);
      const id = getBlock(bx, by, bz);
      if (id !== BlockId.Air) intensity -= (blastResistance(id) + 0.3) * step;
      if (intensity > 0 && id !== BlockId.Air && id !== BlockId.Water && id !== BlockId.Lava) {
        const key = `${bx},${by},${bz}`;
        if (!hit.has(key)) hit.set(key, { x: bx, y: by, z: bz, id });
      }
      x += dx * step; y += dy * step; z += dz * step;
      intensity -= step * 0.75;
    }
  }
  return [...hit.values()];
}

/** MC damage falloff: (1 - d/(2·power)) based, scaled for Normal difficulty. 0 beyond 2·power. */
export function explosionDamage(dist: number, power: number, exposure = 1): number {
  const r = dist / (power * 2);
  if (r >= 1) return 0;
  const impact = (1 - r) * exposure;
  return Math.floor((impact * impact + impact) / 2 * 7 * power * 2 + 1);
}

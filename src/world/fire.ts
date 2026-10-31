import { BlockId, isSolid } from '../blocks/types';
import type { BlockAccess } from './gravity';

/** MC flammable blocks (wood, leaves, wool, plants…): fire next to them spreads and burns them away. */
export function isFlammable(id: number): boolean {
  return id === BlockId.Planks || id === BlockId.Log || id === BlockId.Leaves || id === BlockId.Wool
    || id === BlockId.TallGrass || id === BlockId.Dandelion || id === BlockId.Poppy || id === BlockId.Sapling
    || id === BlockId.Fence || id === BlockId.Gate || id === BlockId.Stairs || id === BlockId.Slab
    || id === BlockId.Ladder || id === BlockId.Bed || id === BlockId.CraftingTable || id === BlockId.Door
    || id === BlockId.Trapdoor || id === BlockId.Sign;
}

const DIRS: [number, number, number][] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

function hasFlammableNeighbour(w: BlockAccess, x: number, y: number, z: number): boolean {
  for (const [dx, dy, dz] of DIRS) if (isFlammable(w.getBlock(x + dx, y + dy, z + dz))) return true;
  return false;
}

/** MC: fire can exist in an air (or tall-grass) cell standing on a solid block or touching something flammable. */
export function canPlaceFire(w: BlockAccess, x: number, y: number, z: number): boolean {
  const cur = w.getBlock(x, y, z);
  if (cur !== BlockId.Air && cur !== BlockId.TallGrass) return false;
  return isSolid(w.getBlock(x, y - 1, z)) || hasFlammableNeighbour(w, x, y, z);
}

/** MC: fire on netherrack (helstein) burns forever. */
export function isEternalBase(id: number): boolean { return id === BlockId.Helstein; }

interface Fire { x: number; y: number; z: number; age: number; life: number; acc: number }

export const FIRE_TICK = 0.5;
/** Chance per fire tick that one flammable neighbour catches fire (is burnt and replaced by fire). */
export const SPREAD_CHANCE = 0.12;

/**
 * Active fires. Each fire ticks every 0.5 s: flammable neighbours may catch fire (they burn away and
 * become fire), and the fire burns out after a few seconds unless it stands on helstein (MC).
 */
export class FireSystem {
  fires = new Map<string, Fire>();

  clear(): void { this.fires.clear(); }

  /** Light a fire at (x,y,z) (sets the block). Returns false if fire can't exist there. */
  ignite(w: BlockAccess, x: number, y: number, z: number, rng: () => number = Math.random): boolean {
    if (!canPlaceFire(w, x, y, z)) return false;
    w.setBlock(x, y, z, BlockId.Fire);
    this.track(x, y, z, rng);
    return true;
  }

  track(x: number, y: number, z: number, rng: () => number = Math.random): void {
    this.fires.set(`${x},${y},${z}`, { x, y, z, age: 0, life: 3 + rng() * 4, acc: 0 });
  }

  /** Advance fires. Returns cells that changed (for remeshing / particles). */
  update(dt: number, w: BlockAccess, rng: () => number = Math.random): { x: number; y: number; z: number; burnt?: number }[] {
    const changed: { x: number; y: number; z: number; burnt?: number }[] = [];
    for (const [k, f] of [...this.fires]) {
      if (w.getBlock(f.x, f.y, f.z) !== BlockId.Fire) { this.fires.delete(k); continue; }
      f.acc += dt;
      while (f.acc >= FIRE_TICK) {
        f.acc -= FIRE_TICK;
        f.age += FIRE_TICK;
        // spread: burn one flammable neighbour now and then
        for (const [dx, dy, dz] of DIRS) {
          const nx = f.x + dx, ny = f.y + dy, nz = f.z + dz;
          const nid = w.getBlock(nx, ny, nz);
          if (!isFlammable(nid) || rng() >= SPREAD_CHANCE) continue;
          w.setBlock(nx, ny, nz, BlockId.Air);
          if (canPlaceFire(w, nx, ny, nz)) { w.setBlock(nx, ny, nz, BlockId.Fire); this.track(nx, ny, nz, rng); }
          changed.push({ x: nx, y: ny, z: nz, burnt: nid });
        }
        const base = w.getBlock(f.x, f.y - 1, f.z);
        const unsupported = !isSolid(base) && !hasFlammableNeighbour(w, f.x, f.y, f.z);
        if (unsupported || (!isEternalBase(base) && f.age >= f.life && !hasFlammableNeighbour(w, f.x, f.y, f.z))
          || (!isEternalBase(base) && f.age >= f.life * 3)) {
          w.setBlock(f.x, f.y, f.z, BlockId.Air);
          this.fires.delete(k);
          changed.push({ x: f.x, y: f.y, z: f.z });
          break;
        }
      }
    }
    return changed;
  }
}

/** Player burning state (MC: fire 1 dmg/0.5 s, lava 4 dmg/0.5 s, then burning 1 dmg/s for 8 s / 15 s; water puts it out). */
export interface BurnState { burnTime: number; hotAcc: number; burnAcc: number }
export function createBurnState(): BurnState { return { burnTime: 0, hotAcc: 0, burnAcc: 0 }; }

export function burnTick(s: BurnState, inFire: boolean, inLava: boolean, inWater: boolean, dt: number): number {
  let dmg = 0;
  if (inWater) { s.burnTime = 0; s.burnAcc = 0; s.hotAcc = 0; return 0; }
  if (inLava || inFire) {
    s.burnTime = Math.max(s.burnTime, inLava ? 15 : 8);
    s.hotAcc += dt;
    while (s.hotAcc >= 0.5 - 1e-9) { s.hotAcc -= 0.5; dmg += inLava ? 4 : 1; }
    s.burnAcc = 0;
    return dmg;
  }
  s.hotAcc = 0;
  if (s.burnTime > 0) {
    s.burnTime = Math.max(0, s.burnTime - dt);
    s.burnAcc += dt;
    while (s.burnAcc >= 1 - 1e-9) { s.burnAcc -= 1; dmg += 1; }
  }
  return dmg;
}

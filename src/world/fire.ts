import { BlockId, isSolid } from '../blocks/types';
import type { BlockAccess } from './gravity';

/** MC flammable blocks (wood, leaves, wool, plants…): fire next to them spreads and burns them away. */
export function isFlammable(id: number): boolean {
  return id === BlockId.Planks || id === BlockId.Log || id === BlockId.Leaves || id === BlockId.Wool
    || id === BlockId.TallGrass || id === BlockId.Dandelion || id === BlockId.Poppy || id === BlockId.Sapling
    || id === BlockId.Fence || id === BlockId.Gate || id === BlockId.Stairs || id === BlockId.Slab
    || id === BlockId.Ladder || id === BlockId.Bed || id === BlockId.CraftingTable || id === BlockId.Door
    || id === BlockId.Trapdoor || id === BlockId.Sign
    || id === BlockId.DoubleGrass || id === BlockId.DoubleGrassTop;
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
export const SPREAD_CHANCE = 0.2;
/** it20: chance per fire tick that a rained-on fire goes out (MC: rain puts out exposed fire within ~1–2 s). */
export const RAIN_EXTINGUISH_CHANCE = 0.5;
/** it20: chance per lava block per lava tick (1 s) to try to light something nearby. */
export const LAVA_IGNITE_CHANCE = 0.25;

/** it20: rain reaches (x,y,z) — nothing but air/plants/fire above it up to the sky. */
export function openToSky(w: BlockAccess, x: number, y: number, z: number, top = 64): boolean {
  for (let yy = y + 1; yy < top; yy++) {
    const id = w.getBlock(x, yy, z);
    if (id !== BlockId.Air && id !== BlockId.Fire && id !== BlockId.TallGrass && id !== BlockId.Dandelion
      && id !== BlockId.Poppy && id !== BlockId.Sapling && id !== BlockId.Torch
      && id !== BlockId.DoubleGrass && id !== BlockId.DoubleGrassTop) return false;
  }
  return true;
}

/**
 * it20 (MC LavaFluid.randomTick): lava sets fire to flammable things nearby. From a lava block, try a few
 * cells above it (up to 3 steps, ±1 sideways): an air cell touching something flammable catches fire.
 * Otherwise try a cell at lava level beside it: if it is flammable and the cell above is air, fire appears on top.
 * Returns the cells set on fire.
 */
export function lavaIgnite(fs: FireSystem, w: BlockAccess, x: number, y: number, z: number, rng: () => number = Math.random): { x: number; y: number; z: number }[] {
  const out: { x: number; y: number; z: number }[] = [];
  const steps = Math.floor(rng() * 3);
  if (steps > 0) {
    let px = x, py = y, pz = z;
    for (let i = 0; i < steps; i++) {
      px += Math.floor(rng() * 3) - 1; py += 1; pz += Math.floor(rng() * 3) - 1;
      const id = w.getBlock(px, py, pz);
      if (id === BlockId.Air) {
        if (hasFlammableNeighbour(w, px, py, pz)) { if (fs.ignite(w, px, py, pz, rng)) out.push({ x: px, y: py, z: pz }); return out; }
      } else if (isSolid(id)) return out;
    }
  } else {
    for (let i = 0; i < 3; i++) {
      const px = x + Math.floor(rng() * 3) - 1, pz = z + Math.floor(rng() * 3) - 1;
      if (w.getBlock(px, y + 1, pz) === BlockId.Air && isFlammable(w.getBlock(px, y, pz))) {
        if (fs.ignite(w, px, y + 1, pz, rng)) out.push({ x: px, y: y + 1, z: pz });
      }
    }
  }
  return out;
}

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

  /** Pick up fire blocks that aren't tracked (e.g. after loading a save) in a box around (x,y,z). */
  adoptAround(w: BlockAccess, x: number, y: number, z: number, r = 16, ry = 12, rng: () => number = Math.random): number {
    let n = 0;
    const cx = Math.floor(x), cy = Math.floor(y), cz = Math.floor(z);
    for (let yy = Math.max(1, cy - ry); yy <= cy + ry; yy++) for (let xx = cx - r; xx <= cx + r; xx++) for (let zz = cz - r; zz <= cz + r; zz++) {
      if (w.getBlock(xx, yy, zz) !== BlockId.Fire || this.fires.has(`${xx},${yy},${zz}`)) continue;
      this.track(xx, yy, zz, rng); n++;
    }
    return n;
  }

  /**
   * Advance fires. Returns cells that changed (for remeshing / particles).
   * it20 (MC): `rainedOn(x,y,z)` → true when it rains on that cell (open sky); such fires go out quickly
   * (except eternal fire on helstein).
   */
  update(dt: number, w: BlockAccess, rng: () => number = Math.random, rainedOn?: (x: number, y: number, z: number) => boolean): { x: number; y: number; z: number; burnt?: number; rained?: boolean }[] {
    const changed: { x: number; y: number; z: number; burnt?: number; rained?: boolean }[] = [];
    for (const [k, f] of [...this.fires]) {
      if (w.getBlock(f.x, f.y, f.z) !== BlockId.Fire) { this.fires.delete(k); continue; }
      f.acc += dt;
      while (f.acc >= FIRE_TICK) {
        f.acc -= FIRE_TICK;
        f.age += FIRE_TICK;
        if (rainedOn && !isEternalBase(w.getBlock(f.x, f.y - 1, f.z)) && rng() < RAIN_EXTINGUISH_CHANCE && rainedOn(f.x, f.y, f.z)) {
          w.setBlock(f.x, f.y, f.z, BlockId.Air);
          this.fires.delete(k);
          changed.push({ x: f.x, y: f.y, z: f.z, rained: true });
          break;
        }
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
          || (!isEternalBase(base) && f.age >= f.life * 4)) {
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

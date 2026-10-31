import { BlockId, isSolid } from '../blocks/types';
import { isGravityBlock, type BlockAccess } from './gravity';
import { isDoublePlant, breakPartner } from './doubleGrass';

/**
 * it21 (MC): sand and gravel fall as a moving entity (you see the block drop) instead of teleporting to the ground.
 * Gravity ≈ 16 blocks/s² with MC's 0.98/tick drag. On landing it becomes a block again; landing on a
 * non-colliding block (torch, red dust, crop…) breaks it into an item.
 */
export interface FallingBlock { x: number; y: number; z: number; vy: number; id: number; age: number }

function passable(id: number): boolean {
  return id === BlockId.Air || id === BlockId.Water || id === BlockId.Lava || id === BlockId.TallGrass
    || id === BlockId.Fire || id === BlockId.DoubleGrass || id === BlockId.DoubleGrassTop;
}

export const FALL_GRAVITY = 16;

export class FallingBlocks {
  list: FallingBlock[] = [];

  /** Turn the gravity block at (x,y,z) into a falling entity if it's unsupported. Returns true if it started falling. */
  tryStart(w: BlockAccess, x: number, y: number, z: number, onVacated?: (x: number, y: number, z: number) => void): boolean {
    const id = w.getBlock(x, y, z);
    if (!isGravityBlock(id) || y <= 0) return false;
    if (!passable(w.getBlock(x, y - 1, z))) return false;
    w.setBlock(x, y, z, BlockId.Air);
    this.list.push({ x: x + 0.5, y, z: z + 0.5, vy: 0, id, age: 0 });
    onVacated?.(x, y, z);
    return true;
  }

  /** After (x,y,z) changed: the block itself and the gravity column above start falling (bottom-up). */
  updateAround(w: BlockAccess, x: number, y: number, z: number, onVacated?: (x: number, y: number, z: number) => void): number {
    let n = 0;
    if (this.tryStart(w, x, y, z, onVacated)) n++;
    for (let yy = y + 1; yy < y + 256; yy++) {
      const id = w.getBlock(x, yy, z);
      if (!isGravityBlock(id) || !passable(w.getBlock(x, yy - 1, z))) break;
      w.setBlock(x, yy, z, BlockId.Air);
      this.list.push({ x: x + 0.5, y: yy, z: z + 0.5, vy: 0, id, age: 0 });
      onVacated?.(x, yy, z);
      n++;
    }
    return n;
  }

  /** Advance. onLand / onPop get called when an entity turns back into a block or into an item. */
  step(dt: number, w: BlockAccess, onLand?: (x: number, y: number, z: number, id: number) => void, onPop?: (x: number, y: number, z: number, id: number) => void): void {
    if (!this.list.length) return;
    this.list.sort((a, b) => a.y - b.y);
    const keep: FallingBlock[] = [];
    for (const f of this.list) {
      f.age += dt;
      f.vy = (f.vy - FALL_GRAVITY * dt) * Math.pow(0.98, dt * 20);
      const ny = f.y + f.vy * dt;
      const bx = Math.floor(f.x), bz = Math.floor(f.z);
      let landY: number | null = null;
      // cells whose top lies between the old and the new bottom of the falling block
      for (let cy = Math.floor(f.y + 1e-6) - 1; cy + 1 > ny - 1e-9; cy--) {
        if (cy < 0) { landY = 0; break; }
        if (!passable(w.getBlock(bx, cy, bz))) { landY = cy + 1; break; }
      }
      if (landY == null && f.age < 30) { f.y = ny; keep.push(f); continue; }
      const ly = landY ?? Math.max(0, Math.floor(ny));
      const under = w.getBlock(bx, ly - 1, bz);
      const here = w.getBlock(bx, ly, bz);
      if ((ly > 0 && !isSolid(under) && !passable(under)) || !passable(here)) { onPop?.(bx, ly, bz, f.id); continue; }
      // it22 (MC): landing in (either half of) double tall grass destroys the whole plant
      if (isDoublePlant(here)) breakPartner(w, bx, ly, bz, here);
      w.setBlock(bx, ly, bz, f.id);
      onLand?.(bx, ly, bz, f.id);
    }
    this.list = keep;
  }

  /** Settle everything instantly (before saving, so no block is lost mid-air). */
  flush(w: BlockAccess, onPop?: (x: number, y: number, z: number, id: number) => void): void {
    let guard = 0;
    while (this.list.length && guard++ < 2000) this.step(0.05, w, undefined, onPop);
  }
}

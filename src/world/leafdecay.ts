import { BlockId } from '../blocks/types';
import type { BlockAccess } from './gravity';

/** MC: leaves further than 6 (taxicab steps through leaves) from a log decay. */
export const LEAF_RANGE = 6;
/** Meta bit marking player-placed leaves (MC "persistent" leaves never decay). */
export const LEAF_PERSISTENT = 1;

export interface MetaAccess extends BlockAccess {
  getWaterLevel(x: number, y: number, z: number): number;
}

/** True if the leaf at (x,y,z) connects to a log within LEAF_RANGE steps through leaves. */
export function leafSupported(w: BlockAccess, x: number, y: number, z: number): boolean {
  const seen = new Set<string>();
  let frontier: [number, number, number][] = [[x, y, z]];
  seen.add(`${x},${y},${z}`);
  for (let d = 0; d < LEAF_RANGE; d++) {
    const next: [number, number, number][] = [];
    for (const [cx, cy, cz] of frontier) {
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const nx = cx + dx, ny = cy + dy, nz = cz + dz;
        const k = `${nx},${ny},${nz}`;
        if (seen.has(k)) continue;
        seen.add(k);
        const id = w.getBlock(nx, ny, nz);
        if (id === BlockId.Log) return true;
        if (id === BlockId.Leaves) next.push([nx, ny, nz]);
      }
    }
    frontier = next;
    if (!frontier.length) break;
  }
  return false;
}

interface Pending { x: number; y: number; z: number; at: number }

/** Schedules decay of unsupported natural leaves after a log/leaf is removed. */
export class LeafDecay {
  pending: Pending[] = [];
  private keys = new Set<string>();
  time = 0;

  clear(): void { this.pending = []; this.keys.clear(); }

  /** Call after a Log or Leaves block at (x,y,z) is removed. */
  onRemoved(w: MetaAccess, x: number, y: number, z: number, rnd = Math.random): void {
    const R = LEAF_RANGE - 1;
    for (let dy = -R; dy <= R; dy++) for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > LEAF_RANGE) continue;
      const lx = x + dx, ly = y + dy, lz = z + dz;
      if (w.getBlock(lx, ly, lz) !== BlockId.Leaves) continue;
      if (w.getWaterLevel(lx, ly, lz) & LEAF_PERSISTENT) continue;
      const k = `${lx},${ly},${lz}`;
      if (this.keys.has(k)) continue;
      if (leafSupported(w, lx, ly, lz)) continue;
      this.keys.add(k);
      // MC random ticks: a cut tree loses its canopy over roughly 5–30 s.
      this.pending.push({ x: lx, y: ly, z: lz, at: this.time + 2 + rnd() * 18 });
    }
  }

  /** Advance; decays due leaves. Returns removed positions (caller spawns drops). */
  update(dt: number, w: MetaAccess): { x: number; y: number; z: number }[] {
    this.time += dt;
    const out: { x: number; y: number; z: number }[] = [];
    if (!this.pending.length) return out;
    const keep: Pending[] = [];
    for (const p of this.pending) {
      if (p.at > this.time) { keep.push(p); continue; }
      this.keys.delete(`${p.x},${p.y},${p.z}`);
      if (w.getBlock(p.x, p.y, p.z) !== BlockId.Leaves) continue;
      if (w.getWaterLevel(p.x, p.y, p.z) & LEAF_PERSISTENT) continue;
      if (leafSupported(w, p.x, p.y, p.z)) continue; // a log was placed back
      w.setBlock(p.x, p.y, p.z, BlockId.Air);
      out.push({ x: p.x, y: p.y, z: p.z });
    }
    this.pending = keep;
    return out;
  }
}

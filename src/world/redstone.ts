import { BlockId } from '../blocks/types';
import type { World } from './world';

/** Simple power propagation for Rødtråd / Spak / Knapp / Trykkplate / Lampe. */
export class RedstoneSystem {
  private power = new Map<string, number>();
  cool = 0;
  /** Positions that changed this tick (for remesh / particles). */
  dirty: { x: number; y: number; z: number }[] = [];
  lastPoweredDust: { x: number; y: number; z: number; p: number }[] = [];

  private key(x: number, y: number, z: number): string { return `${x},${y},${z}`; }

  getPower(x: number, y: number, z: number): number {
    return this.power.get(this.key(x, y, z)) ?? 0;
  }

  toggleLever(world: World, x: number, y: number, z: number): void {
    const meta = world.getWaterLevel(x, y, z);
    world.setMeta(x, y, z, meta ^ 1);
    this.cool = 0;
  }

  pulseButton(world: World, x: number, y: number, z: number): void {
    world.setMeta(x, y, z, 1);
    this.cool = 0;
    setTimeout(() => {
      if (world.getBlock(x, y, z) === BlockId.Button) world.setMeta(x, y, z, 0);
    }, 800);
  }

  update(world: World, player: { x: number; y: number; z: number }, dt: number): void {
    this.cool -= dt;
    if (this.cool > 0) return;
    this.cool = 0.15;
    this.power.clear();
    this.dirty = [];
    this.lastPoweredDust = [];
    const sources: [number, number, number, number][] = [];
    const r = 24;
    const px = Math.floor(player.x), py = Math.floor(player.y), pz = Math.floor(player.z);
    for (let dy = -4; dy <= 4; dy++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const x = px + dx, y = py + dy, z = pz + dz;
      const id = world.getBlock(x, y, z);
      const meta = world.getWaterLevel(x, y, z);
      if (id === BlockId.Lever && (meta & 1)) sources.push([x, y, z, 15]);
      if (id === BlockId.Button && (meta & 1)) sources.push([x, y, z, 15]);
      if (id === BlockId.PressurePlate) {
        const on = Math.hypot(player.x - (x + 0.5), player.z - (z + 0.5)) < 0.8 && Math.abs(player.y - y) < 1.2;
        const want = on ? 1 : 0;
        if (meta !== want) { world.setMeta(x, y, z, want); this.dirty.push({ x, y, z }); }
        if (on) sources.push([x, y, z, 15]);
      }
    }
    const q = [...sources];
    for (const [x, y, z, p] of sources) this.power.set(this.key(x, y, z), p);
    let qi = 0;
    while (qi < q.length) {
      const [x, y, z, p] = q[qi++];
      if (p <= 1) continue;
      for (const [dx, dy, dz] of [[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[0,1,0],[0,-1,0]] as const) {
        const nx = x + dx, ny = y + dy, nz = z + dz;
        const id = world.getBlock(nx, ny, nz);
        if (id !== BlockId.RedDust && id !== BlockId.Lamp && id !== BlockId.Door && id !== BlockId.Gate && id !== BlockId.Trapdoor) continue;
        const np = p - 1;
        const k = this.key(nx, ny, nz);
        if ((this.power.get(k) ?? 0) >= np) continue;
        this.power.set(k, np);
        if (id === BlockId.RedDust) {
          q.push([nx, ny, nz, np]);
          this.lastPoweredDust.push({ x: nx, y: ny, z: nz, p: np });
        }
        if (id === BlockId.Lamp) {
          const cur = world.getWaterLevel(nx, ny, nz);
          const want = np > 0 ? 1 : 0;
          if (cur !== want) { world.setMeta(nx, ny, nz, want); this.dirty.push({ x: nx, y: ny, z: nz }); }
        }
        if ((id === BlockId.Door || id === BlockId.Gate || id === BlockId.Trapdoor) && np > 0) {
          const meta = world.getWaterLevel(nx, ny, nz);
          if (!(meta & 1)) { world.setMeta(nx, ny, nz, meta | 1); this.dirty.push({ x: nx, y: ny, z: nz }); }
        }
      }
    }
    for (let dy = -4; dy <= 4; dy++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const x = px + dx, y = py + dy, z = pz + dz;
      const id = world.getBlock(x, y, z);
      if (id === BlockId.Door || id === BlockId.Gate || id === BlockId.Trapdoor) {
        if (this.getPower(x, y, z) <= 0) {
          const meta = world.getWaterLevel(x, y, z);
          // Only auto-close if powered-open flag was set by redstone (bit1)
          if ((meta & 2) && (meta & 1)) {
            world.setMeta(x, y, z, meta & ~3);
            this.dirty.push({ x, y, z });
          }
        }
      }
      if (id === BlockId.Lamp && this.getPower(x, y, z) <= 0) {
        if (world.getWaterLevel(x, y, z) !== 0) {
          world.setMeta(x, y, z, 0);
          this.dirty.push({ x, y, z });
        }
      }
    }
  }
}

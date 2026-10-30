import type { ItemStack } from '../items/types';
import type { PlayerState } from '../player/physics';
import type { Inventory } from '../items/inventory';

export interface DropEntity {
  id: number;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  stack: ItemStack;
  age: number;
  /** Seconds before the player may pick it up (MC: thrown items ≈2 s). */
  pickupDelay?: number;
}

/** Minecraft item entities despawn after 5 minutes. */
export const DROP_DESPAWN_SEC = 300;

export class DropSystem {
  drops: DropEntity[] = [];
  nextId = 1;

  spawn(x: number, y: number, z: number, stack: ItemStack): void {
    this.drops.push({
      id: this.nextId++,
      x: x + 0.5 + (Math.random() - 0.5) * 0.3,
      y: y + 0.3,
      z: z + 0.5 + (Math.random() - 0.5) * 0.3,
      vx: (Math.random() - 0.5) * 2,
      vy: 3,
      vz: (Math.random() - 0.5) * 2,
      stack: { ...stack },
      age: 0,
    });
  }

  /** Throw an item (Q-drop / overflow) with an explicit velocity and pickup delay. */
  throwItem(x: number, y: number, z: number, vx: number, vy: number, vz: number, stack: ItemStack, pickupDelay = 2): void {
    this.drops.push({ id: this.nextId++, x, y, z, vx, vy, vz, stack: { ...stack }, age: 0, pickupDelay });
  }

  /**
   * @param solidAt true if the block cell at (x,y,z) is solid. Drops collide with the
   * first solid block *below their own position* (not the column top — that teleported
   * items mined under a roof/in caves up onto the surface).
   */
  update(dt: number, player: PlayerState, inv: Inventory, solidAt: (x: number, y: number, z: number) => boolean): void {
    // Sub-step so frame hitches can't tunnel items through floors.
    let rest = dt;
    while (rest > 1e-6) {
      const h = Math.min(rest, 1 / 30);
      this.step(h, player, inv, solidAt);
      rest -= h;
    }
  }

  private step(dt: number, player: PlayerState, inv: Inventory, solidAt: (x: number, y: number, z: number) => boolean): void {
    const keep: DropEntity[] = [];
    for (const d of this.drops) {
      d.age += dt;
      // Pop out if spawned/embedded inside a solid block (e.g. block placed on it).
      let guard = 0;
      while (solidAt(d.x, d.y, d.z) && guard++ < 4) { d.y = Math.floor(d.y) + 1.2; d.vy = 0; }
      d.vy -= 20 * dt;
      const nx = d.x + d.vx * dt;
      const nz = d.z + d.vz * dt;
      // Horizontal collision: stop sideways motion into walls.
      if (!solidAt(nx, d.y, d.z)) d.x = nx; else d.vx = 0;
      if (!solidAt(d.x, d.y, nz)) d.z = nz; else d.vz = 0;
      const ny = d.y + d.vy * dt;
      if (d.vy > 0 && solidAt(d.x, ny + 0.25, d.z)) {
        d.vy = 0; // bonk ceiling
      } else if (d.vy <= 0 && solidAt(d.x, ny - 0.2, d.z)) {
        d.y = Math.floor(ny - 0.2) + 1.2;
        d.vy = 0;
        d.vx *= 0.7;
        d.vz *= 0.7;
      } else {
        d.y = ny;
      }
      d.vx *= 0.95;
      d.vz *= 0.95;
      if (d.y < -16) continue; // fell out of world
      if (d.age > Math.max(0.5, d.pickupDelay ?? 0)) {
        const dist = Math.hypot(d.x - player.x, d.y - (player.y + 0.9), d.z - player.z);
        if (dist < 1.6) {
          const left = inv.add(d.stack);
          if (left <= 0) continue;
          d.stack.count = left;
        }
      }
      if (d.age < DROP_DESPAWN_SEC) keep.push(d);
    }
    this.drops = keep;
  }

  toJSON() {
    return this.drops.map((d) => ({ x: d.x, y: d.y, z: d.z, stack: d.stack, age: d.age }));
  }

  loadJSON(data: { x: number; y: number; z: number; stack: ItemStack; age: number }[]): void {
    this.drops = data.map((d) => ({
      id: this.nextId++,
      x: d.x, y: d.y, z: d.z, vx: 0, vy: 0, vz: 0,
      stack: { ...d.stack }, age: d.age,
    }));
  }
}

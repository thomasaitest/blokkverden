import type { ItemStack } from '../items/types';
import type { PlayerState } from '../player/physics';
import type { Inventory } from '../items/inventory';

export interface DropEntity {
  id: number;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  stack: ItemStack;
  age: number;
}

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

  update(dt: number, player: PlayerState, inv: Inventory, groundY: (x: number, z: number) => number): void {
    const keep: DropEntity[] = [];
    for (const d of this.drops) {
      d.age += dt;
      d.vy -= 20 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.z += d.vz * dt;
      d.vx *= 0.95;
      d.vz *= 0.95;
      const gy = groundY(d.x, d.z) + 0.2;
      if (d.y < gy) {
        d.y = gy;
        d.vy = 0;
        d.vx *= 0.7;
        d.vz *= 0.7;
      }
      if (d.age > 0.5) {
        const dist = Math.hypot(d.x - player.x, d.y - (player.y + 0.9), d.z - player.z);
        if (dist < 1.6) {
          const left = inv.add(d.stack);
          if (left <= 0) continue;
          d.stack.count = left;
        }
      }
      if (d.age < 120) keep.push(d);
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

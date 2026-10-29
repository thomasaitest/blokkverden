import { BlockId, isSolid } from '../blocks/types';
import type { World } from './world';
import type { PlayerState } from '../player/physics';

export interface Boat {
  x: number; y: number; z: number;
  yaw: number;
  vx: number; vz: number;
}

export class BoatSystem {
  boats: Boat[] = [];
  mounted = false;

  place(x: number, y: number, z: number): Boat {
    const b: Boat = { x, y, z, yaw: 0, vx: 0, vz: 0 };
    this.boats.push(b);
    return b;
  }

  nearest(px: number, py: number, pz: number, r = 2.5): Boat | null {
    let best: Boat | null = null, bd = r;
    for (const b of this.boats) {
      const d = Math.hypot(b.x - px, b.y - py, b.z - pz);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  update(dt: number, world: World, player: PlayerState, wishX: number, wishZ: number, inputForward: boolean): void {
    for (const b of this.boats) {
      const under = world.getBlock(Math.floor(b.x), Math.floor(b.y - 0.2), Math.floor(b.z));
      const inWater = under === BlockId.Water || world.getBlock(Math.floor(b.x), Math.floor(b.y), Math.floor(b.z)) === BlockId.Water;
      if (inWater) b.y = Math.floor(b.y) + 0.4;
      else if (!isSolid(under)) b.y -= 4 * dt;

      if (this.mounted && this.boats[0] === b || (this.mounted && Math.hypot(b.x - player.x, b.z - player.z) < 1.5)) {
        // drive
        const speed = inWater ? 4.5 : 0.5;
        const s = Math.sin(player.yaw), c = Math.cos(player.yaw);
        let fx = 0, fz = 0;
        if (inputForward || wishZ < -0.1) { fx -= s; fz -= c; }
        if (wishZ > 0.1) { fx += s; fz += c; }
        if (wishX > 0.1) { fx += c; fz -= s; }
        if (wishX < -0.1) { fx -= c; fz += s; }
        const len = Math.hypot(fx, fz) || 1;
        b.vx = (fx / len) * speed;
        b.vz = (fz / len) * speed;
        b.yaw = player.yaw;
        b.x += b.vx * dt; b.z += b.vz * dt;
        player.x = b.x; player.y = b.y + 0.6; player.z = b.z;
        player.vx = player.vz = 0; player.vy = 0;
      } else {
        b.vx *= 0.9; b.vz *= 0.9;
        b.x += b.vx * dt; b.z += b.vz * dt;
      }
    }
  }

  tryMount(player: PlayerState): boolean {
    const b = this.nearest(player.x, player.y, player.z);
    if (!b) return false;
    this.mounted = !this.mounted;
    if (this.mounted) {
      player.x = b.x; player.y = b.y + 0.6; player.z = b.z;
    }
    return true;
  }
}

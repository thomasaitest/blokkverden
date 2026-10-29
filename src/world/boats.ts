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
      const bx = Math.floor(b.x), bz = Math.floor(b.z);
      let surface: number | null = null;
      for (let y = Math.min(70, Math.floor(b.y) + 3); y >= Math.max(1, Math.floor(b.y) - 4); y--) {
        if (world.getBlock(bx, y, bz) === BlockId.Water) {
          const above = world.getBlock(bx, y + 1, bz);
          if (above !== BlockId.Water) {
            const lvl = world.getWaterLevel(bx, y, bz) || 7;
            surface = y + Math.max(0.125, lvl / 7);
            break;
          }
        }
      }
      const under = world.getBlock(bx, Math.floor(b.y - 0.2), bz);
      const inWater = surface != null;
      if (inWater && surface != null) b.y = surface - 0.12; // hull sits just under surface
      else if (!isSolid(under)) b.y -= 4 * dt;

      if (this.mounted && this.boats[0] === b || (this.mounted && Math.hypot(b.x - player.x, b.z - player.z) < 1.5)) {
        // drive
        const speed = inWater ? 5.2 : 0.35;
        // steer toward look yaw with inertia
        let dyaw = player.yaw - b.yaw;
        while (dyaw > Math.PI) dyaw -= Math.PI * 2;
        while (dyaw < -Math.PI) dyaw += Math.PI * 2;
        b.yaw += dyaw * Math.min(1, 4 * dt);
        const s = Math.sin(b.yaw), c = Math.cos(b.yaw);
        let throttle = 0;
        if (inputForward || wishZ < -0.1) throttle += 1;
        if (wishZ > 0.1) throttle -= 0.45;
        // strafe gently
        const strafe = (wishX > 0.1 ? 1 : 0) + (wishX < -0.1 ? -1 : 0);
        const tx = (-s * throttle + c * strafe * 0.35) * speed;
        const tz = (-c * throttle - s * strafe * 0.35) * speed;
        b.vx += (tx - b.vx) * Math.min(1, 3 * dt);
        b.vz += (tz - b.vz) * Math.min(1, 3 * dt);
        b.x += b.vx * dt; b.z += b.vz * dt;
        player.x = b.x; player.y = b.y + 0.55; player.z = b.z;
        player.yaw = b.yaw;
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

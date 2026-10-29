import { BlockId, isSolid } from '../blocks/types';
import type { World } from './world';
import type { PlayerState } from '../player/physics';

export interface Boat {
  id: number;
  x: number; y: number; z: number;
  yaw: number;
  vx: number; vz: number;
}

export class BoatSystem {
  boats: Boat[] = [];
  mounted = false;
  mountedId: number | null = null;
  private nextId = 1;

  place(x: number, y: number, z: number): Boat {
    const b: Boat = { id: this.nextId++, x, y, z, yaw: 0, vx: 0, vz: 0 };
    this.boats.push(b);
    return b;
  }

  nearest(px: number, py: number, pz: number, r = 2.8): Boat | null {
    let best: Boat | null = null, bd = r;
    for (const b of this.boats) {
      const d = Math.hypot(b.x - px, (b.y + 0.4) - py, b.z - pz);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  getMounted(): Boat | null {
    if (!this.mounted || this.mountedId == null) return null;
    return this.boats.find((b) => b.id === this.mountedId) ?? null;
  }

  /** Water surface Y for a world column, or null. */
  waterSurfaceY(world: World, x: number, z: number, aroundY: number): number | null {
    const bx = Math.floor(x), bz = Math.floor(z);
    for (let y = Math.min(70, Math.floor(aroundY) + 4); y >= Math.max(1, Math.floor(aroundY) - 5); y--) {
      if (world.getBlock(bx, y, bz) === BlockId.Water) {
        const above = world.getBlock(bx, y + 1, bz);
        if (above !== BlockId.Water) {
          const lvl = world.getWaterLevel(bx, y, bz) || 7;
          return y + Math.max(0.125, lvl / 7);
        }
      }
    }
    return null;
  }

  update(dt: number, world: World, player: PlayerState, wishX: number, wishZ: number, inputForward: boolean): void {
    for (const b of this.boats) {
      const surface = this.waterSurfaceY(world, b.x, b.z, b.y);
      const under = world.getBlock(Math.floor(b.x), Math.floor(b.y - 0.2), Math.floor(b.z));
      const inWater = surface != null;
      if (inWater && surface != null) b.y = surface - 0.12;
      else if (!isSolid(under)) b.y -= 4 * dt;

      const isRide = this.mounted && this.mountedId === b.id;
      if (isRide) {
        const speed = inWater ? 5.2 : 0.35;
        let dyaw = player.yaw - b.yaw;
        while (dyaw > Math.PI) dyaw -= Math.PI * 2;
        while (dyaw < -Math.PI) dyaw += Math.PI * 2;
        b.yaw += dyaw * Math.min(1, 4 * dt);
        const s = Math.sin(b.yaw), c = Math.cos(b.yaw);
        let throttle = 0;
        if (inputForward || wishZ < -0.1) throttle += 1;
        if (wishZ > 0.1) throttle -= 0.45;
        const strafe = (wishX > 0.1 ? 1 : 0) + (wishX < -0.1 ? -1 : 0);
        // Match look-aligned movement: forward = (-sin, -cos)
        const tx = (-s * throttle + c * strafe * 0.35) * speed;
        const tz = (-c * throttle - s * strafe * 0.35) * speed;
        b.vx += (tx - b.vx) * Math.min(1, 3 * dt);
        b.vz += (tz - b.vz) * Math.min(1, 3 * dt);
        b.x += b.vx * dt; b.z += b.vz * dt;
        player.x = b.x; player.y = b.y + 0.55; player.z = b.z;
        player.vx = player.vz = 0; player.vy = 0;
        player.onGround = true;
      } else {
        b.vx *= 0.9; b.vz *= 0.9;
        b.x += b.vx * dt; b.z += b.vz * dt;
      }
    }
  }

  tryMount(player: PlayerState): boolean {
    if (this.mounted) {
      this.dismount(player);
      return true;
    }
    const b = this.nearest(player.x, player.y, player.z);
    if (!b) return false;
    this.mounted = true;
    this.mountedId = b.id;
    player.x = b.x; player.y = b.y + 0.6; player.z = b.z;
    player.vx = player.vy = player.vz = 0;
    return true;
  }

  dismount(player: PlayerState): void {
    const b = this.getMounted();
    this.mounted = false;
    this.mountedId = null;
    if (b) {
      // Step beside boat
      player.x = b.x + Math.cos(b.yaw) * 1.2;
      player.z = b.z + Math.sin(b.yaw) * 1.2;
      player.y = b.y + 0.8;
    }
  }

  mountBoat(player: PlayerState, boat: Boat): boolean {
    this.mounted = true;
    this.mountedId = boat.id;
    player.x = boat.x; player.y = boat.y + 0.6; player.z = boat.z;
    player.vx = player.vy = player.vz = 0;
    return true;
  }
}

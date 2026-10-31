import { BlockId, isSolid } from '../blocks/types';
import type { World } from './world';
import type { PlayerState } from '../player/physics';
import { flowAt, WATER_PUSH } from './flow';

export interface Boat {
  id: number;
  x: number; y: number; z: number;
  yaw: number;
  vx: number; vz: number;
  /** it26: accumulated hit damage (MC: a few quick punches break it), decays over time */
  dmg?: number;
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

  /** it26 (MC): the boat the look ray hits within reach (distance along the ray), or null. */
  pickAt(x: number, y: number, z: number, reach: number, yaw: number, pitch: number): { boat: Boat; t: number } | null {
    const cosP = Math.cos(pitch);
    const dx = -Math.sin(yaw) * cosP, dy = Math.sin(pitch), dz = -Math.cos(yaw) * cosP;
    let best: { boat: Boat; t: number } | null = null;
    for (const b of this.boats) {
      if (this.mounted && this.mountedId === b.id) continue;
      const cy = b.y + 0.25;
      const t = (b.x - x) * dx + (cy - y) * dy + (b.z - z) * dz;
      if (t < 0 || t > reach) continue;
      const d = Math.hypot(x + dx * t - b.x, y + dy * t - cy, z + dz * t - b.z);
      if (d < 0.75 && (!best || t < best.t)) best = { boat: b, t };
    }
    return best;
  }

  /** it26 (MC): punch a boat. 3 quick hits (or one in creative) break it; returns true when it broke (removed). */
  hit(b: Boat, creative: boolean): boolean {
    b.dmg = (b.dmg ?? 0) + 1;
    if (creative || b.dmg > 2.4) {
      this.boats = this.boats.filter((o) => o !== b);
      return true;
    }
    return false;
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
          // it26: falling water (8) is a full block, not 8/7 (boat floated above a waterfall top)
          return y + Math.min(1, Math.max(0.125, lvl / 7));
        }
      }
    }
    return null;
  }

  /** it26 (MC): a boat can't sail into solid blocks (it drove straight through shores and walls).
   *  The hull is checked as an oriented box (long along its heading), r = half width, l = half length. */
  private blocked(world: World, x: number, y: number, z: number, yaw: number, l = 0.8, r = 0.42): boolean {
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const y0 = Math.floor(y + 0.25), y1 = Math.floor(y + 0.9);
    for (const a of [-l, 0, l]) for (const c of [-r, r]) {
      const bx = Math.floor(x + fx * a + fz * c), bz = Math.floor(z + fz * a - fx * c);
      for (let yy = y0; yy <= y1; yy++) if (isSolid(world.getBlock(bx, yy, bz))) return true;
    }
    return false;
  }

  private move(world: World, b: Boat, dt: number): void {
    // turned into a tight spot: fall back to a small core box so it can turn/move out, but never through a wall
    const stuck = this.blocked(world, b.x, b.y, b.z, b.yaw);
    const l = stuck ? 0.3 : 0.8, r = stuck ? 0.3 : 0.42;
    const nx = b.x + b.vx * dt;
    if (!this.blocked(world, nx, b.y, b.z, b.yaw, l, r)) b.x = nx; else b.vx = 0;
    const nz = b.z + b.vz * dt;
    if (!this.blocked(world, b.x, b.y, nz, b.yaw, l, r)) b.z = nz; else b.vz = 0;
  }

  /** it26 (MC): current of the water the boat floats in (horizontal, normalised), or {0,0}. */
  currentAt(world: World, b: Boat, surface: number | null): { x: number; z: number } {
    if (surface == null) return { x: 0, z: 0 };
    return flowAt((x, y, z) => world.getBlock(x, y, z), (x, y, z) => world.getWaterLevel(x, y, z),
      Math.floor(b.x), Math.floor(surface - 0.05), Math.floor(b.z));
  }

  update(dt: number, world: World, player: PlayerState, wishX: number, wishZ: number, inputForward: boolean): void {
    for (const b of this.boats) {
      if (b.dmg) b.dmg = Math.max(0, b.dmg - dt * 0.25); // damage wears off if you stop hitting
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
        // it26 (MC): the current carries the boat too (adds to rowing)
        const cur = this.currentAt(world, b, surface);
        b.vx += (tx + cur.x * WATER_PUSH - b.vx) * Math.min(1, 3 * dt);
        b.vz += (tz + cur.z * WATER_PUSH - b.vz) * Math.min(1, 3 * dt);
        this.move(world, b, dt);
        player.x = b.x; player.y = b.y + 0.55; player.z = b.z;
        player.vx = player.vz = 0; player.vy = 0;
        player.onGround = true;
      } else {
        const cur = this.currentAt(world, b, surface);
        if (cur.x || cur.z) {
          // it26 (MC): an empty boat drifts with flowing water (≈ 1.4 b/s), like items and mobs
          b.vx += (cur.x * WATER_PUSH - b.vx) * Math.min(1, 3 * dt);
          b.vz += (cur.z * WATER_PUSH - b.vz) * Math.min(1, 3 * dt);
        } else { b.vx *= 0.9; b.vz *= 0.9; }
        this.move(world, b, dt);
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

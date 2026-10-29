import { isSolid } from '../blocks/types';
import type { World } from '../world/world';

export const PLAYER_WIDTH = 0.6;
export const PLAYER_HEIGHT = 1.8;
export const EYE_HEIGHT = 1.62;
export const SNEAK_HEIGHT = 1.5;

export interface PlayerState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  pitch: number;
  onGround: boolean;
  sneaking: boolean;
  sprinting: boolean;
}

export function createPlayer(x: number, y: number, z: number): PlayerState {
  return {
    x,
    y,
    z,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: 0,
    pitch: 0,
    onGround: false,
    sneaking: false,
    sprinting: false,
  };
}

function collidesAt(world: World, x: number, y: number, z: number, h: number): boolean {
  const hw = PLAYER_WIDTH / 2;
  const minX = Math.floor(x - hw);
  const maxX = Math.floor(x + hw);
  const minY = Math.floor(y);
  const maxY = Math.floor(y + h - 0.001);
  const minZ = Math.floor(z - hw);
  const maxZ = Math.floor(z + hw);
  for (let by = minY; by <= maxY; by++) {
    for (let bz = minZ; bz <= maxZ; bz++) {
      for (let bx = minX; bx <= maxX; bx++) {
        if (isSolid(world.getBlock(bx, by, bz))) return true;
      }
    }
  }
  return false;
}

export function movePlayer(
  p: PlayerState,
  world: World,
  wishX: number,
  wishZ: number,
  jump: boolean,
  dt: number,
): void {
  const h = p.sneaking ? SNEAK_HEIGHT : PLAYER_HEIGHT;
  const speed = p.sneaking ? 1.3 : p.sprinting ? 5.6 : 4.3;
  const gravity = 28;
  const jumpVel = 8.5;

  const sin = Math.sin(p.yaw);
  const cos = Math.cos(p.yaw);
  // wishX = strafe, wishZ = forward (negative = forward in our input)
  const fx = wishX * cos - wishZ * sin;
  const fz = wishX * sin + wishZ * cos;
  const len = Math.hypot(fx, fz);
  let mx = 0;
  let mz = 0;
  if (len > 0.001) {
    mx = (fx / len) * speed;
    mz = (fz / len) * speed;
  }

  p.vx = mx;
  p.vz = mz;
  p.vy -= gravity * dt;
  if (jump && p.onGround) {
    p.vy = jumpVel;
    p.onGround = false;
  }

  // X
  p.x += p.vx * dt;
  if (collidesAt(world, p.x, p.y, p.z, h)) {
    p.x -= p.vx * dt;
    p.vx = 0;
  }

  // Z
  p.z += p.vz * dt;
  if (collidesAt(world, p.x, p.y, p.z, h)) {
    p.z -= p.vz * dt;
    p.vz = 0;
  }

  // Y
  const prevY = p.y;
  p.y += p.vy * dt;
  p.onGround = false;
  if (collidesAt(world, p.x, p.y, p.z, h)) {
    if (p.vy <= 0) {
      // Land: binary search contact from prevY down
      let lo = p.y;
      let hi = prevY;
      for (let i = 0; i < 12; i++) {
        const mid = (lo + hi) / 2;
        if (collidesAt(world, p.x, mid, p.z, h)) lo = mid;
        else hi = mid;
      }
      p.y = hi;
      // Nudge up out of any residual collision
      let guard = 0;
      while (collidesAt(world, p.x, p.y, p.z, h) && guard++ < 20) p.y += 0.01;
      p.vy = 0;
      p.onGround = true;
    } else {
      p.y = prevY;
      p.vy = 0;
    }
  }

  p.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, p.pitch));
}

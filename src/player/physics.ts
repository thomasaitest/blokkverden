import { BlockId, collidesBlock } from '../blocks/types';
import type { World } from '../world/world';

export const PLAYER_WIDTH = 0.6;
export const PLAYER_HEIGHT = 1.8;
export const EYE_HEIGHT = 1.62;
export const SNEAK_HEIGHT = 1.5;
const STEP_HEIGHT = 1.05;

export interface PlayerState {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  yaw: number; pitch: number;
  onGround: boolean;
  sneaking: boolean;
  sprinting: boolean;
  health: number;
  hunger: number;
  fallStartY: number | null;
  inWater: boolean;
  air: number; // 0–20
  creative: boolean;
  flying: boolean;
}

export interface MoveResult {
  fallDamage: number;
}

export function createPlayer(x: number, y: number, z: number): PlayerState {
  return {
    x, y, z, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0,
    onGround: false, sneaking: false, sprinting: false,
    health: 20, hunger: 20, fallStartY: null, inWater: false, air: 20, creative: false, flying: false,
  };
}

function collidesAt(world: World, x: number, y: number, z: number, h: number): boolean {
  const hw = PLAYER_WIDTH / 2;
  const minXf = x - hw, maxXf = x + hw;
  const minYf = y, maxYf = y + h - 0.001;
  const minZf = z - hw, maxZf = z + hw;
  const minX = Math.floor(minXf), maxX = Math.floor(maxXf);
  const minY = Math.floor(minYf), maxY = Math.floor(maxYf);
  const minZ = Math.floor(minZf), maxZ = Math.floor(maxZf);
  for (let by = minY; by <= maxY; by++) {
    for (let bz = minZ; bz <= maxZ; bz++) {
      for (let bx = minX; bx <= maxX; bx++) {
        const id = world.getBlock(bx, by, bz);
        const meta = world.getWaterLevel(bx, by, bz);
        if (collidesBlock(id, bx, by, bz, minXf, minYf, maxXf, maxYf, minZf, maxZf, meta)) return true;
      }
    }
  }
  return false;
}

function waterAt(world: World, x: number, y: number, z: number): boolean {
  return world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)) === BlockId.Water;
}

function tryAxis(world: World, p: PlayerState, h: number, axis: 'x' | 'z', delta: number): void {
  if (Math.abs(delta) < 1e-8) return;
  if (axis === 'x') p.x += delta;
  else p.z += delta;
  if (!collidesAt(world, p.x, p.y, p.z, h)) return;
  if (p.onGround || p.vy <= 0.01 || p.inWater) {
    for (let step = 0.05; step <= STEP_HEIGHT; step += 0.05) {
      if (!collidesAt(world, p.x, p.y + step, p.z, h) && collidesAt(world, p.x, p.y + step - 0.1, p.z, h)) {
        p.y += step;
        p.y = Math.round(p.y * 1000) / 1000;
        return;
      }
    }
  }
  if (axis === 'x') { p.x -= delta; p.vx = 0; }
  else { p.z -= delta; p.vz = 0; }
}

export function movePlayer(
  p: PlayerState,
  world: World,
  wishX: number,
  wishZ: number,
  jump: boolean,
  dt: number,
): MoveResult {
  const h = p.sneaking ? SNEAK_HEIGHT : PLAYER_HEIGHT;
  let fallDamage = 0;

  const feetWater = waterAt(world, p.x, p.y + 0.4, p.z);
  const headWater = waterAt(world, p.x, p.y + EYE_HEIGHT, p.z);
  p.inWater = feetWater || waterAt(world, p.x, p.y + 1.0, p.z);
  const onLadder = world.getBlock(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)) === BlockId.Ladder
    || world.getBlock(Math.floor(p.x), Math.floor(p.y + 1), Math.floor(p.z)) === BlockId.Ladder;

  if (onLadder && !p.flying) {
    p.vy = jump ? 4.2 : (p.sneaking ? -3.5 : -0.6);
    const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
    // Match camera/raycast forward (-sin,-cos): wishZ=-1 is forward
    p.vx = (wishX * cos + wishZ * sin) * 2.5;
    p.vz = (-wishX * sin + wishZ * cos) * 2.5;
    tryAxis(world, p, h, 'x', p.vx * dt);
    tryAxis(world, p, h, 'z', p.vz * dt);
    p.y += p.vy * dt;
    if (collidesAt(world, p.x, p.y, p.z, h)) { p.y -= p.vy * dt; p.vy = 0; }
    p.onGround = false;
    return { fallDamage: 0 };
  }

  if (p.creative && p.flying) {
    const flySpeed = p.sprinting ? 12 : 6.5;
    const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
    p.vx = (wishX * cos + wishZ * sin) * flySpeed;
    p.vz = (-wishX * sin + wishZ * cos) * flySpeed;
    p.vy = 0;
    if (jump) p.vy = flySpeed;
    if (p.sneaking) p.vy = -flySpeed;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    p.onGround = false;
    return { fallDamage: 0 };
  }
  const speed = p.inWater
    ? (p.sprinting ? 2.4 : 1.8)
    : p.sneaking ? 1.3 : p.sprinting ? 5.612 : 4.317;
  const gravity = p.inWater ? 5 : 32;
  const jumpVel = p.inWater ? 4.2 : 9.0;

  const sin = Math.sin(p.yaw);
  const cos = Math.cos(p.yaw);
  const fx = wishX * cos + wishZ * sin;
  const fz = -wishX * sin + wishZ * cos;
  const len = Math.hypot(fx, fz);
  let mx = 0, mz = 0;
  if (len > 0.001) {
    mx = (fx / len) * speed;
    mz = (fz / len) * speed;
  }
  p.vx = mx;
  p.vz = mz;
  p.vy -= gravity * dt;
  if (p.inWater) p.vy *= 0.9;
  if (jump && (p.onGround || p.inWater)) {
    p.vy = jumpVel;
    p.onGround = false;
    if (!p.inWater) p.fallStartY = p.y;
  }
  if (!p.onGround && p.fallStartY == null && !p.inWater) p.fallStartY = p.y;
  if (p.inWater) p.fallStartY = null;

  // Air / drowning
  if (headWater) {
    p.air = Math.max(0, p.air - dt * 2.5);
    if (p.air <= 0) p.health = Math.max(0, p.health - dt * 2);
  } else {
    p.air = Math.min(20, p.air + dt * 8);
  }

  tryAxis(world, p, h, 'x', p.vx * dt);
  tryAxis(world, p, h, 'z', p.vz * dt);

  const prevY = p.y;
  p.y += p.vy * dt;
  const wasGround = p.onGround;
  p.onGround = false;

  if (collidesAt(world, p.x, p.y, p.z, h)) {
    if (p.vy <= 0) {
      let lo = Math.min(prevY, p.y);
      let hi = Math.max(prevY, p.y);
      for (let i = 0; i < 16; i++) {
        const mid = (lo + hi) / 2;
        if (collidesAt(world, p.x, mid, p.z, h)) hi = mid;
        else lo = mid;
      }
      p.y = lo;
      let guard = 0;
      while (collidesAt(world, p.x, p.y, p.z, h) && guard++ < 40) p.y += 0.005;
      p.y = Math.round(p.y * 200) / 200;
      const fallDist = p.fallStartY != null ? p.fallStartY - p.y : 0;
      p.vy = 0;
      p.onGround = true;
      p.fallStartY = null;
      if (fallDist > 3.5 && !wasGround && !p.inWater) {
        fallDamage = Math.min(20, Math.floor(fallDist - 3));
      }
    } else {
      p.y = prevY;
      p.vy = 0;
    }
  }

  p.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, p.pitch));
  return { fallDamage };
}

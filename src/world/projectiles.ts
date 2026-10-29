import { isSolid } from '../blocks/types';
import type { World } from './world';
import type { MobSystem } from '../mobs/system';
import type { SoundBus } from '../audio/sound';

export interface Projectile {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  dmg: number;
  age: number;
  kind: 'arrow';
}

export class ProjectileSystem {
  list: Projectile[] = [];

  shoot(x: number, y: number, z: number, yaw: number, pitch: number, speed: number, dmg: number): void {
    const cosP = Math.cos(pitch);
    this.list.push({
      x, y, z,
      vx: -Math.sin(yaw) * cosP * speed,
      vy: Math.sin(pitch) * speed,
      vz: -Math.cos(yaw) * cosP * speed,
      dmg, age: 0, kind: 'arrow',
    });
  }

  update(dt: number, world: World, mobs: MobSystem, sound: SoundBus): void {
    const keep: Projectile[] = [];
    for (const p of this.list) {
      p.age += dt;
      p.vy -= 16 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.age > 8) continue;
      if (isSolid(world.getBlock(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)))) continue;
      let hit = false;
      for (const m of mobs.mobs) {
        if (Math.hypot(p.x - m.x, p.y - (m.y + m.height * 0.5), p.z - m.z) < Math.max(m.width, 0.5)) {
          mobs.hurtMob(m, p.dmg, p.vx, p.vz);
          sound.mobHit();
          hit = true;
          break;
        }
      }
      if (!hit) keep.push(p);
    }
    this.list = keep;
  }
}

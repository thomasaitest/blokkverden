import { isSolid, BlockId } from '../blocks/types';
import type { World } from '../world/world';
import type { PlayerState } from '../player/physics';
import { MOB_DEFS, type Mob, type MobKind } from './types';
import type { DropSystem } from '../world/drops';
import { ItemId, stack } from '../items/types';
import type { SoundBus } from '../audio/sound';
import type { XpSystem } from '../world/xp';

function collides(world: World, x: number, y: number, z: number, w: number, h: number): boolean {
  const hw = w / 2;
  const x0 = Math.floor(x - hw), x1 = Math.floor(x + hw);
  const y0 = Math.floor(y), y1 = Math.floor(y + h - 0.01);
  const z0 = Math.floor(z - hw), z1 = Math.floor(z + hw);
  for (let by = y0; by <= y1; by++)
    for (let bz = z0; bz <= z1; bz++)
      for (let bx = x0; bx <= x1; bx++)
        if (isSolid(world.getBlock(bx, by, bz))) return true;
  return false;
}

function feetWater(world: World, x: number, y: number, z: number): boolean {
  return world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)) === BlockId.Water
    || world.getBlock(Math.floor(x), Math.floor(y - 0.1), Math.floor(z)) === BlockId.Water;
}

function cliffAhead(world: World, x: number, y: number, z: number, dx: number, dz: number): boolean {
  const nx = x + dx * 0.8, nz = z + dz * 0.8;
  // Drop > 2 blocks = cliff
  let ground = -1;
  for (let yy = Math.floor(y + 1); yy >= Math.floor(y) - 3; yy--) {
    if (isSolid(world.getBlock(Math.floor(nx), yy, Math.floor(nz)))) { ground = yy; break; }
  }
  if (ground < 0) return true;
  return y - (ground + 1) > 2.2;
}

export class MobSystem {
  mobs: Mob[] = [];
  nextId = 1;
  spawnCool = 0;

  clear(): void { this.mobs = []; }

  spawn(kind: MobKind, x: number, y: number, z: number): Mob {
    const d = MOB_DEFS[kind];
    const m: Mob = {
      id: this.nextId++, kind, x, y, z,
      yaw: Math.random() * Math.PI * 2,
      vx: 0, vy: 0, vz: 0,
      hp: d.hp, maxHp: d.hp, hostile: d.hostile,
      age: 0, attackCool: 1, fuse: 0, onGround: false,
      width: d.w, height: d.h, color: d.color,
    };
    this.mobs.push(m);
    return m;
  }

  private surfaceY(world: World, x: number, z: number): number {
    for (let y = 70; y > 0; y--) {
      const id = world.getBlock(Math.floor(x), y, Math.floor(z));
      if (isSolid(id) && world.getBlock(Math.floor(x), y + 1, Math.floor(z)) === BlockId.Air
          && world.getBlock(Math.floor(x), y + 1, Math.floor(z)) !== BlockId.Water) {
        if (world.getBlock(Math.floor(x), y + 1, Math.floor(z)) === BlockId.Water) continue;
        // skip underwater surfaces
        let submerged = false;
        for (let yy = y + 1; yy <= y + 3; yy++) {
          if (world.getBlock(Math.floor(x), yy, Math.floor(z)) === BlockId.Water) submerged = true;
        }
        if (submerged) continue;
        return y + 1;
      }
    }
    return 40;
  }

  trySpawn(world: World, player: PlayerState, dayTime: number, dt: number): void {
    this.spawnCool -= dt;
    if (this.spawnCool > 0) return;
    this.spawnCool = 3;
    const night = dayTime < 0.2 || dayTime > 0.78;
    const passive = this.mobs.filter((m) => !m.hostile).length;
    const hostile = this.mobs.filter((m) => m.hostile).length;
    if (passive < 8) {
      const ang = Math.random() * Math.PI * 2;
      const dist = 14 + Math.random() * 16;
      const x = player.x + Math.cos(ang) * dist;
      const z = player.z + Math.sin(ang) * dist;
      const kinds: MobKind[] = ['gris', 'ku', 'sau', 'høne'];
      const kind = kinds[(Math.random() * kinds.length) | 0];
      const y = this.surfaceY(world, x, z);
      if (y > 2) this.spawn(kind, x, y, z);
    }
    if (night && hostile < 10) {
      const ang = Math.random() * Math.PI * 2;
      const dist = 16 + Math.random() * 18;
      const x = player.x + Math.cos(ang) * dist;
      const z = player.z + Math.sin(ang) * dist;
      const kinds: MobKind[] = ['vandrer', 'bueskytt', 'vever', 'knallbolle'];
      const kind = kinds[(Math.random() * kinds.length) | 0];
      const y = this.surfaceY(world, x, z);
      if (y > 2 && world.getLight(Math.floor(x), y, Math.floor(z)) < 8) {
        this.spawn(kind, x, y, z);
      }
    }
    this.mobs = this.mobs.filter((m) => {
      const d = Math.hypot(m.x - player.x, m.z - player.z);
      if (d > 72) return false;
      if (m.hostile && !night && world.getLight(Math.floor(m.x), Math.floor(m.y + 1), Math.floor(m.z)) > 11) {
        m.hp -= dt * 4;
      }
      return m.hp > 0;
    });
  }

  update(
    world: World, player: PlayerState, dt: number, drops: DropSystem, sound: SoundBus,
    onPlayerHurt: (dmg: number, kx: number, kz: number) => void,
    xp?: XpSystem,
  ): void {
    for (const m of this.mobs) {
      m.age += dt;
      m.attackCool -= dt;
      const def = MOB_DEFS[m.kind];
      let tx = 0, tz = 0;
      const distP = Math.hypot(m.x - player.x, m.z - player.z);

      if (m.hostile) {
        if (distP < 24) {
          tx = player.x - m.x;
          tz = player.z - player.z;
          tz = player.z - m.z;
          m.yaw = Math.atan2(tx, tz);
        }
        if (m.kind === 'knallbolle' && distP < 3.5) {
          m.fuse += dt;
          if (m.fuse > 1.4) {
            sound.explode();
            if (distP < 5) onPlayerHurt(12 * (1 - distP / 5), tx, tz);
            for (let dy = -1; dy <= 2; dy++)
              for (let dx = -2; dx <= 2; dx++)
                for (let dz = -2; dz <= 2; dz++) {
                  if (dx * dx + dy * dy + dz * dz > 6) continue;
                  const bx = Math.floor(m.x + dx), by = Math.floor(m.y + dy), bz = Math.floor(m.z + dz);
                  const id = world.getBlock(bx, by, bz);
                  if (id !== BlockId.Air && id !== BlockId.Water && id !== BlockId.Stone && id !== BlockId.Cobble && id !== BlockId.CoalOre) {
                    world.setBlock(bx, by, bz, BlockId.Air);
                  }
                }
            m.hp = 0;
            continue;
          }
        } else if (m.kind !== 'knallbolle') {
          m.fuse = 0;
        }
        if (m.kind === 'bueskytt' && distP < 14 && distP > 4 && m.attackCool <= 0) {
          m.attackCool = 1.6;
          if (Math.random() < 0.55) { onPlayerHurt(3, tx, tz); sound.bow(); }
        } else if (distP < 1.4 && m.attackCool <= 0 && m.kind !== 'bueskytt') {
          m.attackCool = 1.0;
          onPlayerHurt(m.kind === 'vever' ? 3 : 4, tx, tz);
          sound.mobHit();
        }
      } else {
        if ((m.age * 3 | 0) % 7 === 0 && Math.random() < 0.02) m.yaw = Math.random() * Math.PI * 2;
        tx = Math.sin(m.yaw);
        tz = Math.cos(m.yaw);
        if (distP < 2.5) { tx = m.x - player.x; tz = m.z - player.z; }
      }

      const len = Math.hypot(tx, tz) || 1;
      let ndx = tx / len, ndz = tz / len;
      // Avoid water & cliffs
      if (feetWater(world, m.x + ndx, m.y, m.z + ndz) || cliffAhead(world, m.x, m.y, m.z, ndx, ndz)) {
        m.yaw += Math.PI / 2 + (Math.random() - 0.5);
        ndx = Math.sin(m.yaw); ndz = Math.cos(m.yaw);
      }
      const speed = def.speed * (m.fuse > 0 ? 0.35 : 1) * (feetWater(world, m.x, m.y, m.z) ? 0.4 : 1);
      m.vx = ndx * speed;
      m.vz = ndz * speed;
      m.vy -= 28 * dt;

      // Move X with step-up
      const ox = m.x;
      m.x += m.vx * dt;
      if (collides(world, m.x, m.y, m.z, m.width, m.height)) {
        let stepped = false;
        if (m.onGround) {
          for (let step = 0.1; step <= 1.05; step += 0.1) {
            if (!collides(world, m.x, m.y + step, m.z, m.width, m.height)) {
              m.y += step; stepped = true; break;
            }
          }
        }
        if (!stepped) { m.x = ox; m.yaw += Math.PI / 2; }
      }
      const oz = m.z;
      m.z += m.vz * dt;
      if (collides(world, m.x, m.y, m.z, m.width, m.height)) {
        let stepped = false;
        if (m.onGround) {
          for (let step = 0.1; step <= 1.05; step += 0.1) {
            if (!collides(world, m.x, m.y + step, m.z, m.width, m.height)) {
              m.y += step; stepped = true; break;
            }
          }
        }
        if (!stepped) { m.z = oz; m.yaw += Math.PI / 2; }
      }
      m.y += m.vy * dt;
      m.onGround = false;
      if (collides(world, m.x, m.y, m.z, m.width, m.height)) {
        if (m.vy <= 0) {
          m.y = Math.ceil(m.y - m.vy * dt);
          let g = 0;
          while (collides(world, m.x, m.y, m.z, m.width, m.height) && g++ < 20) m.y += 0.05;
          m.vy = 0; m.onGround = true;
        } else { m.y -= m.vy * dt; m.vy = 0; }
      }
      if (m.hostile && m.onGround && distP < 16 && Math.random() < 0.015) m.vy = 7.5;
    }

    const keep: Mob[] = [];
    for (const m of this.mobs) {
      if (m.hp <= 0) {
        if (m.deathT == null) {
          m.deathT = 0.01;
          this.dropLoot(m, drops);
          xp?.spawn(m.x, m.y + 0.5, m.z, m.hostile ? 5 : 2);
        } else {
          m.deathT += dt;
        }
        if (m.deathT < 0.45) keep.push(m);
        continue;
      }
      if (m.hurtFlash && m.hurtFlash > 0) m.hurtFlash -= dt;
      keep.push(m);
    }
    this.mobs = keep;
  }

  private dropLoot(m: Mob, drops: DropSystem): void {
    const x = Math.floor(m.x), y = Math.floor(m.y), z = Math.floor(m.z);
    if (m.kind === 'gris') drops.spawn(x, y, z, stack(ItemId.RawMeat, 1));
    if (m.kind === 'ku') drops.spawn(x, y, z, stack(ItemId.Leather, 1));
    if (m.kind === 'sau') drops.spawn(x, y, z, stack(ItemId.WoolItem, 1));
    if (m.kind === 'høne') drops.spawn(x, y, z, stack(ItemId.Feather, 1));
    if (m.hostile) drops.spawn(x, y, z, stack(ItemId.Coal, 1));
  }

  hurtMob(m: Mob, dmg: number, kx: number, kz: number): void {
    m.hp -= dmg;
    m.hurtFlash = 0.25;
    const len = Math.hypot(kx, kz) || 1;
    m.vx += (kx / len) * 8;
    m.vz += (kz / len) * 8;
    m.vy += 4;
  }

  hitAt(x: number, y: number, z: number, reach: number, yaw: number, pitch: number, dmg: number, sound: SoundBus): boolean {
    const cosP = Math.cos(pitch);
    const dx = -Math.sin(yaw) * cosP;
    const dy = Math.sin(pitch);
    const dz = -Math.cos(yaw) * cosP;
    for (const m of this.mobs) {
      const mx = m.x - x, my = m.y + m.height * 0.5 - y, mz = m.z - z;
      const t = mx * dx + my * dy + mz * dz;
      if (t < 0 || t > reach) continue;
      const px = x + dx * t, py = y + dy * t, pz = z + dz * t;
      if (Math.hypot(px - m.x, py - (m.y + m.height * 0.5), pz - m.z) < Math.max(m.width, m.height) * 0.75) {
        this.hurtMob(m, dmg, dx, dz);
        sound.mobHit();
        return true;
      }
    }
    return false;
  }
}

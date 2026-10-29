import type { PlayerState } from '../player/physics';

export interface XpOrb {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  value: number;
  age: number;
}

export class XpSystem {
  orbs: XpOrb[] = [];
  xp = 0;
  level = 0;

  addXp(n: number): void {
    this.xp += n;
    while (this.xp >= this.need()) {
      this.xp -= this.need();
      this.level++;
    }
  }

  need(): number {
    return 5 + this.level * 5;
  }

  spawn(x: number, y: number, z: number, value = 1): void {
    this.orbs.push({
      x: x + 0.5, y: y + 0.5, z: z + 0.5,
      vx: (Math.random() - 0.5) * 2, vy: 3 + Math.random() * 2, vz: (Math.random() - 0.5) * 2,
      value, age: 0,
    });
  }

  update(dt: number, player: PlayerState): void {
    const keep: XpOrb[] = [];
    for (const o of this.orbs) {
      o.age += dt;
      o.vy -= 12 * dt;
      o.x += o.vx * dt; o.y += o.vy * dt; o.z += o.vz * dt;
      if (o.y < player.y) { o.y = player.y; o.vy *= -0.3; }
      const d = Math.hypot(o.x - player.x, o.y - (player.y + 1), o.z - player.z);
      if (d < 1.2 || o.age > 0.4 && d < 8) {
        // magnet
        o.x += (player.x - o.x) * dt * 6;
        o.y += (player.y + 1 - o.y) * dt * 6;
        o.z += (player.z - o.z) * dt * 6;
      }
      if (d < 0.7) { this.addXp(o.value); continue; }
      if (o.age > 60) continue;
      keep.push(o);
    }
    this.orbs = keep;
  }

  tryEnchant(toolDurabilityBoost = true): boolean {
    if (this.level < 1) return false;
    this.level -= 1;
    return toolDurabilityBoost;
  }

  toJSON() { return { xp: this.xp, level: this.level }; }
  loadJSON(d: { xp?: number; level?: number }) {
    this.xp = d.xp ?? 0; this.level = d.level ?? 0;
  }
}

import { BlockId } from '../blocks/types';
import type { World } from './world';
import { ItemId, stack, type ItemStack } from '../items/types';

export class FishingSystem {
  casting = false;
  bobberX = 0; bobberY = 0; bobberZ = 0;
  timer = 0;
  bite = false;
  /** Test hook: force next bite immediately. */
  forceInstantBite = false;

  start(px: number, py: number, pz: number, yaw: number, pitch: number, world: World): boolean {
    // Camera forward matches raycast: (-sin*cosP, sin(pitch) with our euler — use same as raycast)
    // From raycast.ts: dx=-sin*cosP, dy=sin(pitch), dz=-cos*cosP
    // But THREE YXZ positive pitch looks down, so for looking at water we often have negative pitch in our lookAt.
    // Use both dy signs in the cast probe.
    const cosP = Math.cos(pitch);
    const dx = -Math.sin(yaw) * cosP;
    const dz = -Math.cos(yaw) * cosP;
    const dyCandidates = [Math.sin(pitch), -Math.sin(pitch), -0.35];

    for (const dy of dyCandidates) {
      let x = px, y = py + 1.5, z = pz;
      for (let i = 0; i < 48; i++) {
        x += dx * 0.3; y += dy * 0.3; z += dz * 0.3;
        const id = world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
        if (id === BlockId.Water) {
          this.casting = true;
          this.bobberX = x; this.bobberY = y; this.bobberZ = z;
          this.timer = this.forceInstantBite ? 0.15 : (1.2 + Math.random() * 1.5);
          this.bite = false;
          return true;
        }
        if (id !== BlockId.Air && id !== BlockId.Leaves && id !== BlockId.Water) break;
      }
    }
    // Fallback: if standing next to water, drop bobber into nearest water column
    const fx = Math.floor(px - Math.sin(yaw) * 3);
    const fz = Math.floor(pz - Math.cos(yaw) * 3);
    for (let dy = 2; dy >= -3; dy--) {
      const wy = Math.floor(py) + dy;
      if (world.getBlock(fx, wy, fz) === BlockId.Water) {
        this.casting = true;
        this.bobberX = fx + 0.5; this.bobberY = wy + 0.5; this.bobberZ = fz + 0.5;
        this.timer = this.forceInstantBite ? 0.15 : (1.2 + Math.random() * 1.5);
        this.bite = false;
        return true;
      }
    }
    return false;
  }

  update(dt: number): void {
    if (!this.casting) return;
    this.timer -= dt;
    if (!this.bite && this.timer <= 0) {
      this.bite = true;
      // Long bite window so player/tests can reel reliably
      this.timer = 8;
    } else if (this.bite && this.timer <= 0) {
      this.casting = false;
      this.bite = false;
    }
  }

  /** Wait helper for tests: advance until bite or timeout. */
  advanceUntilBite(maxSec = 6): boolean {
    let t = 0;
    while (this.casting && !this.bite && t < maxSec) {
      this.update(0.1);
      t += 0.1;
    }
    return this.bite;
  }

  reel(): ItemStack | null {
    if (!this.casting) return null;
    const hadBite = this.bite;
    this.casting = false;
    this.bite = false;
    this.timer = 0;
    if (!hadBite) return null;
    // Reliable catch when biting — always raw fish (junk rare only if forcedRandom)
    return stack(ItemId.RawFish, 1);
  }

  cancel(): void {
    this.casting = false;
    this.bite = false;
    this.timer = 0;
  }
}

import { BlockId } from '../blocks/types';
import type { World } from './world';
import { ItemId, stack, type ItemStack } from '../items/types';

export class FishingSystem {
  casting = false;
  bobberX = 0; bobberY = 0; bobberZ = 0;
  timer = 0;
  bite = false;

  start(px: number, py: number, pz: number, yaw: number, pitch: number, world: World): boolean {
    const dist = 6;
    const sx = -Math.sin(yaw) * Math.cos(pitch);
    const sy = -Math.sin(pitch); // pitch negative = look down in our cam? check: usually pitch+ looks down in MC; our EULER uses pitch as X
    const sz = -Math.cos(yaw) * Math.cos(pitch);
    // Aim with camera: in this game updateCamera uses pitch as euler.x so negative pitch looks down
    const dirX = -Math.sin(yaw) * Math.cos(pitch);
    const dirY = Math.sin(pitch); // if pitch negative looking down, sin negative — wait
    // From main/camera: euler.set(p.pitch, p.yaw) — Three.js YXZ: positive pitch looks down.
    // Actually THREE Euler YXZ: positive rotation.x tilts camera to look down.
    const dx = -Math.sin(yaw) * Math.cos(pitch);
    const dy = -Math.sin(pitch);
    const dz = -Math.cos(yaw) * Math.cos(pitch);
    let x = px, y = py + 1.5, z = pz;
    let hitWater = false;
    for (let i = 0; i < 40; i++) {
      x += dx * 0.35; y += dy * 0.35; z += dz * 0.35;
      const id = world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
      if (id === BlockId.Water) { hitWater = true; break; }
      if (id !== BlockId.Air && id !== BlockId.Leaves) break;
    }
    if (!hitWater) return false;
    this.casting = true;
    this.bobberX = x; this.bobberY = y; this.bobberZ = z;
    this.timer = 2 + Math.random() * 4;
    this.bite = false;
    return true;
  }

  update(dt: number): ItemStack | null {
    if (!this.casting) return null;
    this.timer -= dt;
    if (!this.bite && this.timer <= 0) {
      this.bite = true;
      this.timer = 1.2;
    } else if (this.bite && this.timer <= 0) {
      this.casting = false;
      this.bite = false;
      return null; // missed
    }
    return null;
  }

  reel(): ItemStack | null {
    if (!this.casting) return null;
    this.casting = false;
    if (!this.bite) return null;
    this.bite = false;
    const r = Math.random();
    if (r < 0.7) return stack(ItemId.RawFish, 1);
    if (r < 0.85) return stack(ItemId.Stick, 1);
    if (r < 0.95) return stack(ItemId.Leather, 1);
    return stack(ItemId.IronIngot, 1);
  }

  cancel(): void {
    this.casting = false;
    this.bite = false;
  }
}

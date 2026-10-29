import type { ItemStack } from '../items/types';
import { createFurnace, tickFurnace, type FurnaceState } from '../items/furnace';

export function posKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

export class ContainerStore {
  chests = new Map<string, (ItemStack | null)[]>();
  furnaces = new Map<string, FurnaceState>();

  getChest(x: number, y: number, z: number): (ItemStack | null)[] {
    const k = posKey(x, y, z);
    let s = this.chests.get(k);
    if (!s) {
      s = Array.from({ length: 27 }, () => null);
      this.chests.set(k, s);
    }
    return s;
  }

  getFurnace(x: number, y: number, z: number): FurnaceState {
    const k = posKey(x, y, z);
    let f = this.furnaces.get(k);
    if (!f) {
      f = createFurnace();
      this.furnaces.set(k, f);
    }
    return f;
  }

  removeAt(x: number, y: number, z: number): void {
    const k = posKey(x, y, z);
    this.chests.delete(k);
    this.furnaces.delete(k);
  }

  tick(dt: number): void {
    for (const f of this.furnaces.values()) tickFurnace(f, dt);
  }

  toJSON() {
    return {
      chests: [...this.chests.entries()].map(([k, v]) => ({ k, slots: v })),
      furnaces: [...this.furnaces.entries()].map(([k, v]) => ({ k, ...v })),
    };
  }

  loadJSON(data: {
    chests?: { k: string; slots: (ItemStack | null)[] }[];
    furnaces?: ({ k: string } & FurnaceState)[];
  }): void {
    this.chests.clear();
    this.furnaces.clear();
    for (const c of data.chests ?? []) {
      this.chests.set(c.k, c.slots.map((s) => (s ? { ...s } : null)));
    }
    for (const f of data.furnaces ?? []) {
      const { k, ...rest } = f;
      this.furnaces.set(k, { ...rest, input: rest.input ? { ...rest.input } : null, fuel: rest.fuel ? { ...rest.fuel } : null, output: rest.output ? { ...rest.output } : null });
    }
  }
}

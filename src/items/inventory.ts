import { ItemId, ITEMS, stack, type ItemStack } from './types';

export const INV_SIZE = 36; // 0-8 hotbar, 9-35 main

export class Inventory {
  slots: (ItemStack | null)[] = Array.from({ length: INV_SIZE }, () => null);
  selected = 0;

  hotbar(): (ItemStack | null)[] {
    return this.slots.slice(0, 9);
  }

  held(): ItemStack | null {
    return this.slots[this.selected];
  }

  setHeld(s: ItemStack | null): void {
    this.slots[this.selected] = s;
  }

  /** Add items; returns leftover count. */
  add(item: ItemStack): number {
    const def = ITEMS[item.id];
    if (!def) return item.count;
    let left = item.count;
    if (def.stackable) {
      for (let i = 0; i < INV_SIZE && left > 0; i++) {
        const s = this.slots[i];
        if (s && s.id === item.id && s.count < def.maxStack) {
          const space = def.maxStack - s.count;
          const n = Math.min(space, left);
          s.count += n;
          left -= n;
        }
      }
    }
    for (let i = 0; i < INV_SIZE && left > 0; i++) {
      if (!this.slots[i]) {
        const n = def.stackable ? Math.min(def.maxStack, left) : 1;
        this.slots[i] = stack(item.id, n, item.durability ?? def.maxDurability);
        left -= n;
        if (!def.stackable) break;
      }
    }
    return left;
  }

  takeOneFromSelected(): ItemStack | null {
    const s = this.slots[this.selected];
    if (!s) return null;
    const def = ITEMS[s.id];
    if (def?.placeBlock == null) return null;
    if (s.count <= 1) {
      this.slots[this.selected] = null;
      return stack(s.id, 1);
    }
    s.count -= 1;
    return stack(s.id, 1);
  }

  swap(a: number, b: number): void {
    const t = this.slots[a];
    this.slots[a] = this.slots[b];
    this.slots[b] = t;
  }

  /** Give starter kit for new worlds. */
  fillStarter(): void {
    this.add(stack(ItemId.Log, 16));
    this.add(stack(ItemId.Planks, 32));
    this.add(stack(ItemId.Cobble, 32));
    this.add(stack(ItemId.Stick, 16));
    this.add(stack(ItemId.Coal, 8));
    this.add(stack(ItemId.Torch, 8));
    this.add(stack(ItemId.Apple, 4));
    this.add(stack(ItemId.CraftingTable, 1));
    this.add(stack(ItemId.Furnace, 1));
    this.add(stack(ItemId.Chest, 1));
  }

  toJSON(): (ItemStack | null)[] {
    return this.slots.map((s) => (s ? { ...s } : null));
  }

  loadJSON(data: (ItemStack | null)[]): void {
    for (let i = 0; i < INV_SIZE; i++) {
      this.slots[i] = data[i] ? { ...data[i]! } : null;
    }
  }
}

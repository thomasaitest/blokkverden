import { ItemId, ITEMS, stack, type ItemStack, type ArmorSlot } from './types';

export const INV_SIZE = 36;

export class Inventory {
  slots: (ItemStack | null)[] = Array.from({ length: INV_SIZE }, () => null);
  /** head, chest, legs, feet */
  armor: (ItemStack | null)[] = [null, null, null, null];
  selected = 0;

  held(): ItemStack | null {
    return this.slots[this.selected];
  }

  setHeld(s: ItemStack | null): void {
    this.slots[this.selected] = s;
  }

  add(item: ItemStack): number {
    const def = ITEMS[item.id];
    if (!def) return item.count;
    let left = item.count;
    if (def.stackable) {
      for (let i = 0; i < INV_SIZE && left > 0; i++) {
        const s = this.slots[i];
        if (s && s.id === item.id && s.count < def.maxStack) {
          const n = Math.min(def.maxStack - s.count, left);
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

  tryEquip(stackIn: ItemStack): ItemStack | null {
    const def = ITEMS[stackIn.id];
    if (!def?.armorSlot) return stackIn;
    const idx = { head: 0, chest: 1, legs: 2, feet: 3 }[def.armorSlot as ArmorSlot];
    const prev = this.armor[idx];
    this.armor[idx] = stack(stackIn.id, 1, stackIn.durability ?? def.maxDurability);
    return prev;
  }

  fillStarter(): void {
    this.add(stack(ItemId.Log, 16));
    this.add(stack(ItemId.Planks, 32));
    this.add(stack(ItemId.Cobble, 32));
    this.add(stack(ItemId.Stick, 16));
    this.add(stack(ItemId.Coal, 8));
    this.add(stack(ItemId.Torch, 16));
    this.add(stack(ItemId.Apple, 8));
    this.add(stack(ItemId.IronSword, 1, 250));
    this.add(stack(ItemId.Bow, 1, 200));
    this.add(stack(ItemId.Arrow, 32));
    this.add(stack(ItemId.Bed, 1));
    this.add(stack(ItemId.CraftingTable, 1));
    this.add(stack(ItemId.Furnace, 1));
    this.add(stack(ItemId.Chest, 1));
    this.add(stack(ItemId.Seeds, 16));
    this.add(stack(ItemId.WoodHoe, 1, 60));
    this.add(stack(ItemId.Boat, 1));
    this.add(stack(ItemId.FishingRod, 1, 64));
    this.add(stack(ItemId.MapItem, 1));
    this.add(stack(ItemId.RedDust, 32));
    this.add(stack(ItemId.Door, 2));
    this.add(stack(ItemId.PortalFrame, 10));
    this.add(stack(ItemId.Bread, 8));
    this.add(stack(ItemId.IronHelmet, 1, 165));
    this.add(stack(ItemId.IronChest, 1, 240));
  }

  toJSON() {
    return { slots: this.slots.map((s) => (s ? { ...s } : null)), armor: this.armor.map((s) => (s ? { ...s } : null)), selected: this.selected };
  }

  loadJSON(data: { slots?: (ItemStack | null)[]; armor?: (ItemStack | null)[]; selected?: number } | (ItemStack | null)[]): void {
    if (Array.isArray(data)) {
      for (let i = 0; i < INV_SIZE; i++) this.slots[i] = data[i] ? { ...data[i]! } : null;
      return;
    }
    for (let i = 0; i < INV_SIZE; i++) this.slots[i] = data.slots?.[i] ? { ...data.slots[i]! } : null;
    for (let i = 0; i < 4; i++) this.armor[i] = data.armor?.[i] ? { ...data.armor[i]! } : null;
    if (data.selected != null) this.selected = data.selected;
  }
}

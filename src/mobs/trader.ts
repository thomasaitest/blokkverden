import * as THREE from 'three';
import { ItemId, stack, type ItemStack } from '../items/types';
import type { Inventory } from '../items/inventory';

/** Original villager-like trader: «Byttebonde». */
export interface Byttebonde {
  x: number; y: number; z: number;
  yaw: number;
  offers: { want: ItemStack; give: ItemStack }[];
}

export function createByttebonde(x: number, y: number, z: number): Byttebonde {
  return {
    x, y, z, yaw: 0,
    offers: [
      { want: stack(ItemId.Wheat, 8), give: stack(ItemId.GoldIngot, 1) },
      { want: stack(ItemId.RawFish, 4), give: stack(ItemId.Bread, 2) },
      { want: stack(ItemId.Cobble, 16), give: stack(ItemId.Torch, 8) },
      { want: stack(ItemId.IronIngot, 3), give: stack(ItemId.IronSword, 1, 250) },
      { want: stack(ItemId.GoldIngot, 2), give: stack(ItemId.MapItem, 1) },
    ],
  };
}

// Emerald may not exist — fix after
export function tryTrade(inv: Inventory, want: ItemStack, give: ItemStack): boolean {
  let have = 0;
  for (const s of inv.slots) if (s && s.id === want.id) have += s.count;
  if (have < want.count) return false;
  let left = want.count;
  for (let i = 0; i < inv.slots.length && left > 0; i++) {
    const s = inv.slots[i];
    if (!s || s.id !== want.id) continue;
    const take = Math.min(s.count, left);
    s.count -= take; left -= take;
    if (s.count <= 0) inv.slots[i] = null;
  }
  inv.add({ id: give.id, count: give.count, durability: give.durability });
  return true;
}

export function createTraderRig(): THREE.Group {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0x5a8f3a });
  const robe = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.0, 0.35), skin);
  robe.position.y = 0.9;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.45, 0.4), new THREE.MeshLambertMaterial({ color: 0xe8c4a0 }));
  head.position.y = 1.55;
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 0.2), new THREE.MeshLambertMaterial({ color: 0xd4a070 }));
  nose.position.set(0, 1.5, 0.22);
  const hat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.5), new THREE.MeshLambertMaterial({ color: 0x3a5a28 }));
  hat.position.y = 1.8;
  g.add(robe, head, nose, hat);
  return g;
}

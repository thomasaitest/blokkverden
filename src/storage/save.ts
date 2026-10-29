import type { PlayerState } from '../player/physics';
import type { World } from '../world/world';
import type { Inventory } from '../items/inventory';
import type { DropSystem } from '../world/drops';
import type { ItemStack } from '../items/types';

const DB_NAME = 'blokkverden';
const STORE = 'worlds';
const KEY = 'default';

export interface SaveData {
  version: 2;
  seed: number;
  player: {
    x: number;
    y: number;
    z: number;
    yaw: number;
    pitch: number;
    health: number;
    hunger: number;
  };
  hotbarSlot: number;
  dayTime: number;
  inventory: (ItemStack | null)[];
  drops: { x: number; y: number; z: number; stack: ItemStack; age: number }[];
  chunks: { cx: number; cz: number; blocks: number[] }[];
  savedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveWorld(
  world: World,
  player: PlayerState,
  inv: Inventory,
  drops: DropSystem,
  dayTime: number,
): Promise<void> {
  const data: SaveData = {
    version: 2,
    seed: world.seed,
    player: {
      x: player.x,
      y: player.y,
      z: player.z,
      yaw: player.yaw,
      pitch: player.pitch,
      health: player.health,
      hunger: player.hunger,
    },
    hotbarSlot: inv.selected,
    dayTime,
    inventory: inv.toJSON(),
    drops: drops.toJSON(),
    chunks: world.serializeModified(),
    savedAt: Date.now(),
  };
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(data, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadWorld(): Promise<SaveData | null> {
  const db = await openDb();
  const data = await new Promise<SaveData | null>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve((req.result as SaveData) ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return data;
}

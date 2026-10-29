import type { PlayerState } from '../player/physics';
import type { World } from '../world/world';
import type { Inventory } from '../items/inventory';
import type { DropSystem } from '../world/drops';
import type { ContainerStore } from '../world/containers';
import type { ItemStack } from '../items/types';
import type { FurnaceState } from '../items/furnace';

const DB_NAME = 'blokkverden';
const STORE = 'worlds';
const KEY = 'default';

export interface SaveData {
  version: 4;
  seed: number;
  player: {
    x: number; y: number; z: number; yaw: number; pitch: number;
    health: number; hunger: number; air: number;
  };
  respawn?: { x: number; y: number; z: number };
  hotbarSlot: number;
  dayTime: number;
  inventory: ReturnType<Inventory['toJSON']>;
  drops: { x: number; y: number; z: number; stack: ItemStack; age: number }[];
  containers: {
    chests: { k: string; slots: (ItemStack | null)[] }[];
    furnaces: ({ k: string } & FurnaceState)[];
  };
  chunks: { cx: number; cz: number; blocks: number[]; waterLevel?: number[] }[];
  savedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 4);
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
  containers: ContainerStore,
  dayTime: number,
  respawn: { x: number; y: number; z: number } | null,
): Promise<void> {
  const data: SaveData = {
    version: 4,
    seed: world.seed,
    player: {
      x: player.x, y: player.y, z: player.z, yaw: player.yaw, pitch: player.pitch,
      health: player.health, hunger: player.hunger, air: player.air,
    },
    respawn: respawn ?? undefined,
    hotbarSlot: inv.selected,
    dayTime,
    inventory: inv.toJSON(),
    drops: drops.toJSON(),
    containers: containers.toJSON(),
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

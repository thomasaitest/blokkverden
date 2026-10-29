import type { PlayerState } from '../player/physics';
import type { World } from '../world/world';
import type { Inventory } from '../items/inventory';
import type { DropSystem } from '../world/drops';
import type { ContainerStore } from '../world/containers';
import type { ItemStack } from '../items/types';
import type { FurnaceState } from '../items/furnace';

const DB_NAME = 'blokkverden';
const STORE = 'worlds';
const META = 'meta';

export interface WorldMeta {
  name: string;
  seed: number;
  savedAt: number;
}

export interface SaveData {
  version: 5;
  name: string;
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
  xp?: { xp: number; level: number };
  savedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 5);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function listWorlds(): Promise<WorldMeta[]> {
  const db = await openDb();
  const list = await new Promise<WorldMeta[]>((resolve, reject) => {
    const tx = db.transaction(META, 'readonly');
    const req = tx.objectStore(META).get('list');
    req.onsuccess = () => resolve((req.result as WorldMeta[]) ?? []);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return list.sort((a, b) => b.savedAt - a.savedAt);
}

async function putMeta(db: IDBDatabase, meta: WorldMeta): Promise<void> {
  const list = await new Promise<WorldMeta[]>((resolve, reject) => {
    const tx = db.transaction(META, 'readonly');
    const req = tx.objectStore(META).get('list');
    req.onsuccess = () => resolve((req.result as WorldMeta[]) ?? []);
    req.onerror = () => reject(req.error);
  });
  const next = list.filter((m) => m.name !== meta.name);
  next.push(meta);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(META, 'readwrite');
    tx.objectStore(META).put(next, 'list');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveWorldNamed(
  name: string,
  world: World,
  player: PlayerState,
  inv: Inventory,
  drops: DropSystem,
  containers: ContainerStore,
  dayTime: number,
  respawn: { x: number; y: number; z: number } | null,
  xp?: { xp: number; level: number },
): Promise<void> {
  const data: SaveData = {
    version: 5,
    name,
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
    xp,
    savedAt: Date.now(),
  };
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(data, name);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  await putMeta(db, { name, seed: world.seed, savedAt: data.savedAt });
  db.close();
}

export async function loadWorldNamed(name: string): Promise<SaveData | null> {
  const db = await openDb();
  const data = await new Promise<SaveData | null>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(name);
    req.onsuccess = () => resolve((req.result as SaveData) ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return data;
}

export async function deleteWorldNamed(name: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(name);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  const list = await new Promise<WorldMeta[]>((resolve, reject) => {
    const tx = db.transaction(META, 'readonly');
    const req = tx.objectStore(META).get('list');
    req.onsuccess = () => resolve((req.result as WorldMeta[]) ?? []);
    req.onerror = () => reject(req.error);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(META, 'readwrite');
    tx.objectStore(META).put(list.filter((m) => m.name !== name), 'list');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

/** Legacy helpers */
export async function saveWorld(
  world: World, player: PlayerState, inv: Inventory, drops: DropSystem,
  containers: ContainerStore, dayTime: number, respawn: { x: number; y: number; z: number } | null,
): Promise<void> {
  return saveWorldNamed('default', world, player, inv, drops, containers, dayTime, respawn);
}
export async function loadWorld(): Promise<SaveData | null> {
  return loadWorldNamed('default');
}

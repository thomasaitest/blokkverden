import { describe, it, expect } from 'vitest';
import { BlockId } from '../src/blocks/types';
import { World } from '../src/world/world';
import { tickWater } from '../src/world/water';
import { tickLava } from '../src/world/lava';
import { flowAt } from '../src/world/flow';
import { pour, drinkMilk, BUCKET, LAVA_BUCKET, WATER_BUCKET, MILK_BUCKET } from '../src/items/bucket';
import { createPlayer, movePlayer } from '../src/player/physics';
import { DropSystem } from '../src/world/drops';
import { Inventory } from '../src/items/inventory';
import { ITEMS } from '../src/items/types';
import { itemPattern } from '../src/render/itemIcons';

function flat(): World {
  const w = new World(3); w.ensureChunk(0, 0);
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) { w.setBlock(x, 20, z, BlockId.Stone); for (let y = 21; y < 34; y++) w.setBlock(x, y, z, BlockId.Air); }
  return w;
}
const F = { x: 8, z: 8 };
const gb = (w: World) => (x: number, y: number, z: number) => w.getBlock(x, y, z);
const gm = (w: World) => (x: number, y: number, z: number) => w.getWaterLevel(x, y, z);

describe('it25 liquid current (MC getFlow)', () => {
  it('flowing water points away from the source, a still pool of sources has no current', () => {
    const w = flat();
    pour(w, WATER_BUCKET, 3, 21, 8, false);
    for (let i = 0; i < 12; i++) tickWater(w, 400, undefined, F);
    const f = flowAt(gb(w), gm(w), 6, 21, 8);
    expect(f.x).toBeGreaterThan(0.9);
    expect(Math.abs(f.z)).toBeLessThan(0.2);
    const g = flowAt(gb(w), gm(w), 3, 21, 5);
    expect(g.z).toBeLessThan(-0.5);
    // 3×3 pool of sources walled in → no current in the middle
    const p = flat();
    for (let x = 5; x <= 7; x++) for (let z = 5; z <= 7; z++) p.setWater(x, 21, z, 7);
    for (let x = 4; x <= 8; x++) for (let z = 4; z <= 8; z++) if (p.getBlock(x, 21, z) !== BlockId.Water) p.setBlock(x, 21, z, BlockId.Stone);
    expect(flowAt(gb(p), gm(p), 6, 21, 6)).toEqual({ x: 0, z: 0 });
  });

  it('the current pushes a player standing still in flowing water along it', () => {
    const w = flat();
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) if (z < 7 || z > 9) w.setBlock(x, 21, z, BlockId.Stone);
    pour(w, WATER_BUCKET, 2, 21, 8, false);
    for (let i = 0; i < 12; i++) tickWater(w, 400, undefined, F);
    const p = createPlayer(4.5, 21, 8.5);
    for (let i = 0; i < 60; i++) movePlayer(p, w, 0, 0, false, 1 / 60);
    expect(p.x).toBeGreaterThan(5.5); // ~1.4 b/s for 1 s
    expect(Math.abs(p.z - 8.5)).toBeLessThan(0.3);
    // without water nothing moves
    const d = flat(); const q = createPlayer(4.5, 21, 8.5);
    for (let i = 0; i < 60; i++) movePlayer(q, d, 0, 0, false, 1 / 60);
    expect(Math.abs(q.x - 4.5)).toBeLessThan(1e-6);
  });

  it('items in flowing water drift with the current', () => {
    const w = flat();
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) if (z < 7 || z > 9) w.setBlock(x, 21, z, BlockId.Stone);
    pour(w, WATER_BUCKET, 2, 21, 8, false);
    for (let i = 0; i < 12; i++) tickWater(w, 400, undefined, F);
    const ds = new DropSystem();
    ds.spawn(4, 21.3, 8, { id: 5, count: 1 });
    const d = ds.drops[0]; d.vx = 0; d.vz = 0; d.x = 4.5; d.z = 8.5;
    const far = createPlayer(14.5, 30, 14.5);
    const inv = new Inventory();
    const solid = (x: number, y: number, z: number) => { const id = w.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)); return id !== BlockId.Air && id !== BlockId.Water; };
    for (let i = 0; i < 60; i++) ds.update(1 / 60, far, inv, solid, (x, y, z) => flowAt(gb(w), gm(w), Math.floor(x), Math.floor(y), Math.floor(z)));
    expect(ds.drops[0].x).toBeGreaterThan(5.2);
  });
});

describe('it25 lava in Helvete (MC)', () => {
  it('flows 7 blocks in Helvete (3 in the overworld) and recedes when the source is gone', () => {
    const w = flat();
    pour(w, LAVA_BUCKET, 8, 21, 8, false);
    for (let i = 0; i < 12; i++) tickLava(w, { ...F, helvete: true });
    expect(w.getBlock(15, 21, 8)).toBe(BlockId.Lava); // 7 away
    expect(w.getWaterLevel(9, 21, 8)).toBe(7);
    expect(w.getWaterLevel(15, 21, 8)).toBe(1);
    expect(w.getBlock(8, 21, 15)).toBe(BlockId.Lava);
    const o = flat();
    pour(o, LAVA_BUCKET, 8, 21, 8, false);
    for (let i = 0; i < 12; i++) tickLava(o, F);
    expect(o.getBlock(11, 21, 8)).toBe(BlockId.Lava);
    expect(o.getBlock(12, 21, 8)).toBe(BlockId.Air);
    w.setBlock(8, 21, 8, BlockId.Air);
    for (let i = 0; i < 16; i++) tickLava(w, { ...F, helvete: true });
    let left = 0; for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) if (w.getBlock(x, 21, z) === BlockId.Lava) left++;
    expect(left).toBe(0);
  });
});

describe('it25 milk bucket (MC)', () => {
  it('drinking milk clears Sult and gives the empty bucket back; the item exists with an icon and is not stackable', () => {
    const p = { hungerEffect: 25 };
    expect(drinkMilk(p)).toBe(BUCKET);
    expect(p.hungerEffect).toBe(0);
    expect(ITEMS[MILK_BUCKET].name).toBe('Melkebøtte');
    expect(ITEMS[MILK_BUCKET].stackable).toBe(false);
    expect(itemPattern(MILK_BUCKET)).toBeTruthy();
  });
  it('a milk bucket cannot be poured', () => {
    const w = flat();
    expect(pour(w, MILK_BUCKET, 8, 21, 8, false)).toBeFalsy();
    expect(w.getBlock(8, 21, 8)).toBe(BlockId.Air);
  });
});

import { MobSystem } from '../src/mobs/system';
import { SoundBus } from '../src/audio/sound';

describe('it25 mobs in a current (MC)', () => {
  it('a pig in a walled channel of flowing water is carried along the flow', () => {
    const w = flat();
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) if (z < 7 || z > 9) { w.setBlock(x, 21, z, BlockId.Stone); w.setBlock(x, 22, z, BlockId.Stone); }
    pour(w, WATER_BUCKET, 1, 21, 8, false);
    for (let i = 0; i < 14; i++) tickWater(w, 400, undefined, F);
    const sys = new MobSystem();
    const m = sys.spawn('gris', 3.5, 21, 8.5);
    const player = createPlayer(14.5, 30, 2.5);
    const drops = new DropSystem();
    for (let i = 0; i < 40; i++) sys.update(w, player, 0.05, drops, new SoundBus(), () => {});
    expect(m.x).toBeGreaterThan(5.0);
  });
});

import { describe, it, expect } from 'vitest';
import { BlockId, BLOCKS, collidesBlock, isReplaceable } from '../src/blocks/types';
import { FireSystem, canPlaceFire, isFlammable, burnTick, createBurnState } from '../src/world/fire';
import { doorPanel, DOOR_FACING_SHIFT, DOOR_THICKNESS } from '../src/world/doors';
import { updateGravityAround } from '../src/world/gravity';
import { isWashable } from '../src/world/water';
import { dropForBlock, damageTool, ItemId, ITEMS, stack } from '../src/items/types';
import { matchRecipe } from '../src/items/crafting';
import { createPlayer, movePlayer } from '../src/player/physics';
import { World } from '../src/world/world';

class FakeWorld {
  b = new Map<string, number>();
  getBlock(x: number, y: number, z: number) { return this.b.get(`${x},${y},${z}`) ?? 0; }
  setBlock(x: number, y: number, z: number, id: number) { const k = `${x},${y},${z}`; if (id) this.b.set(k, id); else this.b.delete(k); return true; }
}
const count = (w: FakeWorld, id: number) => [...w.b.values()].filter((v) => v === id).length;
function lcg(seed = 7) { let s = seed; return () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296); }
function floor(w: FakeWorld, id = BlockId.Stone) { for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) w.setBlock(x, 9, z, id); }
const dt = 1 / 60;

describe('it19 fire (MC)', () => {
  it('fire is lit on a solid block or next to something flammable, not in mid-air', () => {
    const w = new FakeWorld(); floor(w);
    expect(canPlaceFire(w, 0, 10, 0)).toBe(true);
    expect(canPlaceFire(w, 0, 20, 0)).toBe(false);
    w.setBlock(5, 20, 0, BlockId.Planks);
    expect(canPlaceFire(w, 4, 20, 0)).toBe(true);
    expect(canPlaceFire(w, 0, 9, 0)).toBe(false); // occupied
    const f = new FireSystem();
    expect(f.ignite(w, 0, 10, 0)).toBe(true);
    expect(w.getBlock(0, 10, 0)).toBe(BlockId.Fire);
  });
  it('fire on stone burns out after a few seconds; on helstein it burns forever', () => {
    const w = new FakeWorld(); floor(w);
    w.setBlock(3, 9, 3, BlockId.Helstein);
    const f = new FireSystem(); const rng = lcg();
    f.ignite(w, 0, 10, 0, rng); f.ignite(w, 3, 10, 3, rng);
    for (let t = 0; t < 2.5; t += 0.1) f.update(0.1, w, rng);
    expect(w.getBlock(0, 10, 0)).toBe(BlockId.Fire); // ≥ 3 s life
    for (let t = 0; t < 8; t += 0.1) f.update(0.1, w, rng);
    expect(w.getBlock(0, 10, 0)).toBe(BlockId.Air);
    for (let t = 0; t < 60; t += 0.5) f.update(0.5, w, rng);
    expect(w.getBlock(3, 10, 3)).toBe(BlockId.Fire);
  });
  it('fire spreads into a wooden wall and burns it away', () => {
    const w = new FakeWorld(); floor(w);
    for (let x = -3; x <= 3; x++) for (let y = 10; y <= 12; y++) w.setBlock(x, y, 1, BlockId.Planks);
    const f = new FireSystem(); const rng = lcg(11);
    f.ignite(w, 0, 10, 0, rng);
    const before = count(w, BlockId.Planks);
    for (let t = 0; t < 120; t += 0.5) f.update(0.5, w, rng);
    expect(count(w, BlockId.Planks)).toBeLessThan(before - 5);
    // no endless fire: everything burns out eventually on stone
    for (let t = 0; t < 120; t += 0.5) f.update(0.5, w, rng);
    expect(count(w, BlockId.Fire)).toBe(0);
    expect(f.fires.size).toBe(0);
  });
  it('fire: no collision, drops nothing, light 15, washed away, replaceable; sand falls through it', () => {
    expect(collidesBlock(BlockId.Fire, 0, 0, 0, 0.2, 0.2, 0.8, 1.8, 0.2, 0.8)).toBe(false);
    expect(dropForBlock(BlockId.Fire, null)).toBeNull();
    expect(BLOCKS[BlockId.Fire].lightEmit).toBe(15);
    expect(isWashable(BlockId.Fire)).toBe(true);
    expect(isReplaceable(BlockId.Fire)).toBe(true);
    expect(isFlammable(BlockId.Planks) && isFlammable(BlockId.Log) && isFlammable(BlockId.Leaves)).toBe(true);
    expect(isFlammable(BlockId.Stone) || isFlammable(BlockId.Cobble)).toBe(false);
    const w = new FakeWorld(); floor(w);
    w.setBlock(0, 10, 0, BlockId.Fire); w.setBlock(0, 14, 0, BlockId.Sand);
    updateGravityAround(w, 0, 14, 0);
    expect(w.getBlock(0, 10, 0)).toBe(BlockId.Sand);
  });
  it('flint and steel: iron ingot + flint in any arrangement, 64 uses', () => {
    const I = stack(ItemId.IronIngot, 1), F = stack(ItemId.Flint, 1);
    for (const g of [[I, F, null, null], [F, I, null, null], [I, null, F, null], [null, F, I, null], [F, null, null, I]]) {
      expect(matchRecipe(g)?.result.id).toBe(ItemId.FlintAndSteel);
    }
    expect(ITEMS[ItemId.FlintAndSteel].maxDurability).toBe(64);
    let s: ReturnType<typeof damageTool> = stack(ItemId.FlintAndSteel, 1, 64);
    for (let i = 0; i < 63; i++) s = damageTool(s);
    expect(s?.durability).toBe(1);
    expect(damageTool(s)).toBeNull();
  });
  it('burning: fire 2 dmg/s, lava 8 dmg/s, then 1 dmg/s for 8 s (lava 15 s); water puts it out', () => {
    let s = createBurnState(); let d = 0;
    for (let i = 0; i < 60; i++) d += burnTick(s, true, false, false, dt);
    expect(d).toBe(2);
    d = 0; for (let i = 0; i < 60 * 10; i++) d += burnTick(s, false, false, false, dt);
    expect(d).toBe(8);
    s = createBurnState(); d = 0;
    for (let i = 0; i < 60; i++) d += burnTick(s, false, true, false, dt);
    expect(d).toBe(8);
    expect(s.burnTime).toBe(15);
    burnTick(s, false, false, true, dt);
    expect(s.burnTime).toBe(0);
  });
});

describe('it19 lava physics', () => {
  it('lava slows you down and breaks a fall (no fall damage), you sink slowly', () => {
    const w = new World(3); w.ensureChunk(0, 0);
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) {
      w.setBlock(x, 10, z, BlockId.Stone);
      for (let y = 11; y < 40; y++) w.setBlock(x, y, z, y <= 13 ? BlockId.Lava : BlockId.Air);
    }
    const p = createPlayer(8.5, 30, 8.5);
    let dmg = 0;
    for (let i = 0; i < 240; i++) dmg += movePlayer(p, w, 0, 0, false, dt).fallDamage;
    expect(p.inLava).toBe(true);
    expect(dmg).toBe(0);
    const x0 = p.x, z0 = p.z;
    for (let i = 0; i < 60; i++) movePlayer(p, w, 0, -1, false, dt);
    expect(Math.hypot(p.x - x0, p.z - z0)).toBeLessThan(1.3); // ~1 b/s (land: 4.3)
  });
});

describe('it19 doors: thin panel collision (MC)', () => {
  it('closed panel is 3/16 thick on the facing edge; open swings to the hinge side', () => {
    expect(doorPanel(0)).toEqual([0, 0, 1, DOOR_THICKNESS]);
    expect(doorPanel(1)).toEqual([0, 0, DOOR_THICKNESS, 1]);
    const f1 = doorPanel(1 << DOOR_FACING_SHIFT);
    expect(f1[0]).toBe(0); expect(f1[2]).toBeCloseTo(DOOR_THICKNESS);
    const f2 = doorPanel(2 << DOOR_FACING_SHIFT);
    expect(f2[1]).toBeCloseTo(1 - DOOR_THICKNESS); expect(f2[3]).toBe(1);
    const f3 = doorPanel(3 << DOOR_FACING_SHIFT);
    expect(f3[0]).toBeCloseTo(1 - DOOR_THICKNESS); expect(f3[2]).toBe(1);
    // collision follows the panel and is 2 blocks tall
    expect(collidesBlock(BlockId.Door, 0, 10, 0, 0.2, 10, 0.8, 11.8, 0.05, 0.15, 0)).toBe(true);
    expect(collidesBlock(BlockId.Door, 0, 10, 0, 0.2, 10, 0.8, 11.8, 0.4, 0.95, 0)).toBe(false);
    expect(collidesBlock(BlockId.Door, 0, 10, 0, 0.2, 11.5, 0.8, 13, 0.05, 0.15, 0)).toBe(true);
    expect(collidesBlock(BlockId.Door, 0, 10, 0, 0.2, 10, 0.8, 11.8, 0.05, 0.15, 1)).toBe(false); // open: panel moved
  });
  it('walking into a closed door stops at the panel; through an open door you pass', () => {
    const w = new World(3); w.ensureChunk(0, 0);
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) {
      w.setBlock(x, 10, z, BlockId.Stone);
      for (let y = 11; y < 20; y++) w.setBlock(x, y, z, BlockId.Air);
    }
    for (let x = 0; x < 16; x++) for (let y = 11; y <= 13; y++) if (x !== 8 || y === 13) w.setBlock(x, y, 6, BlockId.Cobble);
    w.setBlock(8, 11, 6, BlockId.Door); w.setMeta(8, 11, 6, 0); // facing 0: panel on the far (−Z) edge of the door cell
    const p = createPlayer(8.5, 11, 9.5); p.yaw = 0;
    for (let i = 0; i < 90; i++) movePlayer(p, w, 0, -1, false, dt);
    // stopped against the thin panel at 6 + 3/16 + 0.3 ≈ 6.49 (old full-block collision stopped at 7.3)
    expect(p.z).toBeGreaterThan(6.48);
    expect(p.z).toBeLessThan(6.6);
    w.setMeta(8, 11, 6, 1);
    for (let i = 0; i < 120; i++) movePlayer(p, w, 0, -1, false, dt);
    expect(p.z).toBeLessThan(5.9); // walked through the doorway
  });
});

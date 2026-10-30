import { describe, expect, it } from 'vitest';
import { BlockId } from '../src/blocks/types';
import { ItemId, stack, ITEMS } from '../src/items/types';
import { matchRecipe } from '../src/items/crafting';
import { MobSystem } from '../src/mobs/system';
import { World } from '../src/world/world';
import { createPlayer } from '../src/player/physics';
import { SoundBus } from '../src/audio/sound';
import { DropSystem } from '../src/world/drops';
import { explosionBlocks, explosionDamage, blastResistance } from '../src/world/explosion';
import { itemPattern } from '../src/render/itemIcons';

function seq(seed = 1) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

function solidWorld(fill: number) {
  const w = new World(3);
  for (let cx = -1; cx <= 1; cx++) for (let cz = -1; cz <= 1; cz++) w.ensureChunk(cx, cz);
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) {
    for (let y = 30; y < 46; y++) w.setBlock(x, y, z, fill);
    for (let y = 46; y < 70; y++) w.setBlock(x, y, z, BlockId.Air);
  }
  return w;
}

describe('it15 explosions (MC ray model)', () => {
  it('creeper-size blast breaks dirt much further than stone; never bedrock or through water', () => {
    const g = (fill: number) => (x: number, y: number, z: number) => (y < 46 ? fill : BlockId.Air);
    const dirt = explosionBlocks(g(BlockId.Dirt), 8, 46.5, 8, 3, seq());
    const stone = explosionBlocks(g(BlockId.Stone), 8, 46.5, 8, 3, seq());
    const bed = explosionBlocks(g(BlockId.Bedrock), 8, 46.5, 8, 3, seq());
    const water = explosionBlocks(() => BlockId.Water, 8, 46.5, 8, 3, seq());
    expect(dirt.length).toBeGreaterThan(15);
    expect(stone.length).toBeGreaterThan(0); // MC: creepers DO crater stone (before: stone was immune)
    expect(stone.length).toBeLessThan(dirt.length / 2);
    expect(bed.length).toBe(0);
    expect(water.length).toBe(0);
    const maxDepth = Math.max(...stone.map((b) => 46 - b.y));
    expect(maxDepth).toBeLessThanOrEqual(2);
  });
  it('resistances: chest/furnace weaker than stone, bedrock immense', () => {
    expect(blastResistance(BlockId.Chest)).toBeLessThan(blastResistance(BlockId.Stone));
    expect(blastResistance(BlockId.Bedrock)).toBeGreaterThan(1e5);
  });
  it('damage falls off with distance and exposure; zero beyond 2×power', () => {
    expect(explosionDamage(0, 3)).toBe(43); // MC Normal max creeper damage
    expect(explosionDamage(3, 3)).toBeGreaterThan(10);
    expect(explosionDamage(3, 3, 0)).toBe(1);
    expect(explosionDamage(6.1, 3)).toBe(0);
  });
  it('MobSystem.explode spills chest contents, pops torches, hurts the player less behind a wall', () => {
    const w = solidWorld(BlockId.Dirt);
    w.setBlock(9, 46, 8, BlockId.Chest);
    w.setBlock(7, 46, 8, BlockId.Torch);
    const sys = new MobSystem();
    sys.takeContainer = (x, y, z) => (x === 9 && y === 46 && z === 8 ? [stack(ItemId.Diamond, 3)] : []);
    const drops = new DropSystem();
    const player = createPlayer(10.5, 46, 8.5);
    let dmgOpen = 0;
    sys.explode(w, 8.5, 46.5, 8.5, 3, player, drops, (d) => { dmgOpen += d; }, seq(3));
    expect(w.getBlock(9, 46, 8)).toBe(BlockId.Air);
    expect(drops.drops.some((d) => d.stack.id === ItemId.Diamond && d.stack.count === 3)).toBe(true);
    expect(w.getBlock(8, 45, 8)).toBe(BlockId.Air); // crater
    expect(dmgOpen).toBeGreaterThan(5);
    // behind a 3-high stone wall
    const w2 = solidWorld(BlockId.Stone);
    for (let y = 46; y < 49; y++) for (let z = 4; z < 13; z++) w2.setBlock(10, y, z, BlockId.Bedrock);
    const p2 = createPlayer(11.5, 46, 8.5);
    let dmgWall = 0;
    sys.explode(w2, 8.5, 46.5, 8.5, 3, p2, new DropSystem(), (d) => { dmgWall += d; }, seq(3));
    expect(dmgWall).toBeLessThan(dmgOpen);
  });
  it('creeper that explodes drops nothing; killed creeper/zombie/spider drop MC loot (not coal)', () => {
    const w = solidWorld(BlockId.Stone);
    const seen = new Set<number>();
    for (let k = 0; k < 40; k++) {
      const sys = new MobSystem(); sys.dayTime = 0.9;
      for (const kind of ['vandrer', 'vever', 'knallbolle'] as const) { const m = sys.spawn(kind, 3.5, 46.02, 3.5); m.hp = 0; }
      const drops = new DropSystem();
      sys.update(w, createPlayer(200, 46, 200), 0.05, drops, new SoundBus(), () => {});
      for (const d of drops.drops) seen.add(d.stack.id);
    }
    expect(seen.has(ItemId.Coal)).toBe(false);
    expect(seen.has(ItemId.RottenFlesh)).toBe(true);
    expect(seen.has(ItemId.String)).toBe(true);
    expect(seen.has(ItemId.Gunpowder)).toBe(true);
    const sys = new MobSystem(); sys.dayTime = 0.9;
    const c = sys.spawn('knallbolle', 8.5, 46.02, 8.5);
    const drops = new DropSystem();
    const p = createPlayer(9.6, 46, 8.5);
    const quiet = new SoundBus(); (quiet as unknown as { enabled: boolean }).enabled = false;
    for (let i = 0; i < 60; i++) sys.update(w, p, 0.05, drops, quiet, () => {});
    expect(c.exploded).toBe(true);
    expect(drops.drops.some((d) => d.stack.id === ItemId.Gunpowder)).toBe(false);
  });
});

describe('it15 string recipes + items', () => {
  it('bow = 3 sticks + 3 string; fishing rod uses string; 4 string → wool', () => {
    const S = stack(ItemId.Stick), T = stack(ItemId.String);
    expect(matchRecipe([null, S, T, S, null, T, null, S, T])?.result.id).toBe(ItemId.Bow);
    expect(matchRecipe([null, null, S, null, S, T, S, null, T])?.result.id).toBe(ItemId.FishingRod);
    expect(matchRecipe([T, T, T, T])?.result.id).toBe(ItemId.WoolItem);
    const L = stack(ItemId.Leather);
    expect(matchRecipe([null, S, L, S, null, L, null, S, L])?.result.id).not.toBe(ItemId.Bow);
  });
  it('new items have Norwegian names, own icons; rotten flesh is food', () => {
    expect(ITEMS[ItemId.String].name).toBe('Tråd');
    expect(ITEMS[ItemId.Gunpowder].name).toBe('Krutt');
    expect(ITEMS[ItemId.RottenFlesh].name).toBe('Råttent kjøtt');
    expect(ITEMS[ItemId.RottenFlesh].food).toBe(4);
    for (const id of [ItemId.String, ItemId.Gunpowder, ItemId.RottenFlesh]) expect(itemPattern(id)?.rows.length).toBe(16);
  });
});

describe('it15 creeper explodes exactly once', () => {
  it('a dying creeper does not keep exploding during its death animation', () => {
    const w = solidWorld(BlockId.Stone);
    const sys = new MobSystem(); sys.dayTime = 0.9;
    const quiet = new SoundBus(); (quiet as unknown as { enabled: boolean }).enabled = false;
    let blasts = 0;
    sys.onBlast = () => { blasts++; };
    sys.spawn('knallbolle', 8.5, 46.02, 8.5);
    const p = createPlayer(10.5, 46, 8.5);
    let hurt = 0;
    for (let i = 0; i < 80; i++) sys.update(w, p, 0.05, new DropSystem(), quiet, (d) => { hurt += d; });
    expect(blasts).toBe(1);
    expect(hurt).toBeLessThan(30);
  });
});

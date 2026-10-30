import { describe, expect, it } from 'vitest';
import { BlockId } from '../src/blocks/types';
import { ItemId, stack, dropForBlock, breakDuration, canHarvest } from '../src/items/types';
import { findSmelt } from '../src/items/furnace';
import { ContainerStore } from '../src/world/containers';
import { MobSystem, burnsInSun } from '../src/mobs/system';
import { World } from '../src/world/world';
import { createPlayer } from '../src/player/physics';
import { SoundBus } from '../src/audio/sound';
import { DropSystem } from '../src/world/drops';
import { Chunk } from '../src/world/chunk';
import { generateTerrain } from '../src/world/terrain';
import { SeededNoise } from '../src/world/noise';

describe('it14 pickaxe tiers (MC)', () => {
  const wood = stack(ItemId.WoodPickaxe, 1), stone = stack(ItemId.StonePickaxe, 1), iron = stack(ItemId.IronPickaxe, 1);
  it('iron ore needs stone pickaxe; gold/diamond need iron', () => {
    expect(dropForBlock(BlockId.IronOre, wood)).toBeNull();
    expect(dropForBlock(BlockId.IronOre, stone)?.id).toBe(ItemId.IronOre);
    expect(dropForBlock(BlockId.GoldOre, stone)).toBeNull();
    expect(dropForBlock(BlockId.GoldOre, iron)?.id).toBe(ItemId.GoldOre);
    expect(dropForBlock(BlockId.DiamondOre, stone)).toBeNull();
    expect(dropForBlock(BlockId.DiamondOre, iron)?.id).toBe(ItemId.Diamond);
  });
  it('cobble / furnace need a pickaxe', () => {
    expect(dropForBlock(BlockId.Cobble, null)).toBeNull();
    expect(dropForBlock(BlockId.Furnace, null)).toBeNull();
    expect(dropForBlock(BlockId.Furnace, wood)?.id).toBe(ItemId.Furnace);
    expect(dropForBlock(BlockId.CoalOre, wood)?.id).toBe(ItemId.Coal);
    expect(dropForBlock(BlockId.Log, null)?.id).toBe(ItemId.Log);
  });
  it('too-weak pickaxe mines slower', () => {
    expect(canHarvest(BlockId.IronOre, wood)).toBe(false);
    expect(breakDuration(BlockId.IronOre, wood)).toBeGreaterThan(breakDuration(BlockId.IronOre, stone) * 2);
  });
});

describe('it14 bedrock', () => {
  it('world bottom is bedrock and unbreakable', () => {
    const c = new Chunk(0, 0);
    generateTerrain(c, new SeededNoise(7));
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) expect(c.get(x, 0, z)).toBe(BlockId.Bedrock);
    expect(breakDuration(BlockId.Bedrock, stack(ItemId.DiamondPickaxe, 1))).toBe(Infinity);
    expect(dropForBlock(BlockId.Bedrock, stack(ItemId.DiamondPickaxe, 1))).toBeNull();
  });
});

describe('it14 food + containers', () => {
  it('raw meat smelts to cooked meat (8 food)', () => {
    expect(findSmelt(stack(ItemId.RawMeat, 1))?.output.id).toBe(ItemId.CookedMeat);
  });
  it('chest contents are listed for spilling when broken', () => {
    const cs = new ContainerStore();
    const slots = cs.getChest(1, 2, 3);
    slots[0] = stack(ItemId.Diamond, 3); slots[5] = stack(ItemId.Log, 10);
    const f = cs.getFurnace(4, 5, 6); f.input = stack(ItemId.IronOre, 2); f.output = stack(ItemId.IronIngot, 1);
    expect(cs.contentsAt(1, 2, 3).map((s) => s.id)).toEqual([ItemId.Diamond, ItemId.Log]);
    expect(cs.contentsAt(4, 5, 6).length).toBe(2);
  });
});

describe('it14 sun burning + creeper fuse', () => {
  function flat() {
    const w = new World(3);
    for (let cx = -1; cx <= 1; cx++) for (let cz = -1; cz <= 1; cz++) w.ensureChunk(cx, cz);
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) {
      w.setBlock(x, 45, z, BlockId.Stone);
      for (let y = 46; y < 128; y++) w.setBlock(x, y, z, BlockId.Air);
    }
    return w;
  }
  it('zombie burns to death in daylight under open sky, not under a roof, not at night', () => {
    const w = flat();
    for (let x = 10; x < 14; x++) for (let z = 10; z < 14; z++) w.setBlock(x, 49, z, BlockId.Planks);
    const sys = new MobSystem();
    sys.dayTime = 0.5;
    const open = sys.spawn('vandrer', 3.5, 46.02, 3.5);
    const roofed = sys.spawn('vandrer', 12.5, 46.02, 12.5);
    const creeper = sys.spawn('knallbolle', 3.5, 46.02, 12.5);
    expect(burnsInSun(w, open)).toBe(true);
    expect(burnsInSun(w, roofed)).toBe(false);
    const player = createPlayer(200.5, 46, 200.5);
    const drops = new DropSystem();
    for (let i = 0; i < 300; i++) sys.update(w, player, 0.05, drops, new SoundBus(), () => {});
    expect(open.hp).toBeLessThanOrEqual(0);
    expect(roofed.hp).toBeGreaterThan(0);
    expect(creeper.hp).toBeGreaterThan(0); // creepers don't burn
    const night = new MobSystem(); night.dayTime = 0.9;
    const z2 = night.spawn('vandrer', 3.5, 46.02, 3.5);
    for (let i = 0; i < 300; i++) night.update(w, player, 0.05, drops, new SoundBus(), () => {});
    expect(z2.hp).toBe(20);
  });
  it('creeper fuse winds down when the player gets away', () => {
    const w = flat();
    const sys = new MobSystem(); sys.dayTime = 0.9;
    const c = sys.spawn('knallbolle', 8.5, 46.02, 8.5);
    const player = createPlayer(10.5, 46, 8.5);
    const drops = new DropSystem();
    for (let i = 0; i < 10; i++) sys.update(w, player, 0.05, drops, new SoundBus(), () => {});
    expect(c.fuse).toBeGreaterThan(0.3);
    player.x = 40; // ran away
    for (let i = 0; i < 40; i++) sys.update(w, player, 0.05, drops, new SoundBus(), () => {});
    expect(c.fuse).toBe(0);
    expect(c.hp).toBeGreaterThan(0);
  });
});

describe('it14 creeper is MC-like', () => {
  it('a hissing creeper stands still and never melees', () => {
    const w = new World(3);
    for (let cx = -1; cx <= 1; cx++) for (let cz = -1; cz <= 1; cz++) w.ensureChunk(cx, cz);
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) {
      w.setBlock(x, 45, z, BlockId.Stone);
      for (let y = 46; y < 60; y++) w.setBlock(x, y, z, BlockId.Air);
    }
    const sys = new MobSystem(); sys.dayTime = 0.9;
    const c = sys.spawn('knallbolle', 8.5, 46.02, 8.5);
    const player = createPlayer(9.4, 46, 8.5);
    let hits = 0;
    for (let i = 0; i < 6; i++) sys.update(w, player, 0.05, new DropSystem(), new SoundBus(), () => { hits++; });
    expect(c.fuse).toBeGreaterThan(0.2);
    expect(Math.abs(c.x - 8.5)).toBeLessThan(0.05);
    expect(hits).toBe(0);
  });
  it('old saves get a bedrock floor on load', () => {
    const w = new World(5);
    w.ensureChunk(0, 0);
    w.setBlock(3, 0, 3, BlockId.Air); w.setBlock(4, 0, 4, BlockId.Stone);
    const data = w.serializeModified();
    w.loadChunks(data);
    expect(w.getBlock(3, 0, 3)).toBe(BlockId.Bedrock);
    expect(w.getBlock(4, 0, 4)).toBe(BlockId.Bedrock);
  });
});

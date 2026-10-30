import { describe, expect, it } from 'vitest';
import { armorPoints, stack, ItemId } from '../src/items/types';
import { MobSystem } from '../src/mobs/system';
import { World } from '../src/world/world';
import { createPlayer } from '../src/player/physics';
import { SoundBus } from '../src/audio/sound';
import { DropSystem } from '../src/world/drops';

describe('armor', () => {
  it('sums armor points', () => {
    expect(armorPoints([stack(ItemId.IronHelmet), stack(ItemId.IronChest), null, null])).toBe(8);
  });
});

describe('mobs', () => {
  it('spawns and can be hurt', () => {
    const w = new World(2);
    w.ensureChunk(0, 0);
    const sys = new MobSystem();
    const m = sys.spawn('gris', 8, 40, 8);
    expect(m.hp).toBe(10);
    sys.hurtMob(m, 5, 1, 0);
    expect(m.hp).toBe(5);
  });
});

import { lineOfSight, inMeleeReach } from '../src/mobs/system';
import { BlockId } from '../src/blocks/types';
describe('mob attacks need reach + line of sight (MC)', () => {
  it('zombie under a 3-high pillar cannot melee the player on top', () => {
    const m = { x: 8.5, y: 40, z: 8.5, height: 1.9 };
    expect(inMeleeReach(m, { x: 8.5, y: 43, z: 8.5 })).toBe(false);
    expect(inMeleeReach(m, { x: 9.2, y: 40, z: 8.5 })).toBe(true);
  });
  it('a stone wall blocks line of sight; open air does not', () => {
    const w = new World(3);
    w.ensureChunk(0, 0);
    for (let y = 60; y < 66; y++) for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) w.setBlock(x, y, z, BlockId.Air);
    expect(lineOfSight(w, 2.5, 61.6, 8.5, 12.5, 61.6, 8.5)).toBe(true);
    for (let y = 60; y < 64; y++) for (let z = 0; z < 16; z++) w.setBlock(7, y, z, BlockId.Stone);
    expect(lineOfSight(w, 2.5, 61.6, 8.5, 12.5, 61.6, 8.5)).toBe(false);
  });
});

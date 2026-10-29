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

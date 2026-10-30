import { describe, expect, it } from 'vitest';
import { itemPattern } from '../src/render/itemIcons';
import { ITEMS } from '../src/items/types';

describe('it14 item icons', () => {
  it('every tool/armor has a 16×16 pattern; pickaxe ≠ sword ≠ axe; tiers differ in colour', () => {
    for (const d of Object.values(ITEMS)) {
      if (!(d.tool && d.tool !== 'none') && !d.armorSlot) continue;
      const p = itemPattern(d.id)!;
      expect(p, d.name).toBeTruthy();
      expect(p.rows.length).toBe(16);
      for (const r of p.rows) expect(r.length, d.name).toBe(16);
    }
    expect(itemPattern(108)!.rows).not.toEqual(itemPattern(111)!.rows);
    expect(itemPattern(108)!.rows).not.toEqual(itemPattern(109)!.rows);
    expect(itemPattern(100)!.head).not.toEqual(itemPattern(108)!.head);
    expect(itemPattern(52)).toBeNull(); // apple keeps its atlas tile
  });
});

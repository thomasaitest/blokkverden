import { describe, it, expect } from 'vitest';
import { DropSystem, DROP_DESPAWN_SEC } from '../src/world/drops';
import { Inventory } from '../src/items/inventory';

// Column with a "roof" at y=20 and a cave floor at y=10 (solid y<=10 and y=20).
const solid = (_x: number, y: number, _z: number) => { const fy = Math.floor(y); return fy <= 10 || fy === 20; };
const farPlayer = { x: 100, y: 100, z: 100 } as any;

describe('drops', () => {
  it('fall to the floor below them, not the column top (cave/roof)', () => {
    const d = new DropSystem();
    d.spawn(0, 11, 0, { id: 4, count: 1 }); // mined block at y=11 under a roof
    for (let i = 0; i < 120; i++) d.update(1 / 60, farPlayer, new Inventory(), solid);
    expect(d.drops[0].y).toBeGreaterThan(10.9);
    expect(d.drops[0].y).toBeLessThan(12);
  });
  it('despawn after 5 minutes, not before', () => {
    const d = new DropSystem();
    d.spawn(0, 11, 0, { id: 4, count: 1 });
    for (let t = 0; t < DROP_DESPAWN_SEC - 1; t += 1) d.update(1, farPlayer, new Inventory(), solid);
    expect(d.drops.length).toBe(1);
    d.update(2, farPlayer, new Inventory(), solid);
    expect(d.drops.length).toBe(0);
  });
  it('thrown items respect pickup delay', () => {
    const d = new DropSystem();
    const inv = new Inventory();
    const p = { x: 0.5, y: 11, z: 0.5 } as any;
    d.throwItem(0.5, 11.3, 0.5, 0, 0, 0, { id: 4, count: 3 }, 2);
    for (let i = 0; i < 60; i++) d.update(1 / 60, p, inv, solid); // 1 s
    expect(d.drops.length).toBe(1);
    for (let i = 0; i < 90; i++) d.update(1 / 60, p, inv, solid); // 2.5 s
    expect(d.drops.length).toBe(0);
    expect(inv.slots.find((s) => s?.id === 4)?.count).toBe(3);
  });
});

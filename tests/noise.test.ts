import { describe, expect, it } from 'vitest';
import { SeededNoise } from '../src/world/noise';

describe('SeededNoise', () => {
  it('is deterministic for same seed', () => {
    const a = new SeededNoise(42);
    const b = new SeededNoise(42);
    expect(a.noise2(1.5, 2.5)).toBe(b.noise2(1.5, 2.5));
    expect(a.fbm2(10, 20)).toBe(b.fbm2(10, 20));
    expect(a.hash2(3, 7)).toBe(b.hash2(3, 7));
  });

  it('differs across seeds', () => {
    const a = new SeededNoise(1);
    const b = new SeededNoise(2);
    expect(a.hash2(0, 0)).not.toBe(b.hash2(0, 0));
  });

  it('hash2 stays in [0,1)', () => {
    const n = new SeededNoise(99);
    for (let i = 0; i < 50; i++) {
      const h = n.hash2(i, i * 3);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(1);
    }
  });
});

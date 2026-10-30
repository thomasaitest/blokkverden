import { describe, it, expect } from 'vitest';
import { filterLookDelta, LOOK_SPIKE_PX } from '../src/player/controls';

describe('pointer-lock look filter', () => {
  it('keeps fast real flicks (Mac Chrome coalesced mousemove, >40 px/event)', () => {
    expect(filterLookDelta(180)).toBe(180);
    expect(filterLookDelta(-320)).toBe(-320);
    expect(filterLookDelta(3)).toBe(3);
  });
  it('drops OS warp spikes and junk', () => {
    expect(filterLookDelta(LOOK_SPIKE_PX + 1)).toBe(0);
    expect(filterLookDelta(-5000)).toBe(0);
    expect(filterLookDelta(NaN)).toBe(0);
  });
});

import { wheelSteps, WHEEL_PX_PER_SLOT } from '../src/player/controls';
describe('hotbar wheel (MC: one notch = one slot)', () => {
  it('Mac mouse wheel notch (deltaY≈4, wheelDeltaY=120) steps once', () => {
    const st = { acc: 0, lastT: -1e9 };
    expect(wheelSteps(st, 4.000244140625, 0, -120, 0)).toBe(1);
    expect(wheelSteps(st, -4.000244140625, 0, 120, 30)).toBe(-1);
  });
  it('trackpad swipe of many tiny deltas only moves a few slots', () => {
    const st = { acc: 0, lastT: -1e9 };
    let moved = 0;
    for (let i = 0; i < 40; i++) moved += wheelSteps(st, 3, 0, -9, i * 16); // 120 px total
    expect(moved).toBe(Math.trunc(120 / WHEEL_PX_PER_SLOT));
  });
  it('line-mode wheels (Firefox-style) step once per event', () => {
    const st = { acc: 0, lastT: -1e9 };
    expect(wheelSteps(st, 3, 1, undefined, 0)).toBe(1);
  });
});

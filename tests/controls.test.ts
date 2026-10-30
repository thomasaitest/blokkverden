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

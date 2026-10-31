import { describe, it, expect } from 'vitest';
import { shouldClearKeysOnLockLoss } from '../src/player/controls';

describe('shouldClearKeysOnLockLoss', () => {
  it('clears on Cmd+Tab (tab hidden)', () => {
    expect(shouldClearKeysOnLockLoss('hidden')).toBe(true);
  });
  it('keeps WASD on in-tab lock loss (Esc/pause) so resume does not feel stuck', () => {
    expect(shouldClearKeysOnLockLoss('visible')).toBe(false);
  });
});

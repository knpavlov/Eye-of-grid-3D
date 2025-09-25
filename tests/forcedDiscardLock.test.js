import { describe, it, expect } from 'vitest';
import {
  computeForcedDiscardLock,
  hasForeignDiscardLock,
  FOREIGN_DISCARD_LOCK_MESSAGE,
} from '../src/ui/forcedDiscardLock.js';

describe('forced discard lock helpers', () => {
  it('не блокирует ход без активных запросов', () => {
    const state = { active: 0, pendingDiscards: [] };
    const result = computeForcedDiscardLock(state, 0);
    expect(result).toEqual({ locked: false, message: null });
    expect(hasForeignDiscardLock(state, 0)).toBe(false);
  });

  it('блокирует активного игрока, если сбрасывает соперник', () => {
    const state = {
      active: 0,
      pendingDiscards: [
        { id: 'req-1', target: 1, remaining: 1 },
      ],
    };
    const result = computeForcedDiscardLock(state, 0);
    expect(result.locked).toBe(true);
    expect(result.message).toBe(FOREIGN_DISCARD_LOCK_MESSAGE);
    expect(hasForeignDiscardLock(state, 0)).toBe(true);
  });

  it('не блокирует, если активный игрок сам должен дискардить', () => {
    const state = {
      active: 0,
      pendingDiscards: [
        { id: 'req-1', target: 0, remaining: 1 },
        { id: 'req-2', target: 1, remaining: 1 },
      ],
    };
    const result = computeForcedDiscardLock(state, 0);
    expect(result.locked).toBe(false);
    expect(result.message).toBeNull();
    expect(hasForeignDiscardLock(state, 0)).toBe(false);
  });

  it('не блокирует, если сейчас ход другого игрока', () => {
    const state = {
      active: 1,
      pendingDiscards: [
        { id: 'req-1', target: 0, remaining: 1 },
      ],
    };
    const result = computeForcedDiscardLock(state, 0);
    expect(result.locked).toBe(false);
    expect(result.message).toBeNull();
  });
});

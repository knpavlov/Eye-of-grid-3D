import { describe, it, expect, beforeEach } from 'vitest';
import { collectHealingShowerTargets } from '../src/spells/handlers.js';
import { CARDS } from '../src/core/cards.js';

function makeBoard() {
  return Array.from({ length: 3 }, () =>
    Array.from({ length: 3 }, () => ({ element: 'EARTH', unit: null }))
  );
}

describe('Healing Shower', () => {
  beforeEach(() => {
    globalThis.CARDS = CARDS;
  });

  it('лечит союзников нужной стихии на 3 HP с учётом бонуса клетки', () => {
    const board = makeBoard();
    board[0][0].element = 'FOREST';
    board[0][0].unit = {
      owner: 0,
      tplId: 'FOREST_SWALLOW_NINJA',
      currentHP: 1,
    };
    board[0][1].element = 'FOREST';
    board[0][1].unit = {
      owner: 0,
      tplId: 'FOREST_SWALLOW_NINJA',
      currentHP: 5,
    };
    const state = { board };
    const plan = collectHealingShowerTargets(state, 0, 'FOREST');
    expect(plan).toHaveLength(1);
    expect(plan[0].healed).toBe(3);
    expect(plan[0].after).toBe(4);
  });
});

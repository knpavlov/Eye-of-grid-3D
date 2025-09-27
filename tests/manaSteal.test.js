import { describe, it, expect } from 'vitest';
import {
  applySummonManaSteal,
  applyDeathManaSteal,
  consumeManaStealEvents,
} from '../src/core/abilityHandlers/manaSteal.js';

function makeState() {
  return {
    board: Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => ({ element: 'NEUTRAL', unit: null }))),
    players: [
      { mana: 5 },
      { mana: 7 },
    ],
  };
}

describe('логика кражи маны', () => {
  it('Moving Isle of Kadena крадёт ману при призыве на чужой элемент', () => {
    const state = makeState();
    state.board[0][0].element = 'WATER';
    state.board[1][1].element = 'WATER';
    state.board[2][2].element = 'WATER';
    const tpl = {
      id: 'WATER_MOVING_ISLE_OF_KADENA',
      manaSteal: {
        onSummon: {
          amount: { type: 'FIELD_COUNT', element: 'WATER' },
          forbidFieldElement: 'WATER',
        },
      },
    };
    const unit = { owner: 0, tplId: tpl.id };
    const cell = { element: 'EARTH' };
    const events = applySummonManaSteal(state, { tpl, unit, cell, r: 1, c: 0 });
    expect(events).toHaveLength(1);
    expect(state.players[1].mana).toBe(4);
    expect(state.players[0].mana).toBe(8);
    const [event] = consumeManaStealEvents(state);
    expect(event.amount).toBe(3);
    expect(event.from).toBe(1);
    expect(event.to).toBe(0);
  });

  it("Queen's Servant крадёт 1 ману при смерти", () => {
    const state = makeState();
    const deathEntry = {
      r: 1,
      c: 1,
      owner: 0,
      tplId: 'WATER_QUEENS_SERVANT',
      element: 'WATER',
    };
    const events = applyDeathManaSteal(state, [deathEntry], { cause: 'TEST' });
    expect(events).toHaveLength(1);
    expect(state.players[1].mana).toBe(6);
    expect(state.players[0].mana).toBe(6);
    const [event] = consumeManaStealEvents(state);
    expect(event.amount).toBe(1);
    expect(event.reason).toBe('TEST');
  });

  it('Dancing Temptress крадёт ману у владельца существа перед ней', () => {
    const state = makeState();
    state.players[1].mana = 3;
    const deathEntry = {
      r: 1,
      c: 1,
      owner: 0,
      tplId: 'WATER_DANCING_TEMPTRESS',
      element: 'NEUTRAL',
      frontOwner: 1,
    };
    const events = applyDeathManaSteal(state, [deathEntry], { cause: 'BATTLE' });
    expect(events).toHaveLength(1);
    expect(state.players[1].mana).toBe(2);
    expect(state.players[0].mana).toBe(6);
    const [event] = consumeManaStealEvents(state);
    expect(event.from).toBe(1);
    expect(event.to).toBe(0);
    expect(event.amount).toBe(1);
  });
});

import { describe, it, expect } from 'vitest';
import { applySummonManaSteal, applyDeathManaSteal } from '../src/core/abilityHandlers/manaSteal.js';
import { createDeathEntry } from '../src/core/abilityHandlers/deathRecords.js';
import { CARDS } from '../src/core/cards.js';

function createEmptyBoard() {
  return Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => ({ element: null, unit: null })));
}

describe('mana steal mechanics', () => {
  it('steals mana on summon for Moving Isle of Kadena when field is not Water', () => {
    const board = createEmptyBoard();
    board[0][0].element = 'WATER';
    board[1][2].element = 'WATER';
    board[2][1].element = 'WATER';
    board[1][1].element = 'FIRE';

    const state = {
      board,
      players: [
        { mana: 8 },
        { mana: 5 },
      ],
    };

    const unit = { owner: 0, tplId: 'WATER_MOVING_ISLE_OF_KADENA' };
    const cell = state.board[1][1];
    const events = applySummonManaSteal(state, {
      tpl: CARDS.WATER_MOVING_ISLE_OF_KADENA,
      unit,
      cell,
      r: 1,
      c: 1,
    });

    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event.amount).toBe(2); // ограничено вместимостью получателя
    expect(event.from).toBe(1);
    expect(event.to).toBe(0);
    expect(state.players[0].mana).toBe(10);
    expect(state.players[1].mana).toBe(3);
  });

  it("steals one mana on Queen's Servant death", () => {
    const board = createEmptyBoard();
    const state = {
      board,
      players: [
        { mana: 4 },
        { mana: 2 },
      ],
    };

    const deaths = [
      { r: 1, c: 1, owner: 0, tplId: 'WATER_QUEENS_SERVANT', element: null },
    ];

    const events = applyDeathManaSteal(state, deaths, { cause: 'TEST' });
    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event.amount).toBe(1);
    expect(event.from).toBe(1);
    expect(event.to).toBe(0);
    expect(state.players[0].mana).toBe(5);
    expect(state.players[1].mana).toBe(1);
  });

  it('steals mana from the owner of the unit in front when Dancing Temptress dies', () => {
    const board = createEmptyBoard();
    const temptress = { owner: 0, tplId: 'WATER_DANCING_TEMPTRESS', currentHP: 0, facing: 'N' };
    const victim = { owner: 1, tplId: 'FIRE_FLAME_MAGUS', currentHP: 2 };
    board[1][1].unit = temptress;
    board[0][1].unit = victim;

    const state = {
      board,
      players: [
        { mana: 6 },
        { mana: 3 },
      ],
    };

    const deathEntry = createDeathEntry(state, temptress, 1, 1);
    expect(deathEntry.frontOwner).toBe(1);

    const events = applyDeathManaSteal(state, [deathEntry], { cause: 'BATTLE' });
    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event.from).toBe(1);
    expect(event.to).toBe(0);
    expect(event.amount).toBe(1);
    expect(state.players[0].mana).toBe(7);
    expect(state.players[1].mana).toBe(2);
  });
});

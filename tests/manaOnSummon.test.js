import { describe, it, expect } from 'vitest';
import { applyManaGainOnSummon } from '../src/core/abilityHandlers/manaOnSummon.js';
import { CARDS } from '../src/core/cards.js';

function makeState(defaultElement = 'FIRE') {
  const board = Array.from({ length: 3 }, () => (
    Array.from({ length: 3 }, () => ({ element: defaultElement, unit: null }))
  ));
  const players = [ { mana: 0, graveyard: [] }, { mana: 0, graveyard: [] } ];
  return { board, players };
}

describe('manaOnSummon ауры', () => {
  it('Фридонийский странник даёт ману только вне огненных полей', () => {
    const state = makeState('FOREST');
    state.players[0].mana = 0;
    state.board[1][1] = { element: 'FOREST', unit: { owner: 0, tplId: 'FIRE_FREEDONIAN_WANDERER' } };
    const summoned = { owner: 0, tplId: 'FIRE_FLAME_MAGUS' };
    state.board[0][1] = { element: 'FOREST', unit: summoned };

    const events = applyManaGainOnSummon(state, {
      unit: summoned,
      tpl: CARDS[summoned.tplId],
      r: 0,
      c: 1,
      cell: state.board[0][1],
    });

    expect(events).toHaveLength(1);
    expect(events[0].owner).toBe(0);
    expect(state.players[0].mana).toBe(1);
    expect(events[0].log).toMatch(/Фридонийский Странник/);

    // Тот же странник на огненном поле не даёт ману
    const state2 = makeState('FIRE');
    state2.players[0].mana = 0;
    state2.board[1][1] = { element: 'FIRE', unit: { owner: 0, tplId: 'FIRE_FREEDONIAN_WANDERER' } };
    state2.board[0][0] = { element: 'FOREST', unit: summoned };
    const events2 = applyManaGainOnSummon(state2, {
      unit: summoned,
      tpl: CARDS[summoned.tplId],
      r: 0,
      c: 0,
      cell: state2.board[0][0],
    });
    expect(events2).toHaveLength(0);
    expect(state2.players[0].mana).toBe(0);
  });

  it('Имперский биолитовый гвардеец реагирует на призывы на биолитовые поля', () => {
    const state = makeState('BIOLITH');
    state.players[0].mana = 0;
    state.board[1][0] = { element: 'BIOLITH', unit: { owner: 0, tplId: 'BIOLITH_IMPERIAL_BIOLITH_GUARD' } };
    const summoned = { owner: 0, tplId: 'BIOLITH_BIOLITH_STINGER' };
    state.board[0][0] = { element: 'BIOLITH', unit: summoned };

    const events = applyManaGainOnSummon(state, {
      unit: summoned,
      tpl: CARDS[summoned.tplId],
      r: 0,
      c: 0,
      cell: state.board[0][0],
    });

    expect(events).toHaveLength(1);
    expect(events[0].owner).toBe(0);
    expect(state.players[0].mana).toBe(1);
  });

  it('Тино не выдаёт ману при собственном призыве, но усиливает союзные вызовы', () => {
    const state = makeState('BIOLITH');
    state.players[0].mana = 0;
    const tino = { owner: 0, tplId: 'BIOLITH_TINO_SON_OF_SCION' };
    state.board[1][1] = { element: 'BIOLITH', unit: tino };

    const noGain = applyManaGainOnSummon(state, {
      unit: tino,
      tpl: CARDS[tino.tplId],
      r: 1,
      c: 1,
      cell: state.board[1][1],
    });
    expect(noGain).toHaveLength(0);
    expect(state.players[0].mana).toBe(0);

    const ally = { owner: 0, tplId: 'BIOLITH_BIOLITH_STINGER' };
    state.board[0][1] = { element: 'FOREST', unit: ally };
    const allyGain = applyManaGainOnSummon(state, {
      unit: ally,
      tpl: CARDS[ally.tplId],
      r: 0,
      c: 1,
      cell: state.board[0][1],
    });
    expect(allyGain).toHaveLength(1);
    expect(state.players[0].mana).toBe(1);
  });

  it('Наследник Вормака получает ману за вражеские призывы', () => {
    const state = makeState('BIOLITH');
    state.players[0].mana = 0;
    state.players[1].mana = 0;
    state.board[1][2] = { element: 'BIOLITH', unit: { owner: 0, tplId: 'BIOLITH_WORMAK_HEIR' } };
    const enemy = { owner: 1, tplId: 'EARTH_VERZAR_FOOT_SOLDIER' };
    state.board[0][2] = { element: 'FIRE', unit: enemy };

    const events = applyManaGainOnSummon(state, {
      unit: enemy,
      tpl: CARDS[enemy.tplId],
      r: 0,
      c: 2,
      cell: state.board[0][2],
    });

    expect(events).toHaveLength(1);
    expect(events[0].owner).toBe(0);
    expect(state.players[0].mana).toBe(1);
    expect(state.players[1].mana).toBe(0);
  });
});

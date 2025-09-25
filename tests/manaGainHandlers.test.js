import { describe, it, expect } from 'vitest';
import { applyDeathManaGain, applyAdjacentDeathManaGain } from '../src/core/abilityHandlers/manaGain.js';

function makeBoard(defaultElement = 'FIRE') {
  const board = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => ({ element: defaultElement, unit: null })));
  board[1][1].element = 'BIOLITH';
  return board;
}

function makeState() {
  return {
    board: makeBoard(),
    players: [
      { mana: 0, maxMana: 10 },
      { mana: 0, maxMana: 10 },
    ],
  };
}

describe('начисление маны при смерти существ', () => {
  it('Inquisitor Koog даёт ману по числу врагов', () => {
    const state = makeState();
    state.board[0][0].unit = { owner: 1, tplId: 'FIRE_FLAME_MAGUS', currentHP: 1 };
    state.board[2][2].unit = { owner: 1, tplId: 'FIRE_PARTMOLE_FLAME_LIZARD', currentHP: 2 };
    state.players[0].mana = 2;
    const res = applyDeathManaGain(state, [
      { r: 1, c: 1, owner: 0, tplId: 'EARTH_INQUISITOR_KOOG', element: 'EARTH' },
    ], { cause: 'TEST' });
    expect(res.total).toBe(2);
    expect(res.entries).toHaveLength(1);
    expect(state.players[0].mana).toBe(4);
  });

  it('Novogus Catapult считает поля Земли', () => {
    const state = makeState();
    state.board[0][0].element = 'EARTH';
    state.board[0][2].element = 'EARTH';
    state.board[2][0].element = 'EARTH';
    state.board[2][2].element = 'EARTH';
    state.players[0].mana = 1;
    const res = applyDeathManaGain(state, [
      { r: 0, c: 0, owner: 0, tplId: 'EARTH_NOVOGUS_CATAPULT', element: 'EARTH' },
    ], { cause: 'TEST' });
    expect(res.total).toBe(4);
    expect(res.entries[0].element).toBe('EARTH');
    expect(state.players[0].mana).toBe(5);
  });

  it('Skeleton Soldier даёт дополнительную ману', () => {
    const state = makeState();
    state.players[0].mana = 3;
    const res = applyDeathManaGain(state, [
      { r: 0, c: 1, owner: 0, tplId: 'EARTH_SKELETON_SOLDIER', element: 'EARTH' },
    ], { cause: 'TEST' });
    expect(res.total).toBe(1);
    expect(state.players[0].mana).toBe(4);
  });
});

describe('Undead Dragon и соседние смерти союзников', () => {
  it('даёт ману на Земле при гибели соседа', () => {
    const state = makeState();
    state.board[1][1].element = 'EARTH';
    state.board[1][1].unit = { owner: 0, tplId: 'EARTH_UNDEAD_DRAGON', currentHP: 8 };
    state.players[0].mana = 5;
    const res = applyAdjacentDeathManaGain(state, [
      { r: 1, c: 0, owner: 0, tplId: 'EARTH_GIANT_AXE_DWARF', element: 'EARTH' },
    ], { cause: 'TEST' });
    expect(res.total).toBe(1);
    expect(state.players[0].mana).toBe(6);
  });

  it('не даёт ману вне Земли', () => {
    const state = makeState();
    state.board[1][1].element = 'FIRE';
    state.board[1][1].unit = { owner: 0, tplId: 'EARTH_UNDEAD_DRAGON', currentHP: 8 };
    state.players[0].mana = 5;
    const res = applyAdjacentDeathManaGain(state, [
      { r: 1, c: 0, owner: 0, tplId: 'EARTH_GIANT_AXE_DWARF', element: 'EARTH' },
    ], { cause: 'TEST' });
    expect(res.total).toBe(0);
    expect(res.entries).toHaveLength(0);
    expect(state.players[0].mana).toBe(5);
  });
});

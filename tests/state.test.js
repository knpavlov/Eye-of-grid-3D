import { describe, it, expect } from 'vitest';
import { shuffle, drawOne, drawOneNoAdd, countControlled, randomBoard, reducer, A } from '../src/core/state.js';

function makeEmptyBoard() {
  // 3x3 with MECH in center and FIRE elsewhere by default
  const b = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => ({ element: 'FIRE', unit: null })));
  b[1][1].element = 'MECH';
  return b;
}

describe('state helpers', () => {
  it('shuffle: keeps all elements and length', () => {
    const arr = [1, 2, 3, 4, 5];
    const out = shuffle(arr);
    expect(out).toHaveLength(arr.length);
    // same multiset
    expect([...out].sort()).toEqual([...arr].sort());
    // not strictly required to differ, but often will
  });

  it('drawOne / drawOneNoAdd', () => {
    const state = {
      board: makeEmptyBoard(),
      players: [
        { deck: ['a', 'b'], hand: [] },
        { deck: [], hand: [] }
      ],
    };
    const c1 = drawOne(state, 0);
    expect(c1).toBe('a');
    expect(state.players[0].hand).toEqual(['a']);
    const c2 = drawOneNoAdd(state, 0);
    expect(c2).toBe('b');
    expect(state.players[0].hand).toEqual(['a']);
    const c3 = drawOne(state, 1);
    expect(c3).toBeNull();
  });

  it('countControlled: counts units by owner', () => {
    const board = makeEmptyBoard();
    board[0][0].unit = { owner: 0 };
    board[0][1].unit = { owner: 1 };
    board[2][2].unit = { owner: 0 };
    const state = { board };
    expect(countControlled(state, 0)).toBe(2);
    expect(countControlled(state, 1)).toBe(1);
  });

  it('randomBoard: center is MECH and other elements appear exactly twice', () => {
    const b = randomBoard();
    expect(b).toHaveLength(3);
    expect(b[0]).toHaveLength(3);
    expect(b[1][1].element).toBe('MECH');
    const counts = { FIRE: 0, WATER: 0, EARTH: 0, FOREST: 0, MECH: 0 };
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) counts[b[r][c].element] = (counts[b[r][c].element] || 0) + 1;
    expect(counts.MECH).toBe(1);
    expect(counts.FIRE).toBe(2);
    expect(counts.WATER).toBe(2);
    expect(counts.EARTH).toBe(2);
    expect(counts.FOREST).toBe(2);
  });
});

describe('reducer', () => {
  it('A.INIT: creates new game and bumps version', () => {
    const s = reducer(undefined, { type: A.INIT });
    expect(s).toBeTruthy();
    expect(s.__ver).toBe(1);
    expect(Array.isArray(s.board)).toBe(true);
    expect(s.players).toHaveLength(2);
  });

  it('A.REPLACE_STATE: ignores older versions, accepts newer', () => {
    const base = { board: makeEmptyBoard(), players: [{}, {}], active: 0, turn: 1, __ver: 5 };
    const newer = { ...base, __ver: 7 };
    const older = { ...base, __ver: 4 };
    expect(reducer(base, { type: A.REPLACE_STATE, payload: older })).toEqual(base);
    expect(reducer(base, { type: A.REPLACE_STATE, payload: newer })).toEqual(newer);
  });

  it('A.END_TURN: toggles active, increases mana (capped), draws a card', () => {
    const board = makeEmptyBoard();
    const state = {
      board,
      players: [
        { deck: [], hand: [], mana: 0 },
        { deck: ['X'], hand: [], mana: 9 }
      ],
      active: 0,
      turn: 1,
      winner: null,
      __ver: 0,
    };
    const next = reducer(state, { type: A.END_TURN });
    expect(next.active).toBe(1);
    expect(next.turn).toBe(2);
    // player 1 became active (index 1): mana increased by 2 but capped at 10
    expect(next.players[1].mana).toBe(10);
    // карта снимается с колоды, но в руку не добавляется сразу
    expect(next.players[1].hand).toEqual([]);
    expect(next.players[1].deck).toEqual([]);
    expect(next.__ver).toBeGreaterThan(state.__ver);
  });

  it('A.END_TURN: declares winner if 5+ controlled by active', () => {
    const board = makeEmptyBoard();
    // Active player 0 controls 5 cells
    board[0][0].unit = { owner: 0 };
    board[0][1].unit = { owner: 0 };
    board[0][2].unit = { owner: 0 };
    board[1][0].unit = { owner: 0 };
    board[2][0].unit = { owner: 0 };
    const state = {
      board,
      players: [{ deck: [], hand: [], mana: 0 }, { deck: [], hand: [], mana: 0 }],
      active: 0,
      turn: 3,
      winner: null,
      __ver: 2,
    };
    const next = reducer(state, { type: A.END_TURN });
    expect(next.winner).toBe(0);
    // Should not toggle active or change turn when winner set
    expect(next.active).toBe(0);
    expect(next.turn).toBe(3);
  });
});


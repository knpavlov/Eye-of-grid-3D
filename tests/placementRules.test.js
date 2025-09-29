import { describe, it, expect } from 'vitest';
import { getAllowedSummonCells, canSummonOnCell, hasPlayerSummoned } from '../src/core/placementRules.js';

function makeState() {
  const board = Array.from({ length: 3 }, () => (
    Array.from({ length: 3 }, () => ({ element: 'FIRE', unit: null }))
  ));
  board[1][1].element = 'BIOLITH';
  return { board, players: [{}, {}], active: 0 };
}

describe('placementRules', () => {
  it('первое существо игрока можно поставить на любую пустую клетку', () => {
    const state = makeState();
    expect(hasPlayerSummoned(state, 0)).toBe(false);
    const allowed = getAllowedSummonCells(state, 0);
    expect(allowed).toHaveLength(9);
    expect(allowed.every(cell => canSummonOnCell(state, 0, cell.r, cell.c))).toBe(true);
  });

  it('после первого призыва доступны только клетки рядом с любым существом', () => {
    const state = makeState();
    state.board[1][1].unit = { owner: 0, tplId: 'X', facing: 'N' };
    expect(hasPlayerSummoned(state, 0)).toBe(true);
    const allowed = getAllowedSummonCells(state, 0);
    const coords = allowed.map(c => `${c.r},${c.c}`).sort();
    expect(coords).toEqual(['0,1', '1,0', '1,2', '2,1']);
    expect(canSummonOnCell(state, 0, 0, 0)).toBe(false);
  });

  it('вражеские существа тоже расширяют доступную область', () => {
    const state = makeState();
    state.board[0][1].unit = { owner: 1, tplId: 'ENEMY', facing: 'S' };
    state.board[1][1].unit = { owner: 0, tplId: 'ALLY', facing: 'N' };
    expect(canSummonOnCell(state, 0, 0, 2)).toBe(true);
  });

  it('первое существо второго игрока игнорирует ограничение, даже если враг уже на поле', () => {
    const state = makeState();
    state.board[1][1].unit = { owner: 0, tplId: 'ALLY', facing: 'N' };
    expect(hasPlayerSummoned(state, 1)).toBe(false);
    const allowed = getAllowedSummonCells(state, 1);
    expect(allowed).toHaveLength(8);
    expect(canSummonOnCell(state, 1, 0, 0)).toBe(true);
  });
});

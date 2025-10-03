import { describe, it, expect } from 'vitest';
import { inBounds, capMana, attackCost, rotateCost } from '../src/core/constants.js';
import { CARDS } from '../src/core/cards.js';

describe('constants helpers', () => {
  it('inBounds: within 3x3 grid', () => {
    expect(inBounds(0, 0)).toBe(true);
    expect(inBounds(2, 2)).toBe(true);
    expect(inBounds(-1, 0)).toBe(false);
    expect(inBounds(0, 3)).toBe(false);
  });

  it('capMana: caps at 10', () => {
    expect(capMana(0)).toBe(0);
    expect(capMana(9)).toBe(9);
    expect(capMana(10)).toBe(10);
    expect(capMana(11)).toBe(10);
    expect(capMana(-5)).toBe(0);
    expect(capMana('invalid')).toBe(0);
  });

  it('attackCost: prefers activation if provided', () => {
    expect(attackCost({ activation: 2, cost: 5 })).toBe(2);
  });

  it('attackCost: cost - 1 otherwise, floored at 0', () => {
    expect(attackCost({ cost: 3 })).toBe(2);
    expect(attackCost({ cost: 0 })).toBe(0);
    expect(attackCost({})).toBe(0);
  });

  it('rotateCost: не учитывает скидки', () => {
    const tpl = { activation: 3, activationReduction: 2 };
    expect(attackCost(tpl)).toBe(1);
    expect(rotateCost(tpl)).toBe(3);
  });

  it('rotateCost: учитывает ауры, повышающие стоимость', () => {
    const state = {
      board: Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => ({ element: 'NEUTRAL', unit: null }))),
    };
    state.board[1][1].unit = { owner: 0, tplId: 'FOREST_SLEEPTRAP', currentHP: CARDS.FOREST_SLEEPTRAP.hp };
    state.board[1][2].unit = { owner: 1, tplId: 'FIRE_HELLFIRE_SPITTER', currentHP: CARDS.FIRE_HELLFIRE_SPITTER.hp };
    const cell = state.board[1][2];
    const tpl = CARDS.FIRE_HELLFIRE_SPITTER;
    const cost = rotateCost(tpl, cell.element, {
      state,
      r: 1,
      c: 2,
      unit: cell.unit,
      owner: cell.unit.owner,
    });
    expect(cost).toBe((tpl.activation || 0) + 1);
  });

  it('attackCost: учитывает ауры, повышающие стоимость соседей', () => {
    const state = {
      board: Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => ({ element: 'NEUTRAL', unit: null }))),
    };
    state.board[1][1].unit = { owner: 1, tplId: 'FOREST_ELVEN_DEATH_DANCER', currentHP: CARDS.FOREST_ELVEN_DEATH_DANCER.hp };
    state.board[1][0].unit = { owner: 0, tplId: 'FIRE_HELLFIRE_SPITTER', currentHP: CARDS.FIRE_HELLFIRE_SPITTER.hp };
    const cellEl = state.board[1][0].element;
    const cost = attackCost(CARDS.FIRE_HELLFIRE_SPITTER, cellEl, {
      state,
      r: 1,
      c: 0,
      unit: state.board[1][0].unit,
      owner: 0,
    });
    expect(cost).toBe(4); // базовая стоимость 1 + налог ауры 3
  });
});


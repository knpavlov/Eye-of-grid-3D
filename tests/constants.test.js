import { describe, it, expect } from 'vitest';
import { inBounds, capMana, attackCost, activationCost } from '../src/core/constants.js';

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
  });

  it('attackCost: учитывает скидки только для атаки', () => {
    const tpl = { activation: 4, attackCostReduction: 2 };
    expect(activationCost(tpl)).toBe(4);
    expect(attackCost(tpl)).toBe(2);
  });

  it('attackCost: cost - 1 otherwise, floored at 0', () => {
    expect(attackCost({ cost: 3 })).toBe(2);
    expect(attackCost({ cost: 0 })).toBe(0);
    expect(attackCost({})).toBe(0);
  });
});


import { describe, it, expect } from 'vitest';
import { inBounds, capMana } from '../src/core/constants.js';
import { attackCost } from '../src/core/abilities.js';

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
  });

  describe('abilities helpers', () => {
    it('attackCost: prefers activation if provided', () => {
      expect(attackCost({ activation: 2, cost: 5 })).toBe(2);
    });

    it('attackCost: cost - 1 otherwise, floored at 0', () => {
      expect(attackCost({ cost: 3 })).toBe(2);
      expect(attackCost({ cost: 0 })).toBe(0);
      expect(attackCost({})).toBe(0);
    });

    it('attackCost: considers reductions', () => {
      expect(attackCost({ activation: 4, activationReduction: 1 })).toBe(3);
      expect(attackCost({ activation: 4, activationReductionOnElement: { element: 'FIRE', reduction: 2 } }, 'FIRE')).toBe(2);
    });
  });


import { describe, it, expect } from 'vitest';
import {
  computeElementalBurstPlan,
  applyElementalBurstPlan,
} from '../src/core/spells/elementalDominion.js';

describe('elementalDominion', () => {
  it('формирует крест вокруг выбранного поля и игнорирует союзников', () => {
    const enemyCenter = { tplId: 'FIRE_GREAT_MINOS', owner: 1, currentHP: 8, uid: 'enemy-center' };
    const enemyEast = { tplId: 'FIRE_GREAT_MINOS', owner: 1, currentHP: 8, uid: 'enemy-east' };
    const allyWest = { tplId: 'FIRE_GREAT_MINOS', owner: 0, currentHP: 7, uid: 'ally-west' };
    const state = {
      board: [
        [ { element: 'FIRE', unit: null }, { element: 'FIRE', unit: null }, { element: 'EARTH', unit: null } ],
        [ { element: 'FIRE', unit: allyWest }, { element: 'FIRE', unit: enemyCenter }, { element: 'FIRE', unit: enemyEast } ],
        [ { element: 'FIRE', unit: null }, { element: 'WATER', unit: null }, { element: 'FIRE', unit: null } ],
      ],
    };

    const plan = computeElementalBurstPlan(state, 0, {
      element: 'FIRE',
      centers: [{ r: 1, c: 1 }],
    });

    expect(plan.damage).toBe(7); // 7 огненных полей
    expect(plan.victims).toHaveLength(2);
    const coords = plan.victims.map(v => `${v.r},${v.c}`);
    expect(coords).toEqual(expect.arrayContaining(['1,1', '1,2']));

    const result = applyElementalBurstPlan(state, plan);
    expect(result.hits).toHaveLength(2);
    const centerHit = result.hits.find(h => h.r === 1 && h.c === 1);
    expect(centerHit.after).toBe(1);
    const eastHit = result.hits.find(h => h.r === 1 && h.c === 2);
    expect(eastHit.after).toBe(1);
    expect(result.deaths.length).toBe(0);
    expect(state.board[1][0].unit).toBe(allyWest);
  });

  it('учитывает все биолитовые поля и не дублирует цель', () => {
    const enemy = { tplId: 'BIOLITH_TINO_SON_OF_SCION', owner: 1, currentHP: 5, uid: 'enemy-unique' };
    const otherEnemy = { tplId: 'BIOLITH_TINO_SON_OF_SCION', owner: 1, currentHP: 5, uid: 'enemy-second' };
    const state = {
      board: [
        [ { element: 'BIOLITH', unit: enemy }, { element: 'EARTH', unit: null }, { element: 'BIOLITH', unit: null } ],
        [ { element: 'FIRE', unit: null }, { element: 'BIOLITH', unit: null }, { element: 'EARTH', unit: otherEnemy } ],
        [ { element: 'EARTH', unit: null }, { element: 'EARTH', unit: null }, { element: 'BIOLITH', unit: null } ],
      ],
    };

    const plan = computeElementalBurstPlan(state, 0, {
      element: 'BIOLITH',
      mode: 'ALL_BIOLITH',
    });

    expect(plan.damage).toBe(4); // четыре биолитовых поля
    expect(plan.victims.map(v => `${v.r},${v.c}`)).toEqual(expect.arrayContaining(['0,0', '1,2']));
    expect(plan.victims).toHaveLength(2);

    const result = applyElementalBurstPlan(state, plan);
    expect(result.hits).toHaveLength(2);
    const uniqueCells = new Set(result.hits.map(h => `${h.r},${h.c}`));
    expect(uniqueCells.size).toBe(2);
  });

  it('фиксирует смерти при нулевом HP', () => {
    const fragile = { tplId: 'FIRE_GREAT_MINOS', owner: 1, currentHP: 2, uid: 'fragile' };
    const state = {
      board: [
        [ { element: 'FIRE', unit: null }, { element: 'FIRE', unit: null }, { element: 'FIRE', unit: null } ],
        [ { element: 'FIRE', unit: null }, { element: 'FIRE', unit: fragile }, { element: 'FIRE', unit: null } ],
        [ { element: 'FIRE', unit: null }, { element: 'FIRE', unit: null }, { element: 'FIRE', unit: null } ],
      ],
    };

    const plan = computeElementalBurstPlan(state, 0, {
      element: 'FIRE',
      centers: [{ r: 1, c: 1 }],
    });
    expect(plan.damage).toBe(9);
    const result = applyElementalBurstPlan(state, plan);
    expect(result.deaths.length).toBe(1);
    expect(state.board[1][1].unit.currentHP).toBe(0);
  });
});

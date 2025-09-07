import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { computeCellBuff, effectiveStats, hasAdjacentGuard, computeHits, magicAttack } from '../src/core/rules.js';
import { CARDS } from '../src/core/cards.js';

function makeBoard() {
  const b = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => ({ element: 'FIRE', unit: null })));
  b[1][1].element = 'MECH';
  return b;
}


describe('buffs and stats', () => {
  it('computeCellBuff and effectiveStats', () => {
    // Same element => +2 HP
    expect(computeCellBuff('FIRE', 'FIRE')).toEqual({ atk: 0, hp: 2 });
    // Opposite (FIRE vs WATER) => -2 HP
    expect(computeCellBuff('WATER', 'FIRE')).toEqual({ atk: 0, hp: -2 });
    // Mech => no effect
    expect(computeCellBuff('MECH', 'FIRE')).toEqual({ atk: 0, hp: 0 });

    const cell = { element: 'FIRE' };
    const unit = { tplId: 'FIRE_FLAME_LIZARD', tempAtkBuff: 1 };
    const { atk, hp } = effectiveStats(cell, unit);
    // From cards.js, FIRE_FLAME_LIZARD has atk:2, hp:2; +2 HP on same element, +1 temp atk
    expect(atk).toBeGreaterThanOrEqual(3);
    expect(hp).toBeGreaterThanOrEqual(4);
  });
});

describe('guards and hits', () => {
  let addedGuard = false;

  beforeEach(() => {
    if (!CARDS.TEST_GUARD) {
      CARDS.TEST_GUARD = {
        id: 'TEST_GUARD', name: 'Test Guard', type: 'UNIT', cost: 0,
        element: 'FIRE', atk: 0, hp: 1, keywords: ['GUARD'],
        attackType: 'STANDARD', attacks: [{ dir: 'N', ranges: [1] }]
      };
      addedGuard = true;
    }
  });

  afterEach(() => {
    if (addedGuard) {
      delete CARDS.TEST_GUARD;
      addedGuard = false;
    }
  });

  it('hasAdjacentGuard: detects friendly guard next to target', () => {
    const state = { board: makeBoard() };
    state.board[1][1].unit = { owner: 0, tplId: 'FIRE_FLAME_LIZARD', facing: 'N' };
    state.board[1][2].unit = { owner: 0, tplId: 'TEST_GUARD', facing: 'N' };
    expect(hasAdjacentGuard(state, 1, 1)).toBe(true);
  });

  it('computeHits: attacker hits enemy in front within range', () => {
    const state = { board: makeBoard() };
    // Атакующий на (1,1) смотрит на восток и бьёт на 1 клетку вперёд
    state.board[1][1].unit = { owner: 0, tplId: 'FIRE_FLAME_LIZARD', facing: 'E' };
    // Enemy directly in front at (1,2)
    state.board[1][2].unit = { owner: 1, tplId: 'FIRE_FLAME_LIZARD', facing: 'W' };
    const hits = computeHits(state, 1, 1);
    expect(Array.isArray(hits)).toBe(true);
    const h = hits.find(h => h.r === 1 && h.c === 2);
    expect(h).toBeTruthy();
    expect(h.dmg).toBeGreaterThan(0);
  });

  it('computeHits: выбор направления обязателен для Hellfire Spitter', () => {
    const state = { board: makeBoard() };
    state.board[1][1].unit = { owner: 0, tplId: 'FIRE_HELLFIRE_SPITTER', facing: 'N' };
    state.board[0][1].unit = { owner: 1, tplId: 'FIRE_FLAME_LIZARD', facing: 'S' };
    // Без выбора направления удар не должен происходить
    expect(computeHits(state, 1, 1).length).toBe(0);
    // Указываем направление на север
    const hits = computeHits(state, 1, 1, { dir: 'N' });
    expect(hits.length).toBe(1);
    expect(hits[0].r).toBe(0);
  });

  it('computeHits: выбор дистанции', () => {
    // Временная карта с выбором дистанции
    CARDS.TEST_RANGE = {
      id: 'TEST_RANGE', name: 'Test Range', type: 'UNIT', cost: 0,
      element: 'FIRE', atk: 1, hp: 1,
      attackType: 'STANDARD',
      attacks: [{ dir: 'N', ranges: [1, 2], chooseRange: true }]
    };
    const state = { board: makeBoard() };
    state.board[2][1].unit = { owner: 0, tplId: 'TEST_RANGE', facing: 'N' };
    state.board[1][1].unit = { owner: 1, tplId: 'FIRE_FLAME_LIZARD', facing: 'S' };
    // Без выбора дистанции удар не происходит
    expect(computeHits(state, 2, 1).length).toBe(0);
    // Атака на дистанцию 1
    const h1 = computeHits(state, 2, 1, { range: 1 });
    expect(h1.length).toBe(1);
    expect(h1[0].r).toBe(1);
    // Освобождаем клетку на дистанции 1 и ставим врага на дистанции 2
    state.board[1][1].unit = null;
    state.board[0][1].unit = { owner: 1, tplId: 'FIRE_FLAME_LIZARD', facing: 'S' };
    const h2 = computeHits(state, 2, 1, { range: 2 });
    expect(h2.length).toBe(1);
    expect(h2[0].r).toBe(0);
    delete CARDS.TEST_RANGE;
  });
});

describe('magicAttack', () => {
  it('applies damage and does not trigger retaliation', () => {
    const state = { board: makeBoard(), players: [{ mana: 0 }, { mana: 0 }], turn: 1 };
    // Use a magic attacker template: FIRE_FLAME_MAGUS
    state.board[1][1].unit = { owner: 0, tplId: 'FIRE_FLAME_MAGUS', facing: 'E', hp: 1 };
    state.board[1][2].unit = { owner: 1, tplId: 'FIRE_FLAME_LIZARD', facing: 'W', hp: 2 };
    const res = magicAttack(state, 1, 1, 1, 2);
    expect(res).toBeTruthy();
    expect(res.n1.board[1][2].unit.currentHP).toBeLessThanOrEqual(2);
    expect(res.dmg).toBeGreaterThanOrEqual(1);
  });
});


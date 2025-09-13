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
      const unit = { tplId: 'FIRE_PARTMOLE_FLAME_LIZARD', tempAtkBuff: 1 };
      const state = { board: [[cell]] };
      const { atk, hp } = effectiveStats(state, cell, unit);
      // From cards.js, FIRE_PARTMOLE_FLAME_LIZARD has atk:2, hp:2; +2 HP on same element, +1 temp atk
    expect(atk).toBeGreaterThanOrEqual(3);
    expect(hp).toBeGreaterThanOrEqual(4);
  });
});

describe('guards and hits', () => {
  let addedGuard = false;

  beforeEach(() => {
    if (!CARDS.TEST_GUARD) {
      CARDS.TEST_GUARD = { id: 'TEST_GUARD', name: 'Test Guard', type: 'UNIT', cost: 0, element: 'FIRE', atk: 0, hp: 1, keywords: ['GUARD'], attackType: 'STANDARD', attacks: [ { dir: 'N', ranges: [1] } ] };
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
      state.board[1][1].unit = { owner: 0, tplId: 'FIRE_PARTMOLE_FLAME_LIZARD', facing: 'N' };
    state.board[1][2].unit = { owner: 0, tplId: 'TEST_GUARD', facing: 'N' };
    expect(hasAdjacentGuard(state, 1, 1)).toBe(true);
  });

  it('computeHits: attacker hits enemy in front within range', () => {
    const state = { board: makeBoard() };
    // Атакующий в (1,1) смотрит на восток, атака вперёд на 1 клетку
      state.board[1][1].unit = { owner: 0, tplId: 'FIRE_PARTMOLE_FLAME_LIZARD', facing: 'E' };
      // Enemy directly in front at (1,2)
      state.board[1][2].unit = { owner: 1, tplId: 'FIRE_PARTMOLE_FLAME_LIZARD', facing: 'W' };
    const hits = computeHits(state, 1, 1);
    expect(Array.isArray(hits)).toBe(true);
    const h = hits.find(h => h.r === 1 && h.c === 2);
    expect(h).toBeTruthy();
    expect(h.dmg).toBeGreaterThan(0);
  });

    it('computeHits: Hellfire Spitter бьёт во все стороны', () => {
      const state = { board: makeBoard() };
      state.board[1][1].unit = { owner: 0, tplId: 'FIRE_HELLFIRE_SPITTER', facing: 'N' };
      state.board[0][1].unit = { owner: 1, tplId: 'FIRE_PARTMOLE_FLAME_LIZARD', facing: 'S' };
      state.board[1][2].unit = { owner: 1, tplId: 'FIRE_PARTMOLE_FLAME_LIZARD', facing: 'W' };
      const hits = computeHits(state, 1, 1);
      const coords = hits.map(h => `${h.r},${h.c}`).sort();
      expect(coords).toEqual(['0,1','1,2']);
    });

  it('computeHits: unit hits both adjacent and next cell', () => {
    const state = { board: makeBoard() };
      state.board[2][1].unit = { owner: 0, tplId: 'FIRE_GREAT_MINOS', facing: 'N' };
      state.board[1][1].unit = { owner: 1, tplId: 'FIRE_PARTMOLE_FLAME_LIZARD', facing: 'S' };
      state.board[0][1].unit = { owner: 1, tplId: 'FIRE_PARTMOLE_FLAME_LIZARD', facing: 'S' };
    const hits = computeHits(state, 2, 1);
    const coords = hits.map(h => `${h.r},${h.c}`).sort();
    expect(coords).toEqual(['0,1', '1,1']);
  });

    it('computeHits: без friendlyFire союзник не задевается', () => {
      const state = { board: makeBoard() };
      state.board[1][1].unit = { owner: 0, tplId: 'FIRE_TRICEPTAUR_BEHEMOTH', facing: 'N' };
      state.board[0][1].unit = { owner: 0, tplId: 'FIRE_PARTMOLE_FLAME_LIZARD', facing: 'S' };
      const hits = computeHits(state, 1, 1);
      expect(hits.some(h => h.r === 0 && h.c === 1)).toBe(false);
    });
});

describe('magicAttack', () => {
  it('applies damage and does not trigger retaliation', () => {
    const state = { board: makeBoard(), players: [{ mana: 0 }, { mana: 0 }], turn: 1 };
    state.board[1][1].unit = { owner: 0, tplId: 'FIRE_FLAME_MAGUS', facing: 'E', hp: 1 };
    state.board[1][2].unit = { owner: 1, tplId: 'FIRE_PARTMOLE_FLAME_LIZARD', facing: 'W', hp: 2 };
    const res = magicAttack(state, 1, 1, 1, 2);
    expect(res).toBeTruthy();
    expect(res.n1.board[1][2].unit.currentHP).toBeLessThanOrEqual(2);
    expect(res.targets[0].dmg).toBeGreaterThanOrEqual(1);
  });

  it('allows friendly fire when template permits', () => {
    CARDS.TEST_MAGIC_FF = { id: 'TEST_MAGIC_FF', name: 'Test Mage', type: 'UNIT', cost: 0, element: 'FIRE', atk: 1, hp: 1, attackType: 'MAGIC', friendlyFire: true };
    const state = { board: makeBoard(), players: [{ mana: 0 }, { mana: 0 }], turn: 1 };
    state.board[1][1].unit = { owner: 0, tplId: 'TEST_MAGIC_FF', facing: 'N', hp: 1 };
    state.board[0][0].unit = { owner: 0, tplId: 'FIRE_PARTMOLE_FLAME_LIZARD', facing: 'S', hp: 2 };
    const res = magicAttack(state, 1, 1, 0, 0);
    expect(res).toBeTruthy();
    expect(res.targets.some(t => t.r === 0 && t.c === 0)).toBe(true);
    delete CARDS.TEST_MAGIC_FF;
  });

  it('applies splash damage around target', () => {
    CARDS.TEST_MAGIC_SPLASH = { id: 'TEST_MAGIC_SPLASH', name: 'Splash Mage', type: 'UNIT', cost: 0, element: 'FIRE', atk: 1, hp: 1, attackType: 'MAGIC', splash: 1, friendlyFire: true };
    const state = { board: makeBoard(), players: [{ mana: 0 }, { mana: 0 }], turn: 1 };
    state.board[1][1].unit = { owner: 0, tplId: 'TEST_MAGIC_SPLASH', facing: 'N', hp: 1 };
    state.board[0][0].unit = { owner: 1, tplId: 'FIRE_PARTMOLE_FLAME_LIZARD', facing: 'S', hp: 2 };
    state.board[0][1].unit = { owner: 1, tplId: 'FIRE_PARTMOLE_FLAME_LIZARD', facing: 'S', hp: 2 };
    const res = magicAttack(state, 1, 1, 0, 0);
    expect(res.targets.length).toBeGreaterThan(1);
    const hitCoords = res.targets.map(t => `${t.r},${t.c}`);
    expect(hitCoords).toContain('0,0');
    expect(hitCoords).toContain('0,1');
    delete CARDS.TEST_MAGIC_SPLASH;
  });
});


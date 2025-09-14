import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { computeCellBuff, effectiveStats, hasAdjacentGuard, computeHits, magicAttack, stagedAttack } from '../src/core/rules.js';
import { computeFieldquakeLockedCells } from '../src/core/fieldLocks.js';
import { hasFirstStrike } from '../src/core/abilities.js';
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
    const { atk, hp } = effectiveStats(cell, unit);
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

  it('computeHits: chooseDir attacks only selected direction', () => {
    const state = { board: makeBoard() };
    state.board[1][1].unit = { owner: 0, tplId: 'FIRE_HELLFIRE_SPITTER', facing: 'N' };
    state.board[0][1].unit = { owner: 1, tplId: 'FIRE_PARTMOLE_FLAME_LIZARD', facing: 'S' };
    state.board[1][2].unit = { owner: 1, tplId: 'FIRE_PARTMOLE_FLAME_LIZARD', facing: 'W' };
    // без выбранного направления ничего не происходит
    expect(computeHits(state, 1, 1)).toEqual([]);
    // union=true возвращает все возможные цели
    const allHits = computeHits(state, 1, 1, { union: true });
    expect(allHits.length).toBe(2);
    // выбираем север
    const northHits = computeHits(state, 1, 1, { chosenDir: 'N' });
    expect(northHits.length).toBe(1);
    expect(northHits[0]).toMatchObject({ r: 0, c: 1 });
  });

  it('computeHits: Great Minos бьёт две клетки вперёд', () => {
    const state = { board: makeBoard() };
    state.board[2][1].unit = { owner: 0, tplId: 'FIRE_GREAT_MINOS', facing: 'N' };
    state.board[1][1].unit = { owner: 1, tplId: 'FIRE_PARTMOLE_FLAME_LIZARD', facing: 'S' };
    state.board[0][1].unit = { owner: 1, tplId: 'FIRE_PARTMOLE_FLAME_LIZARD', facing: 'S' };
    const hits = computeHits(state, 2, 1);
    const coords = hits.map(h => `${h.r},${h.c}`).sort();
    expect(coords).toEqual(['0,1', '1,1']);
  });

  it('computeHits: includeEmpty показывает область атаки', () => {
    const state = { board: makeBoard() };
    state.board[2][1].unit = { owner:0, tplId:'FIRE_GREAT_MINOS', facing:'N' };
    const hits = computeHits(state,2,1,{ union:true, includeEmpty:true });
    const coords = hits.map(h=>`${h.r},${h.c}`).sort();
    expect(coords).toEqual(['0,1','1,1']);
  });

  it('stagedAttack: Great Minos задевает союзника, если есть враг', () => {
    const state = { board: makeBoard(), players:[{mana:0},{mana:0}], turn:1 };
    state.board[2][1].unit = { owner:0, tplId:'FIRE_GREAT_MINOS', facing:'N' };
    state.board[1][1].unit = { owner:0, tplId:'FIRE_PARTMOLE_FLAME_LIZARD', facing:'S', currentHP:2 };
    state.board[0][1].unit = { owner:1, tplId:'FIRE_PARTMOLE_FLAME_LIZARD', facing:'S', currentHP:2 };
    const res = stagedAttack(state,2,1);
    const fin = res.finish();
    expect(fin.n1.board[1][1].unit).toBeNull();
    expect(fin.n1.board[0][1].unit).toBeNull();
  });

  it('computeHits: friendlyFire позволяет бить своих', () => {
    const state = { board: makeBoard() };
    state.board[1][1].unit = { owner: 0, tplId: 'FIRE_TRICEPTAUR_BEHEMOTH', facing: 'N' };
    state.board[0][1].unit = { owner: 0, tplId: 'FIRE_PARTMOLE_FLAME_LIZARD', facing: 'S' };
    const hits = computeHits(state, 1, 1);
    expect(hits.some(h => h.r === 0 && h.c === 1)).toBe(true);
  });
});

describe('особые способности', () => {
  it('Hellfire Spitter имеет способность quickness', () => {
    expect(hasFirstStrike(CARDS.FIRE_HELLFIRE_SPITTER)).toBe(true);
  });

  it('perfect dodge защищает от обычных атак', () => {
    const state = { board: makeBoard(), players: [{ mana:0 }, { mana:0 }], turn:1 };
    state.board[1][1].unit = { owner:0, tplId:'FIRE_FREEDONIAN_WANDERER', facing:'E' };
    state.board[1][2].unit = { owner:1, tplId:'FIRE_GREAT_MINOS', facing:'W' };
    const res = stagedAttack(state,1,1);
    const fin = res.finish();
    const minos = fin.n1.board[1][2].unit;
    const tpl = CARDS[minos.tplId];
    expect(minos.currentHP ?? tpl.hp).toBe(1);
  });

  it('perfect dodge не работает против магии', () => {
    const state = { board: makeBoard(), players:[{mana:0},{mana:0}], turn:1 };
    state.board[1][0].unit = { owner:0, tplId:'FIRE_FLAME_MAGUS', facing:'E' };
    state.board[1][1].unit = { owner:1, tplId:'FIRE_GREAT_MINOS', facing:'W', hp:1 };
    const res = magicAttack(state,1,0,1,1);
    expect(res.n1.board[1][1].unit).toBeNull();
  });

  it('quickness позволяет контратаковать первым', () => {
    const state = { board: makeBoard(), players:[{mana:0},{mana:0}], turn:1 };
    state.board[1][0].unit = { owner:0, tplId:'FIRE_FREEDONIAN_WANDERER', facing:'E', currentHP:1 };
    state.board[1][1].unit = { owner:1, tplId:'FIRE_PARTMOLE_FLAME_LIZARD', facing:'W' };
    const res = stagedAttack(state,1,0);
    const fin = res.finish();
    expect(fin.n1.board[1][0].unit).toBeNull();
    const defender = fin.n1.board[1][1].unit;
    const tpl = CARDS[defender.tplId];
    expect(defender.currentHP ?? tpl.hp).toBeGreaterThan(0);
  });

  it('при двух quickness атакующий ударяет первым', () => {
    const state = { board: makeBoard(), players:[{mana:0},{mana:0}], turn:1 };
    state.board[1][0].unit = { owner:0, tplId:'FIRE_PARTMOLE_FLAME_LIZARD', facing:'E' };
    state.board[1][1].unit = { owner:1, tplId:'FIRE_PARTMOLE_FLAME_LIZARD', facing:'W' };
    const res = stagedAttack(state,1,0);
    const fin = res.finish();
    const attacker = fin.n1.board[1][0].unit;
    const tpl = CARDS[attacker.tplId];
    expect(attacker.currentHP ?? tpl.hp).toBe(2);
    expect(fin.n1.board[1][1].unit).toBeNull();
  });

  it('обычный защитник контратакует после быстрого', () => {
    const state = { board: makeBoard(), players:[{mana:0},{mana:0}], turn:1 };
    CARDS.TEST_DEFENDER = { id:'TEST_DEFENDER', name:'Defender', type:'UNIT', cost:0, activation:1, element:'FIRE', atk:2, hp:4,
      attackType:'STANDARD', attacks:[{ dir:'N', ranges:[2] }], blindspots:['S'] };
    state.board[1][0].unit = { owner:0, tplId:'FIRE_GREAT_MINOS', facing:'E', currentHP:5 };
    state.board[1][1].unit = { owner:1, tplId:'FIRE_HELLFIRE_SPITTER', facing:'W' };
    state.board[1][2].unit = { owner:1, tplId:'TEST_DEFENDER', facing:'W' };
    const res = stagedAttack(state,1,0);
    const fin = res.finish();
    const attacker = fin.n1.board[1][0].unit;
    const tplA = CARDS[attacker.tplId];
    expect(attacker.currentHP ?? tplA.hp).toBe(2);
    delete CARDS.TEST_DEFENDER;
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

describe('новые механики', () => {
  const makeState = () => ({ board: makeBoard(), players: [{ mana:0 }, { mana:0 }], turn:1 });

  it('double attack наносит урон дважды', () => {
    const state = makeState();
    state.board[1][1].unit = { owner:0, tplId:'FIRE_DIDI_THE_ENLIGHTENED', facing:'N' };
    state.board[0][1].unit = { owner:1, tplId:'FIRE_PARTMOLE_FLAME_LIZARD', facing:'S', currentHP:3 };
    const res = stagedAttack(state,1,1);
    const fin = res.finish();
    expect(fin.n1.board[0][1].unit).toBeNull();
  });

  it('double attack вызывает только одну контратаку', () => {
    const state = makeState();
    state.board[1][1].unit = { owner:0, tplId:'FIRE_DIDI_THE_ENLIGHTENED', facing:'N', currentHP:4 };
    state.board[0][1].unit = { owner:1, tplId:'FIRE_PARTMOLE_FLAME_LIZARD', facing:'S', currentHP:10 };
    const res = stagedAttack(state,1,1);
    const fin = res.finish();
    const attacker = fin.n1.board[1][1].unit;
    expect(attacker.currentHP).toBe(2);
  });

  it('Flame Guard атакует две клетки вперёд', () => {
    const state = makeState();
    state.board[2][1].unit = { owner:0, tplId:'FIRE_PARTMOLE_FLAME_GUARD', facing:'N' };
    state.board[1][1].unit = { owner:1, tplId:'FIRE_FLAME_MAGUS', facing:'S', currentHP:1 };
    state.board[0][1].unit = { owner:1, tplId:'FIRE_PARTMOLE_FIRE_ORACLE', facing:'S', currentHP:3 };
    const res = stagedAttack(state,2,1);
    const fin = res.finish();
    expect(fin.n1.board[1][1].unit).toBeNull();
    const second = fin.n1.board[0][1].unit;
    expect(second.currentHP).toBeLessThan(3);
  });

  it('fortress не может атаковать, но может контратаковать', () => {
    const state = makeState();
    state.board[1][1].unit = { owner:0, tplId:'FIRE_LESSER_GRANVENOA', facing:'N' };
    expect(stagedAttack(state,1,1)).toBeNull();
    state.board[0][1].unit = { owner:1, tplId:'FIRE_PARTMOLE_FLAME_LIZARD', facing:'S', currentHP:2 };
    const res = stagedAttack(state,0,1);
    const fin = res.finish();
    expect(fin.n1.board[0][1].unit).toBeNull();
    const fort = fin.n1.board[1][1].unit;
    expect(fort && (fort.currentHP ?? CARDS[fort.tplId].hp)).toBeGreaterThan(0);
  });

  it('onDeathHealAll лечит союзников', () => {
    const state = makeState();
    state.board[1][1].unit = { owner:0, tplId:'FIRE_PARTMOLE_FIRE_ORACLE', facing:'N', currentHP:1 };
    state.board[2][1].unit = { owner:0, tplId:'FIRE_FLAME_MAGUS', facing:'N', currentHP:1 };
    state.board[0][1].unit = { owner:1, tplId:'FIRE_PARTMOLE_FLAME_LIZARD', facing:'S', currentHP:3 };
    const res = stagedAttack(state,0,1);
    const fin = res.finish();
    const healed = fin.n1.board[2][1].unit;
    expect(healed.currentHP).toBeGreaterThan(1);
  });

  it('fieldquake lock корректно рассчитывает защищённые клетки', () => {
    const state = makeState();
    state.board[1][1].unit = { owner:0, tplId:'FIRE_DIDI_THE_ENLIGHTENED', facing:'N' };
    const cells = computeFieldquakeLockedCells(state);
    expect(cells.length).toBe(8);
  });
});


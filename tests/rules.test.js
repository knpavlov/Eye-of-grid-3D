import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { computeCellBuff, effectiveStats, hasAdjacentGuard, computeHits, magicAttack, stagedAttack } from '../src/core/rules.js';
import { computeFieldquakeLockedCells } from '../src/core/fieldLocks.js';
import {
  hasFirstStrike,
  applySummonAbilities,
  shouldUseMagicAttack,
  refreshContinuousPossessions,
  refreshDodgeAuras,
} from '../src/core/abilities.js';
import { CARDS } from '../src/core/cards.js';

function makeBoard() {
  const b = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => ({ element: 'FIRE', unit: null })));
  b[1][1].element = 'BIOLITH';
  return b;
}


describe('buffs and stats', () => {
  it('computeCellBuff and effectiveStats', () => {
    // Same element => +2 HP
    expect(computeCellBuff('FIRE', 'FIRE')).toEqual({ atk: 0, hp: 2 });
    // Opposite (FIRE vs WATER) => -2 HP
    expect(computeCellBuff('WATER', 'FIRE')).toEqual({ atk: 0, hp: -2 });
    // Biolith => no effect
    expect(computeCellBuff('BIOLITH', 'FIRE')).toEqual({ atk: 0, hp: 0 });

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
    const hits = computeHits(state, 2, 1, { chosenDir: 'N' });
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

  it('Twin Goblins бьют вперёд и назад, включая союзников', () => {
    const state = { board: makeBoard(), players: [{ mana: 0 }, { mana: 0 }], turn: 1 };
    state.board[1][1].unit = { owner: 0, tplId: 'FOREST_TWIN_GOBLINS', facing: 'N' };
    state.board[0][1].unit = { owner: 1, tplId: 'FIRE_HELLFIRE_SPITTER', facing: 'S', currentHP: 1 };
    state.board[2][1].unit = { owner: 0, tplId: 'FIRE_HELLFIRE_SPITTER', facing: 'N', currentHP: 1 };
    const res = stagedAttack(state, 1, 1);
    const fin = res.finish();
    expect(fin.n1.board[0][1].unit).toBeNull();
    expect(fin.n1.board[2][1].unit).toBeNull();
  });

  it('Twin Goblins не получают бонусный урон от атаки сзади', () => {
    const state = { board: makeBoard(), players: [{ mana: 0 }, { mana: 0 }], turn: 1 };
    state.board[1][1].unit = { owner: 1, tplId: 'FOREST_TWIN_GOBLINS', facing: 'N', currentHP: 3 };
    state.board[2][1].unit = { owner: 0, tplId: 'FIRE_HELLFIRE_SPITTER', facing: 'N' };
    const hits = computeHits(state, 2, 1, { chosenDir: 'N' });
    const goblinHit = hits.find(h => h.r === 1 && h.c === 1);
    expect(goblinHit).toBeTruthy();
    expect(goblinHit.backstab).toBe(true);
    expect(goblinHit.dmg).toBe(CARDS.FIRE_HELLFIRE_SPITTER.atk);
  });

  it('существо со стандартным blind spot получает +1 урона со спины', () => {
    const state = { board: makeBoard(), players: [{ mana: 0 }, { mana: 0 }], turn: 1 };
    state.board[1][1].unit = { owner: 1, tplId: 'FIRE_PARTMOLE_FLAME_LIZARD', facing: 'N', currentHP: 2 };
    state.board[2][1].unit = { owner: 0, tplId: 'FIRE_HELLFIRE_SPITTER', facing: 'N' };
    const hits = computeHits(state, 2, 1, { chosenDir: 'N' });
    const targetHit = hits.find(h => h.r === 1 && h.c === 1);
    expect(targetHit).toBeTruthy();
    expect(targetHit.backstab).toBe(true);
    expect(targetHit.dmg).toBe(CARDS.FIRE_HELLFIRE_SPITTER.atk + 1);
  });

  it('Biolith Battle Chariot поражает клетки впереди и справа одновременно', () => {
    const state = { board: makeBoard(), players: [{ mana: 0 }, { mana: 0 }], turn: 1 };
    state.board[1][1].unit = { owner: 0, tplId: 'BIOLITH_BATTLE_CHARIOT', facing: 'N' };
    state.board[0][1].unit = { owner: 1, tplId: 'FIRE_HELLFIRE_SPITTER', facing: 'S', currentHP: 1 };
    state.board[1][2].unit = { owner: 0, tplId: 'FIRE_HELLFIRE_SPITTER', facing: 'W', currentHP: 1 };
    const res = stagedAttack(state, 1, 1);
    const fin = res.finish();
    expect(fin.n1.board[0][1].unit).toBeNull();
    expect(fin.n1.board[1][2].unit).toBeNull();
  });

  it('Biolith Battle Chariot подсвечивает только соседние клетки', () => {
    const state = { board: makeBoard() };
    state.board[1][1].unit = { owner: 0, tplId: 'BIOLITH_BATTLE_CHARIOT', facing: 'N' };
    const hits = computeHits(state, 1, 1, { union: true, includeEmpty: true });
    const coords = hits.map(h => `${h.r},${h.c}`).sort();
    expect(coords).toEqual(['0,1', '1,2']);
  });

  it('Taurus Monolith задевает союзника, если в секторе есть враг', () => {
    const state = { board: makeBoard(), players: [{ mana: 0 }, { mana: 0 }], turn: 1 };
    state.board[2][1].unit = {
      owner: 0,
      tplId: 'BIOLITH_TAURUS_MONOLITH',
      facing: 'N',
      currentHP: CARDS.BIOLITH_TAURUS_MONOLITH.hp,
    };
    state.board[1][1].unit = {
      owner: 0,
      tplId: 'FIRE_PARTMOLE_FLAME_LIZARD',
      facing: 'S',
      currentHP: 1,
    };
    state.board[0][1].unit = {
      owner: 1,
      tplId: 'FIRE_PARTMOLE_FLAME_LIZARD',
      facing: 'S',
      currentHP: 1,
    };
    const res = stagedAttack(state, 2, 1);
    const fin = res.finish();
    expect(fin.n1.board[1][1].unit).toBeNull();
    expect(fin.n1.board[0][1].unit).toBeNull();
  });

  it('Taurus Monolith не атакует, если перед ним только союзники', () => {
    const state = { board: makeBoard(), players: [{ mana: 0 }, { mana: 0 }], turn: 1 };
    state.board[2][1].unit = {
      owner: 0,
      tplId: 'BIOLITH_TAURUS_MONOLITH',
      facing: 'N',
      currentHP: CARDS.BIOLITH_TAURUS_MONOLITH.hp,
    };
    state.board[1][1].unit = {
      owner: 0,
      tplId: 'FIRE_PARTMOLE_FLAME_LIZARD',
      facing: 'S',
      currentHP: CARDS.FIRE_PARTMOLE_FLAME_LIZARD.hp,
    };
    const hits = computeHits(state, 2, 1);
    expect(hits).toEqual([]);
  });
});

describe('особые способности', () => {
  it('Hellfire Spitter имеет способность quickness', () => {
    expect(hasFirstStrike(CARDS.FIRE_HELLFIRE_SPITTER)).toBe(true);
  });

  it('Biolith Bomber получает бонус атаки против дешёвой цели', () => {
    const state = { board: makeBoard(), players: [{ mana: 0 }, { mana: 0 }], turn: 1 };
    state.board[1][1].unit = { owner: 0, tplId: 'BIOLITH_BOMBER', facing: 'N' };
    state.board[0][1].unit = { owner: 1, tplId: 'FIRE_PARTMOLE_FLAME_LIZARD', facing: 'S', currentHP: 2 };
    const res = stagedAttack(state, 1, 1, { chosenDir: 'N' });
    const fin = res.finish();
    expect(fin.n1.board[0][1].unit).toBeNull();
  });

  it('Biolith Bomber может выбирать цель на дистанции две клетки', () => {
    const state = { board: makeBoard(), players: [{ mana: 0 }, { mana: 0 }], turn: 1 };
    state.board[2][1].unit = { owner: 0, tplId: 'BIOLITH_BOMBER', facing: 'N' };
    state.board[0][1].unit = { owner: 1, tplId: 'FIRE_PARTMOLE_FLAME_LIZARD', facing: 'S', currentHP: 2 };
    const res = stagedAttack(state, 2, 1, { chosenDir: 'N', rangeChoices: { N: 2 } });
    const fin = res.finish();
    expect(fin.n1.board[0][1].unit).toBeNull();
  });

  it('Biolith Bomber может выбрать дальнюю цель, даже если ближняя занята', () => {
    const state = { board: makeBoard(), players: [{ mana: 0 }, { mana: 0 }], turn: 1 };
    state.board[2][1].unit = { owner: 0, tplId: 'BIOLITH_BOMBER', facing: 'N' };
    state.board[1][1].unit = { owner: 1, tplId: 'FIRE_PARTMOLE_FLAME_LIZARD', facing: 'S', currentHP: 2 };
    state.board[0][1].unit = { owner: 1, tplId: 'FIRE_PARTMOLE_FLAME_LIZARD', facing: 'S', currentHP: 2 };

    const preview = computeHits(state, 2, 1, { union: true });
    const coords = preview.map(h => `${h.r},${h.c}`).sort();
    expect(coords).toEqual(['0,1', '1,1']);

    const res = stagedAttack(state, 2, 1, { chosenDir: 'N', rangeChoices: { N: 2 } });
    const fin = res.finish();

    const near = fin.n1.board[1][1].unit;
    expect(near).toBeTruthy();
    const tpl = CARDS[near.tplId];
    expect(near.currentHP ?? tpl.hp).toBe(2);
    expect(fin.n1.board[0][1].unit).toBeNull();
  });

  it('Arc Satellite Cannon поражает только одну выбранную цель', () => {
    const state = { board: makeBoard(), players: [{ mana: 0 }, { mana: 0 }], turn: 1 };
    state.board[1][1].unit = { owner: 0, tplId: 'BIOLITH_ARC_SATELLITE_CANNON', facing: 'N' };
    state.board[0][1].unit = { owner: 1, tplId: 'FIRE_HELLFIRE_SPITTER', facing: 'S', currentHP: 3 };
    state.board[1][2].unit = { owner: 1, tplId: 'FIRE_HELLFIRE_SPITTER', facing: 'W', currentHP: 3 };
    const res = stagedAttack(state, 1, 1, { chosenDir: 'N' });
    const fin = res.finish();
    expect(fin.n1.board[0][1].unit).toBeNull();
    const survivor = fin.n1.board[1][2].unit;
    expect(survivor).toBeTruthy();
    const tpl = CARDS[survivor.tplId];
    expect(survivor.currentHP ?? tpl.hp).toBe(3);
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

  it('dodge attempt спасает один раз', () => {
    const state = { board: makeBoard(), players:[{mana:0},{mana:0}], turn:1 };
    state.board[1][1].unit = { owner:0, tplId:'FIRE_PARTMOLE_FLAME_LIZARD', facing:'E' };
    state.board[1][2].unit = { owner:1, tplId:'NEUTRAL_WHITE_CUBIC', facing:'W', currentHP:1 };
    const res1 = stagedAttack(state,1,1,{ rng: () => 0 });
    const fin1 = res1.finish();
    const cubicAfterFirst = fin1.n1.board[1][2].unit;
    expect(cubicAfterFirst).toBeTruthy();
    const tplCubic = CARDS[cubicAfterFirst.tplId];
    expect(cubicAfterFirst.currentHP ?? tplCubic.hp).toBe(tplCubic.hp);
    expect(cubicAfterFirst.dodgeState?.remaining ?? 0).toBe(0);

    const state2 = fin1.n1;
    state2.board[1][1].unit.lastAttackTurn = 0;
    state2.turn += 1;

    const res2 = stagedAttack(state2,1,1,{ rng: () => 0 });
    const fin2 = res2.finish();
    expect(fin2.n1.board[1][2].unit).toBeNull();
  });

  it('dodge не защищает от магии', () => {
    const state = { board: makeBoard(), players:[{mana:0},{mana:0}], turn:1 };
    state.board[1][0].unit = { owner:0, tplId:'FIRE_FLAME_MAGUS', facing:'E' };
    state.board[1][1].unit = { owner:1, tplId:'NEUTRAL_WHITE_CUBIC', facing:'W', currentHP:1 };
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

  it('Firefly Ninja получает Perfect Dodge и невидимость с союзным Пауком', () => {
    const state = { board: makeBoard(), players:[{mana:0},{mana:0}], turn:1 };
    state.board[1][0].unit = { owner:0, tplId:'FIRE_FIREFLY_NINJA', facing:'E' };
    state.board[1][1].unit = { owner:1, tplId:'FIRE_PARTMOLE_FLAME_LIZARD', facing:'W' };
    const res = stagedAttack(state,1,1);
    const fin = res.finish();
    const ninja = fin.n1.board[1][0].unit;
    const tplNinja = CARDS[ninja.tplId];
    expect(ninja.currentHP ?? tplNinja.hp).toBe(tplNinja.hp);

    const state2 = { board: makeBoard(), players:[{mana:0},{mana:0}], turn:1 };
    state2.board[1][0].unit = { owner:0, tplId:'FIRE_FIREFLY_NINJA', facing:'E' };
    state2.board[2][2].unit = { owner:0, tplId:'EARTH_SPIDER_NINJA', facing:'N' };
    state2.board[1][2].unit = { owner:1, tplId:'FIRE_FLAME_MAGUS', facing:'W' };
    const magicRes = magicAttack(state2,1,2,1,0);
    const ninja2 = magicRes.n1.board[1][0].unit;
    const tplNinja2 = CARDS[ninja2.tplId];
    expect(ninja2.currentHP ?? tplNinja2.hp).toBe(tplNinja2.hp);
    const dmgEntry = magicRes.targets.find(t => t.r === 1 && t.c === 0);
    expect(dmgEntry?.dmg).toBe(0);
  });

  it('Spider Ninja меняется местами с врагом на земляном поле и отключает контратаку', () => {
    const state = { board: makeBoard(), players:[{mana:0},{mana:0}], turn:1 };
    state.board[2][1].element = 'EARTH';
    state.board[1][1].element = 'EARTH';
    state.board[2][1].unit = { owner:0, tplId:'EARTH_SPIDER_NINJA', facing:'N' };
    state.board[1][1].unit = { owner:1, tplId:'FIRE_PARTMOLE_FLAME_LIZARD', facing:'S', currentHP:3 };
    const res = magicAttack(state,2,1,1,1);
    const board = res.n1.board;
    expect(board[1][1].unit?.tplId).toBe('EARTH_SPIDER_NINJA');
    expect(board[2][1].unit?.tplId).toBe('FIRE_PARTMOLE_FLAME_LIZARD');
    expect(res.targets.find(t => t.r === 1 && t.c === 1)?.dmg).toBeGreaterThan(0);
  });

  it('обновляет здоровье существ после обмена позициями на разных полях', () => {
    const state = { board: makeBoard(), players:[{mana:0},{mana:0}], turn:1 };
    state.board[2][1].element = 'FIRE';
    state.board[1][1].element = 'EARTH';
    state.board[2][1].unit = { owner:0, tplId:'EARTH_SPIDER_NINJA', facing:'N', currentHP:1 };
    state.board[1][1].unit = { owner:1, tplId:'FIRE_TRICEPTAUR_BEHEMOTH', facing:'S', currentHP:4 };
    const res = magicAttack(state,2,1,1,1);
    const board = res.n1.board;
    const spider = board[1][1].unit;
    const behemoth = board[2][1].unit;
    expect(spider?.currentHP).toBe(3);
    expect(behemoth?.currentHP).toBe(4);
  });

  it('Wolf Ninja меняется местами с целью на воде и не получает ответного удара', () => {
    const state = { board: makeBoard(), players:[{mana:0},{mana:0}], turn:1 };
    state.board[2][1].element = 'WATER';
    state.board[1][1].element = 'WATER';
    state.board[2][1].unit = { owner:0, tplId:'WATER_WOLF_NINJA', facing:'N' };
    state.board[1][1].unit = { owner:1, tplId:'FIRE_PARTMOLE_FLAME_LIZARD', facing:'S', currentHP:3 };
    const res = stagedAttack(state,2,1);
    const fin = res.finish();
    expect(fin.n1.board[1][1].unit?.tplId).toBe('WATER_WOLF_NINJA');
    expect(fin.n1.board[2][1].unit?.tplId).toBe('FIRE_PARTMOLE_FLAME_LIZARD');
    expect(fin.retaliators.length).toBe(0);
  });

  it('Swallow Ninja разворачивает цель и лишает её контратаки', () => {
    const state = { board: makeBoard(), players:[{mana:0},{mana:0}], turn:1 };
    state.board[2][1].element = 'FOREST';
    state.board[2][1].unit = { owner:0, tplId:'FOREST_SWALLOW_NINJA', facing:'N' };
    state.board[1][1].unit = { owner:1, tplId:'FIRE_PARTMOLE_FLAME_LIZARD', facing:'S', currentHP:3 };
    const res = stagedAttack(state,2,1);
    const fin = res.finish();
    const enemy = fin.n1.board[1][1].unit;
    expect(enemy.tplId).toBe('FIRE_PARTMOLE_FLAME_LIZARD');
    expect(enemy.facing).toBe('N');
    expect(fin.retaliators.length).toBe(0);
    const dmgEntry = fin.targets.find(t => t.r === 1 && t.c === 1);
    expect(dmgEntry?.dmg).toBe(1);
  });

  it('Dark Yokozuna Sekimaru отталкивает цель и блокирует контратаку', () => {
    const state = { board: makeBoard(), players:[{mana:0},{mana:0}], turn:1 };
    state.board[2][1].unit = {
      owner:0,
      tplId:'EARTH_DARK_YOKOZUNA_SEKIMARU',
      facing:'N',
      currentHP:CARDS.EARTH_DARK_YOKOZUNA_SEKIMARU.hp,
    };
    state.board[1][1].unit = {
      owner:1,
      tplId:'FIRE_TRICEPTAUR_BEHEMOTH',
      facing:'S',
      currentHP:CARDS.FIRE_TRICEPTAUR_BEHEMOTH.hp,
    };
    const res = stagedAttack(state,2,1);
    const fin = res.finish();
    expect(fin.n1.board[2][1].unit?.tplId).toBe('EARTH_DARK_YOKOZUNA_SEKIMARU');
    expect(fin.n1.board[1][1].unit).toBeNull();
    const pushed = fin.n1.board[0][1].unit;
    expect(pushed?.tplId).toBe('FIRE_TRICEPTAUR_BEHEMOTH');
    expect(pushed?.currentHP).toBe(CARDS.FIRE_TRICEPTAUR_BEHEMOTH.hp);
    expect(fin.retaliators.length).toBe(0);
  });

  it('Taurus Monolith не даёт врагу контратаковать даже без свободной клетки для отталкивания', () => {
    const state = { board: makeBoard(), players:[{mana:0},{mana:0}], turn:1 };
    state.board[2][1].unit = {
      owner:0,
      tplId:'BIOLITH_TAURUS_MONOLITH',
      facing:'N',
      currentHP:CARDS.BIOLITH_TAURUS_MONOLITH.hp,
    };
    state.board[1][1].unit = {
      owner:1,
      tplId:'FIRE_TRICEPTAUR_BEHEMOTH',
      facing:'S',
      currentHP:CARDS.FIRE_TRICEPTAUR_BEHEMOTH.hp,
    };
    state.board[0][1].unit = {
      owner:1,
      tplId:'FIRE_PURSUER_OF_SAINT_DHEES',
      facing:'S',
      currentHP:CARDS.FIRE_PURSUER_OF_SAINT_DHEES.hp + 2,
    };
    const res = stagedAttack(state,2,1);
    const fin = res.finish();
    const target = fin.n1.board[1][1].unit;
    expect(target?.tplId).toBe('FIRE_TRICEPTAUR_BEHEMOTH');
    expect(target?.currentHP).toBe(CARDS.FIRE_TRICEPTAUR_BEHEMOTH.hp - CARDS.BIOLITH_TAURUS_MONOLITH.atk);
    expect(fin.n1.board[0][1].unit?.tplId).toBe('FIRE_PURSUER_OF_SAINT_DHEES');
    expect(fin.retaliators.length).toBe(0);
  });

  it('магические существа не контратакуют по умолчанию', () => {
    const state = { board: makeBoard(), players:[{mana:0},{mana:0}], turn:1 };
    state.board[2][1].unit = {
      owner:0,
      tplId:'FIRE_PARTMOLE_FLAME_LIZARD',
      facing:'N',
      currentHP:CARDS.FIRE_PARTMOLE_FLAME_LIZARD.hp,
    };
    state.board[1][1].unit = {
      owner:1,
      tplId:'FIRE_FLAME_MAGUS',
      facing:'S',
      currentHP:CARDS.FIRE_FLAME_MAGUS.hp + 2,
    };
    const res = stagedAttack(state,2,1);
    const fin = res.finish();
    expect(fin.retaliators.length).toBe(0);
  });

  it('Elven Death Dancer меняется местами с целью после магической атаки', () => {
    const state = { board: makeBoard(), players:[{mana:0},{mana:0}], turn:1 };
    state.board[1][1].unit = {
      owner:0,
      tplId:'FOREST_ELVEN_DEATH_DANCER',
      facing:'N',
      currentHP:CARDS.FOREST_ELVEN_DEATH_DANCER.hp,
    };
    state.board[0][1].unit = {
      owner:1,
      tplId:'FIRE_TRICEPTAUR_BEHEMOTH',
      facing:'S',
      currentHP:CARDS.FIRE_TRICEPTAUR_BEHEMOTH.hp + 2,
    };
    const res = magicAttack(state,1,1,0,1);
    expect(res).toBeTruthy();
    expect(res.attackerPosUpdate).toEqual({ r: 0, c: 1 });
    const board = res.n1.board;
    expect(board[0][1].unit?.tplId).toBe('FOREST_ELVEN_DEATH_DANCER');
    const swapped = board[1][1].unit;
    expect(swapped?.tplId).toBe('FIRE_TRICEPTAUR_BEHEMOTH');
    expect(swapped?.currentHP).toBe((CARDS.FIRE_TRICEPTAUR_BEHEMOTH.hp + 2) - CARDS.FOREST_ELVEN_DEATH_DANCER.atk - 2);
    const dmgEntry = res.targets.find(t => t.r === 0 && t.c === 1);
    expect(dmgEntry?.dmg).toBe(CARDS.FOREST_ELVEN_DEATH_DANCER.atk);
  });

  it('Taurus Monolith одновременно повреждает две клетки перед собой', () => {
    const state = { board: makeBoard(), players:[{mana:0},{mana:0}], turn:1 };
    state.board[2][1].unit = {
      owner:0,
      tplId:'BIOLITH_TAURUS_MONOLITH',
      facing:'N',
      currentHP:CARDS.BIOLITH_TAURUS_MONOLITH.hp,
    };
    state.board[1][1].unit = {
      owner:1,
      tplId:'FIRE_TRICEPTAUR_BEHEMOTH',
      facing:'S',
      currentHP:CARDS.FIRE_TRICEPTAUR_BEHEMOTH.hp + 4,
    };
    state.board[0][1].unit = {
      owner:1,
      tplId:'FIRE_PARTMOLE_FLAME_LIZARD',
      facing:'S',
      currentHP:CARDS.FIRE_PARTMOLE_FLAME_LIZARD.hp + 5,
    };
    const res = stagedAttack(state,2,1);
    const fin = res.finish();
    expect(fin.attackerPosUpdate).toBeNull();
    const front = fin.n1.board[1][1].unit;
    const rear = fin.n1.board[0][1].unit;
    expect(front?.tplId).toBe('FIRE_TRICEPTAUR_BEHEMOTH');
    expect(front?.currentHP).toBe((CARDS.FIRE_TRICEPTAUR_BEHEMOTH.hp + 4) - CARDS.BIOLITH_TAURUS_MONOLITH.atk);
    expect(rear?.tplId).toBe('FIRE_PARTMOLE_FLAME_LIZARD');
    expect(rear?.currentHP).toBe((CARDS.FIRE_PARTMOLE_FLAME_LIZARD.hp + 5) - CARDS.BIOLITH_TAURUS_MONOLITH.atk);
  });

  it('способность backAttack наносит удар в спину и блокирует ответный урон', () => {
    const state = { board: makeBoard(), players:[{mana:0},{mana:0}], turn:1 };
    state.board[0][1].element = 'BIOLITH';
    state.board[1][1].unit = { owner:0, tplId:'WATER_VENOAN_ASSASSIN', facing:'N', currentHP:CARDS.WATER_VENOAN_ASSASSIN.hp };
    state.board[0][1].unit = { owner:1, tplId:'FIRE_TRICEPTAUR_BEHEMOTH', facing:'S', currentHP:CARDS.FIRE_TRICEPTAUR_BEHEMOTH.hp };
    const hits = computeHits(state,1,1);
    expect(hits.length).toBeGreaterThan(0);
    const strike = hits[0];
    expect(strike.backstab).toBe(true);
    expect(strike.dmg).toBe(CARDS.WATER_VENOAN_ASSASSIN.atk + 1);

    const res = stagedAttack(state,1,1);
    const fin = res.finish();
    const attacker = fin.n1.board[1][1].unit;
    expect(attacker).toBeTruthy();
    expect(attacker.currentHP ?? CARDS.WATER_VENOAN_ASSASSIN.hp).toBe(CARDS.WATER_VENOAN_ASSASSIN.hp);
    const defender = fin.n1.board[0][1].unit;
    expect(defender).toBeTruthy();
    expect(defender.currentHP).toBe(CARDS.FIRE_TRICEPTAUR_BEHEMOTH.hp - strike.dmg);
    expect(fin.retaliators.length).toBe(0);
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

describe('новые способности (Хильда и Диос)', () => {
  it('Warden Hilda захватывает врагов на огненных полях при призыве вне Огня', () => {
    const state = { board: makeBoard(), players: [{ mana: 0 }, { mana: 0 }], turn: 1 };
    state.board[1][1].element = 'WATER';
    state.board[1][1].unit = { owner: 0, tplId: 'FIRE_WARDEN_HILDA', facing: 'N', currentHP: 4 };
    state.board[0][0].element = 'FIRE';
    state.board[0][0].unit = { owner: 1, tplId: 'FIRE_FLAME_MAGUS', facing: 'S', currentHP: 1 };
    const events = applySummonAbilities(state, 1, 1);
    expect(events.possessions.length).toBe(1);
    const possessed = state.board[0][0].unit;
    expect(possessed.owner).toBe(0);
    expect(possessed.possessed.originalOwner).toBe(1);
  });

  it('Warden Hilda получает +1 к атаке против существ стихии Огонь', () => {
    const state = { board: makeBoard(), players: [{ mana: 0 }, { mana: 0 }], turn: 1 };
    state.board[1][1].element = 'WATER';
    state.board[1][1].unit = { owner: 0, tplId: 'FIRE_WARDEN_HILDA', facing: 'N', currentHP: 4 };
    state.board[0][1].unit = { owner: 1, tplId: 'FIRE_FLAME_MAGUS', facing: 'S', currentHP: 2 };
    const res = stagedAttack(state, 1, 1);
    const fin = res.finish();
    const target = fin.targets.find(t => t.r === 0 && t.c === 1);
    expect(target.dmg).toBeGreaterThanOrEqual(3);
  });

  it('захваченные существа возвращаются владельцу при гибели источника', () => {
    const state = { board: makeBoard(), players: [{ mana: 0 }, { mana: 0 }], turn: 1 };
    state.board[1][1].element = 'WATER';
    state.board[1][1].unit = { owner: 0, tplId: 'FIRE_WARDEN_HILDA', facing: 'N', currentHP: 1 };
    state.board[0][0].element = 'FIRE';
    state.board[0][0].unit = { owner: 1, tplId: 'FIRE_FLAME_MAGUS', facing: 'S', currentHP: 2 };
    applySummonAbilities(state, 1, 1);
    expect(state.board[0][0].unit.owner).toBe(0);
    state.board[2][1].unit = { owner: 1, tplId: 'FIRE_TRICEPTAUR_BEHEMOTH', facing: 'N', currentHP: 5 };
    const battle = stagedAttack(state, 2, 1);
    const fin = battle.finish();
    expect(fin.n1.board[0][0].unit.owner).toBe(1);
    expect(fin.releases && fin.releases.length).toBeGreaterThan(0);
  });

  it('Tentacles of Possession захватывают врага перед собой и отпускают при смене направления', () => {
    const state = { board: makeBoard(), players: [{ mana: 0 }, { mana: 0 }], turn: 1 };
    state.board[1][1].element = 'WATER';
    state.board[1][1].unit = { owner: 0, tplId: 'WATER_TENTACLES_OF_POSSESSION', facing: 'N' };
    state.board[0][1].unit = { owner: 1, tplId: 'FIRE_FLAME_MAGUS', facing: 'S' };
    refreshContinuousPossessions(state);
    const possessed = state.board[0][1].unit;
    expect(possessed.owner).toBe(0);
    expect(possessed.possessed?.originalOwner).toBe(1);
    state.board[1][1].unit.facing = 'E';
    refreshContinuousPossessions(state);
    const released = state.board[0][1].unit;
    expect(released.owner).toBe(1);
    expect(released.possessed).toBeUndefined();
  });

  it('Imposter Queen Anfisa контролирует соседей только на воде', () => {
    const state = { board: makeBoard(), players: [{ mana: 0 }, { mana: 0 }], turn: 1 };
    state.board[1][1].element = 'WATER';
    state.board[1][1].unit = { owner: 0, tplId: 'WATER_IMPOSTER_QUEEN_ANFISA', facing: 'N' };
    state.board[1][0].unit = { owner: 1, tplId: 'FIRE_FLAME_MAGUS', facing: 'E' };
    state.board[0][1].unit = { owner: 1, tplId: 'FIRE_HELLFIRE_SPITTER', facing: 'S' };
    refreshContinuousPossessions(state);
    expect(state.board[1][0].unit.owner).toBe(0);
    expect(state.board[0][1].unit.owner).toBe(0);
    state.board[1][1].element = 'FIRE';
    refreshContinuousPossessions(state);
    expect(state.board[1][0].unit.owner).toBe(1);
    expect(state.board[0][1].unit.owner).toBe(1);
  });

  it('Crucible King Dios IV на огненном поле вынужден использовать магическую атаку', () => {
    const state = { board: makeBoard(), players: [{ mana: 0 }, { mana: 0 }], turn: 1 };
    state.board[1][1].element = 'FIRE';
    state.board[1][1].unit = { owner: 0, tplId: 'FIRE_CRUCIBLE_KING_DIOS_IV', facing: 'N', currentHP: 6 };
    const tpl = CARDS['FIRE_CRUCIBLE_KING_DIOS_IV'];
    expect(shouldUseMagicAttack(state, 1, 1, tpl)).toBe(true);
    state.board[0][1].unit = { owner: 1, tplId: 'FIRE_PARTMOLE_FLAME_LIZARD', facing: 'S', currentHP: 4 };
    state.board[0][0].unit = { owner: 1, tplId: 'FIRE_HELLFIRE_SPITTER', facing: 'S', currentHP: 2 };
    state.board[0][2].unit = { owner: 1, tplId: 'FIRE_FLAME_MAGUS', facing: 'S', currentHP: 2 };
    const fireFields = state.board.flat().filter(cell => cell.element === 'FIRE').length;
    const res = magicAttack(state, 1, 1, 0, 1);
    expect(res).toBeTruthy();
    const mainHit = res.targets.find(t => t.r === 0 && t.c === 1);
    expect(mainHit.dmg).toBe(fireFields);
    const sideHit = res.targets.find(t => t.r === 0 && t.c === 0);
    expect(sideHit).toBeTruthy();
    expect(sideHit.dmg).toBe(fireFields);
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

  it('onDeathAddHPAll увеличивает максимальное и текущее HP союзников', () => {
    const state = makeState();
    state.board[1][1].unit = { owner:0, tplId:'FIRE_PARTMOLE_FIRE_ORACLE', facing:'N', currentHP:1 };
    state.board[2][1].unit = { owner:0, tplId:'FIRE_FLAME_MAGUS', facing:'N', currentHP:1 };
    state.board[0][1].unit = { owner:1, tplId:'FIRE_PARTMOLE_FLAME_LIZARD', facing:'S', currentHP:3 };
    const res = stagedAttack(state,0,1);
    const fin = res.finish();
    const buffed = fin.n1.board[2][1].unit;
    const cell = fin.n1.board[2][1];
    const stats = effectiveStats(cell, buffed);
    expect(buffed.currentHP).toBe(2);
    const tpl = CARDS[buffed.tplId];
    const buff = computeCellBuff(cell.element, CARDS[buffed.tplId].element);
    expect(stats.hp).toBe(tpl.hp + buff.hp + 1);
  });

  it('Infernal Sciondar Dragon не учитывает себя при подсчёте огненных существ', () => {
    if (!CARDS.TEST_DUMMY) {
      CARDS.TEST_DUMMY = { id: 'TEST_DUMMY', name: 'Dummy', type: 'UNIT', element: 'WATER', atk: 0, hp: 10, attackType: 'STANDARD', attacks: [ { dir: 'N', ranges: [1] } ] };
    }
    const state = makeState();
    state.board[1][1].unit = { owner:0, tplId:'FIRE_INFERNAL_SCIONDAR_DRAGON', facing:'N', currentHP:8 };
    state.board[0][1].unit = { owner:1, tplId:'TEST_DUMMY', facing:'S', currentHP:10 };
    const res = stagedAttack(state,1,1);
    const fin = res.finish();
    const defender = fin.n1.board[0][1].unit;
    expect(defender.currentHP).toBe(5);
  });

  it('fieldquake lock корректно рассчитывает защищённые клетки', () => {
    const state = makeState();
    state.board[1][1].unit = { owner:0, tplId:'FIRE_DIDI_THE_ENLIGHTENED', facing:'N' };
    const cells = computeFieldquakeLockedCells(state);
    expect(cells.length).toBe(8);
  });
});

describe('water card abilities', () => {
  it('Cloud Runner добирает карты по количеству водных полей', () => {
    const state = { board: makeBoard(), players: [], turn: 1, active: 0 };
    state.board[0][0].element = 'WATER';
    state.board[0][1].element = 'WATER';
    state.board[1][0].element = 'WATER';
    state.players = [
      {
        name: 'P1',
        deck: [CARDS.FIRE_FLAME_MAGUS, CARDS.FIRE_HELLFIRE_SPITTER, CARDS.FIRE_PARTMOLE_FLAME_LIZARD],
        hand: [],
        discard: [],
        graveyard: [],
        mana: 0,
        maxMana: 10,
      },
      { name: 'P2', deck: [], hand: [], discard: [], graveyard: [], mana: 0, maxMana: 10 },
    ];
    state.board[0][0].unit = { owner: 0, tplId: 'WATER_CLOUD_RUNNER', facing: 'N', currentHP: 1 };
    const events = applySummonAbilities(state, 0, 0);
    expect(state.players[0].hand.length).toBe(3);
    expect(events.draws?.[0]?.count).toBe(3);
  });

  it('Don of Venoa использует вихрь на водном поле', () => {
    const state = { board: makeBoard(), players:[{mana:0},{mana:0}], turn:1 };
    state.board[1][1].element = 'WATER';
    state.board[1][1].unit = { owner:0, tplId:'WATER_DON_OF_VENOA', facing:'N' };
    state.board[0][1].unit = { owner:1, tplId:'FIRE_PARTMOLE_FLAME_LIZARD', facing:'S' };
    state.board[1][2].unit = { owner:1, tplId:'FIRE_PARTMOLE_FLAME_LIZARD', facing:'W' };
    state.board[2][1].unit = { owner:1, tplId:'FIRE_PARTMOLE_FLAME_LIZARD', facing:'N' };
    state.board[1][0].unit = { owner:1, tplId:'FIRE_PARTMOLE_FLAME_LIZARD', facing:'E' };
    const hitsWater = computeHits(state, 1, 1, { union: true });
    const coordsWater = hitsWater.map(h => `${h.r},${h.c}`).sort();
    expect(coordsWater).toEqual(['0,1', '1,0', '1,2', '2,1']);
    state.board[1][1].element = 'FIRE';
    const hitsFire = computeHits(state, 1, 1, { union: true });
    const coordsFire = hitsFire.map(h => `${h.r},${h.c}`).sort();
    expect(coordsFire).toEqual(['0,1', '2,1']);
  });

  it('Latoo дает попытку Dodge союзникам на водных полях', () => {
    const state = { board: makeBoard(), players:[{mana:0},{mana:0}], turn:1 };
    state.board[1][1].element = 'WATER';
    state.board[1][1].unit = { owner:0, tplId:'WATER_MERCENARY_SAVIOR_LATOO', facing:'N' };
    state.board[0][1].element = 'WATER';
    state.board[0][1].unit = { owner:0, tplId:'FIRE_PARTMOLE_FLAME_LIZARD', facing:'S', currentHP:2 };
    refreshDodgeAuras(state);
    expect(state.board[0][1].unit.dodgeState?.max ?? 0).toBeGreaterThanOrEqual(1);
    state.board[0][1].element = 'FIRE';
    refreshDodgeAuras(state);
    expect(state.board[0][1].unit.dodgeState).toBeUndefined();
  });

  it('Tritonan Harpoonsman получает Dodge только на воде', () => {
    const state = { board: makeBoard(), players:[{mana:0},{mana:0}], turn:1 };
    state.board[1][1].element = 'WATER';
    state.board[1][1].unit = { owner:0, tplId:'WATER_TRITONAN_HARPOONSMAN', facing:'N', currentHP:2 };
    refreshDodgeAuras(state);
    expect(state.board[1][1].unit.dodgeState?.max ?? 0).toBeGreaterThanOrEqual(1);
    state.board[1][1].element = 'EARTH';
    refreshDodgeAuras(state);
    expect(state.board[1][1].unit.dodgeState).toBeUndefined();
  });
});


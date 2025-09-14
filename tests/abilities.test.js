import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { computeHits, stagedAttack, magicAttack } from '../src/core/rules.js';
import { countControlled } from '../src/core/board.js';
import { CARDS } from '../src/core/cards.js';

function makeBoard() {
  const b = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => ({ element: 'FIRE', unit: null })));
  b[1][1].element = 'MECH';
  return b;
}

describe('Fortress mechanic', () => {
  it('fortress cannot initiate attack but can retaliate', () => {
    const state = { board: makeBoard(), players:[{mana:0},{mana:0}], turn:1 };
    state.board[1][1].unit = { owner:0, originalOwner:0, tplId:'FIRE_LESSER_GRANVENOA', facing:'N', currentHP:4 };
    state.board[0][1].unit = { owner:1, originalOwner:1, tplId:'FIRE_PARTMOLE_FLAME_LIZARD', facing:'S', currentHP:2 };
    expect(computeHits(state,1,1)).toEqual([]);
    const res = stagedAttack(state,0,1);
    const fin = res.finish();
    expect(fin.n1.board[0][1].unit).toBeNull();
    expect(fin.n1.board[1][1].unit).not.toBeNull();
  });
});

describe('Invisibility mechanic', () => {
  let backup;
  beforeEach(()=>{ backup = CARDS.FIRE_FIREFLY_NINJA.invisibility; CARDS.FIRE_FIREFLY_NINJA.invisibility = true; });
  afterEach(()=>{ CARDS.FIRE_FIREFLY_NINJA.invisibility = backup; });
  it('invisible unit takes no magic damage', () => {
    const state = { board: makeBoard(), players:[{mana:0},{mana:0}], turn:1 };
    state.board[1][1].unit = { owner:0, originalOwner:0, tplId:'FIRE_FIREFLY_NINJA', facing:'N', currentHP:2 };
    state.board[0][1].unit = { owner:1, originalOwner:1, tplId:'FIRE_FLAME_MAGUS', facing:'S', currentHP:1 };
    const res = magicAttack(state,0,1,1,1);
    expect(res.targets[0].dmg).toBe(0);
  });
});

describe('Possession mechanic', () => {
  it('possessed unit counts for original owner', () => {
    const state = { board: makeBoard(), players:[{mana:0},{mana:0}] };
    state.board[1][1].unit = { owner:0, originalOwner:1, tplId:'FIRE_PARTMOLE_FLAME_LIZARD', facing:'N' };
    expect(countControlled(state,0)).toBe(0);
    expect(countControlled(state,1)).toBe(1);
  });
});


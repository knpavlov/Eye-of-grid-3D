import { describe, it, expect } from 'vitest';
import { maybeUnlock } from '../src/core/summoningLock.js';

function makeState(units){
  const board = Array.from({ length:3 }, () => Array.from({ length:3 }, () => ({ element:'FIRE', unit:null })));
  for(let i=0;i<units;i++){
    const r = Math.floor(i/3); const c = i%3;
    board[r][c].unit = { owner:0, tplId:'FIRE_FLAME_MAGUS' };
  }
  return { board, unlocked:false };
}

describe('summoning lock', () => {
  it('remains locked with fewer than four units', () => {
    const s = makeState(3);
    const changed = maybeUnlock(s);
    expect(changed).toBe(false);
    expect(s.unlocked).toBe(false);
  });
  it('unlocks when four units are on board and stays unlocked', () => {
    const s = makeState(4);
    const changed = maybeUnlock(s);
    expect(changed).toBe(true);
    expect(s.unlocked).toBe(true);
    s.board[0][0].unit = null;
    const again = maybeUnlock(s);
    expect(again).toBe(false);
    expect(s.unlocked).toBe(true);
  });
});

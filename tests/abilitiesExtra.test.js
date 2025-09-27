import { describe, it, expect } from 'vitest';
import { applyTurnStartManaEffects } from '../src/core/abilityHandlers/startPhase.js';
import { applyEnemySummonReactions } from '../src/core/abilityHandlers/summonReactions.js';
import { grantManaToAllPlayers } from '../src/core/mana.js';
import { collectMagicAttackCandidates } from '../src/core/rules.js';

function makeBoard() {
  const board = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => ({ element: 'FIRE', unit: null })));
  board[1][1].element = 'BIOLITH';
  return board;
}

describe('эффекты начала хода', () => {
  it('Dungeon of Ten Tyrants начисляет ману вне Земли', () => {
    const state = {
      board: makeBoard(),
      players: [{ mana: 0 }, { mana: 0 }],
    };
    state.board[0][0].element = 'FOREST';
    state.board[0][0].unit = {
      owner: 0,
      tplId: 'EARTH_DUNGEON_OF_TEN_TYRANTS',
      currentHP: 4,
    };
    const result = applyTurnStartManaEffects(state, 0);
    expect(result.total).toBe(1);
    expect(state.players[0].mana).toBe(1);
  });

  it('Dungeon не даёт бонус на родной стихии', () => {
    const state = {
      board: makeBoard(),
      players: [{ mana: 2 }, { mana: 0 }],
    };
    state.board[0][0].element = 'EARTH';
    state.board[0][0].unit = {
      owner: 0,
      tplId: 'EARTH_DUNGEON_OF_TEN_TYRANTS',
    };
    const result = applyTurnStartManaEffects(state, 0);
    expect(result.total).toBe(0);
    expect(state.players[0].mana).toBe(2);
  });
});

describe('реакции на призыв врага', () => {
  it('Juno Prisoner Trap лечит остальных союзников', () => {
    const state = {
      board: makeBoard(),
      players: [{ mana: 0 }, { mana: 0 }],
    };
    state.board[1][1].element = 'FOREST';
    state.board[1][1].unit = {
      owner: 0,
      tplId: 'FOREST_JUNO_PRISONER_TRAP',
      currentHP: 4,
    };
    state.board[1][0].element = 'FOREST';
    state.board[1][0].unit = {
      owner: 0,
      tplId: 'FOREST_SWALLOW_NINJA',
      currentHP: 1,
    };
    const reaction = applyEnemySummonReactions(state, {
      r: 1,
      c: 2,
      unit: { owner: 1, tplId: 'FIRE_PARTMOLE_FLAME_LIZARD', currentHP: 2 },
    });
    expect(reaction.heals).toHaveLength(1);
    expect(reaction.heals[0].healed[0].amount).toBe(1);
    expect(reaction.heals[0].healed[0].increaseMax).toBe(true);
    expect(state.board[1][0].unit.currentHP).toBe(2);
    expect(state.board[1][0].unit.bonusHP).toBe(1);
  });
});

describe('глобальное добавление маны', () => {
  it('grantManaToAllPlayers добавляет и ограничивает по капу', () => {
    const state = {
      players: [
        { mana: 5 },
        { mana: 9 },
      ],
    };
    const res = grantManaToAllPlayers(state, 10);
    expect(res.total).toBe(6);
    expect(res.entries).toHaveLength(2);
    expect(state.players[0].mana).toBe(10);
    expect(state.players[1].mana).toBe(10);
  });
});

describe('магические кандидаты', () => {
  it('Undead King Novogus может целиться в любую клетку', () => {
    const state = {
      board: makeBoard(),
    };
    state.board[1][1].element = 'EARTH';
    state.board[1][1].unit = {
      owner: 0,
      tplId: 'EARTH_UNDEAD_KING_NOVOGUS',
      currentHP: 6,
      facing: 'N',
    };
    state.board[0][0].unit = { owner: 1, tplId: 'FIRE_FLAME_MAGUS', currentHP: 1, facing: 'S' };
    state.board[2][2].unit = { owner: 1, tplId: 'FIRE_HELLFIRE_SPITTER', currentHP: 1, facing: 'N' };
    const cells = collectMagicAttackCandidates(state, 1, 1);
    expect(cells).toEqual(
      expect.arrayContaining([
        { r: 0, c: 0 },
        { r: 2, c: 2 },
      ]),
    );
    expect(cells.every(pos => pos.r !== 1 || pos.c !== 1)).toBe(true);
  });

  it('Partmole Fire Oracle ограничен линией атаки вперёд', () => {
    const state = {
      board: makeBoard(),
    };
    state.board[2][1].element = 'FIRE';
    state.board[2][1].unit = {
      owner: 0,
      tplId: 'FIRE_PARTMOLE_FIRE_ORACLE',
      currentHP: 3,
      facing: 'N',
    };
    state.board[1][1].unit = { owner: 1, tplId: 'WATER_CLOUD_RUNNER', currentHP: 2, facing: 'S' };
    state.board[0][1].unit = { owner: 1, tplId: 'EARTH_VERZAR_CANINE', currentHP: 1, facing: 'S' };
    state.board[2][0].unit = { owner: 1, tplId: 'FIRE_FLAME_MAGUS', currentHP: 1, facing: 'E' };
    const cells = collectMagicAttackCandidates(state, 2, 1);
    expect(cells).toEqual(
      expect.arrayContaining([
        { r: 1, c: 1 },
        { r: 0, c: 1 },
      ]),
    );
    expect(cells.some(pos => pos.r === 2 && pos.c === 0)).toBe(false);
  });
});

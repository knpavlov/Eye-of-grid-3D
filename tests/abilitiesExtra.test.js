import { describe, it, expect } from 'vitest';
import { applyTurnStartManaEffects } from '../src/core/abilityHandlers/startPhase.js';
import { applyEnemySummonReactions } from '../src/core/abilityHandlers/summonReactions.js';
import { grantManaToAllPlayers } from '../src/core/mana.js';

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

  it('Guardian Watchtower не генерирует ману без союзного Scion', () => {
    const state = {
      board: makeBoard(),
      players: [{ mana: 0 }, { mana: 0 }],
    };
    state.board[0][0].unit = {
      owner: 0,
      tplId: 'BIOLITH_GUARDIAN_WATCHTOWER',
      currentHP: 10,
    };
    const result = applyTurnStartManaEffects(state, 0);
    expect(result.total).toBe(0);
    expect(state.players[0].mana).toBe(0);
  });

  it('Guardian Watchtower начисляет ману за всех союзников при присутствии Scion', () => {
    const state = {
      board: makeBoard(),
      players: [{ mana: 1 }, { mana: 0 }],
    };
    state.board[0][0].unit = {
      owner: 0,
      tplId: 'BIOLITH_GUARDIAN_WATCHTOWER',
      currentHP: 10,
    };
    state.board[1][1].unit = {
      owner: 0,
      tplId: 'BIOLITH_SCION_BIOLITH_LORD',
      currentHP: 6,
    };
    state.board[0][1].unit = {
      owner: 0,
      tplId: 'FIRE_PARTMOLE_FLAME_LIZARD',
      currentHP: 2,
    };
    const result = applyTurnStartManaEffects(state, 0);
    expect(result.total).toBe(2);
    expect(state.players[0].mana).toBe(3);
    const entry = result.entries.find(e => e.tplId === 'BIOLITH_GUARDIAN_WATCHTOWER');
    expect(entry).toBeTruthy();
    expect(entry.amount).toBe(2);
    expect(entry.allies).toBe(2);
  });

  it('Guardian Watchtower даёт ману в начале каждого своего хода', () => {
    const state = {
      board: makeBoard(),
      players: [{ mana: 0 }, { mana: 0 }],
    };
    state.board[0][0].unit = {
      owner: 0,
      tplId: 'BIOLITH_GUARDIAN_WATCHTOWER',
      currentHP: 10,
    };
    state.board[1][1].unit = {
      owner: 0,
      tplId: 'BIOLITH_SCION_BIOLITH_LORD',
      currentHP: 6,
    };
    state.board[0][1].unit = {
      owner: 0,
      tplId: 'FIRE_PARTMOLE_FLAME_LIZARD',
      currentHP: 2,
    };

    const first = applyTurnStartManaEffects(state, 0);
    expect(first.total).toBe(2);
    expect(state.players[0].mana).toBe(2);

    const second = applyTurnStartManaEffects(state, 0);
    expect(second.total).toBe(2);
    expect(state.players[0].mana).toBe(4);
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

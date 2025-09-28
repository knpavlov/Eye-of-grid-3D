import { describe, it, expect } from 'vitest';
import { CARDS } from '../src/core/cards.js';
import {
  applySummonAbilities,
  collectDamageInteractions,
  applyDamageInteractionResults,
} from '../src/core/abilities.js';
import { computeFieldquakeLockedCells } from '../src/core/fieldLocks.js';
import { computeDynamicAttackBonus } from '../src/core/abilityHandlers/dynamicAttack.js';

function makeBoard(defaultElement = 'FIRE') {
  return Array.from({ length: 3 }, (_, r) => (
    Array.from({ length: 3 }, (_, c) => ({
      element: (r === 1 && c === 1) ? 'BIOLITH' : defaultElement,
      unit: null,
    }))
  ));
}

describe('fieldquake-эффекты биолит-карт', () => {
  it('Behemoth Groundbreaker меняет стихии соседних клеток при призыве', () => {
    const state = {
      board: makeBoard('FIRE'),
      players: [
        { graveyard: [] },
        { graveyard: [] },
      ],
    };
    state.board[0][1].element = 'FIRE';
    state.board[2][1].element = 'WATER';
    state.board[1][0].element = 'FOREST';
    state.board[1][2].element = 'EARTH';
    state.board[1][1].unit = {
      owner: 0,
      tplId: 'BIOLITH_BEHEMOTH_GROUNDBREAKER',
      currentHP: 4,
    };

    const events = applySummonAbilities(state, 1, 1);

    expect(state.board[0][1].element).toBe('WATER');
    expect(state.board[2][1].element).toBe('FIRE');
    expect(state.board[1][0].element).toBe('EARTH');
    expect(state.board[1][2].element).toBe('FOREST');
    expect(events.fieldquakes).toHaveLength(4);
  });

  it('Groundbreaker мгновенно уничтожает существ с нулевым HP после fieldquake', () => {
    const state = {
      board: makeBoard('FIRE'),
      players: [
        { graveyard: [] },
        { graveyard: [] },
      ],
    };
    state.board[0][1].unit = {
      owner: 1,
      tplId: 'FIRE_PARTMOLE_FLAME_LIZARD',
      currentHP: 2,
    };
    state.board[1][1].unit = {
      owner: 0,
      tplId: 'BIOLITH_BEHEMOTH_GROUNDBREAKER',
      currentHP: 4,
    };

    const events = applySummonAbilities(state, 1, 1);

    expect(state.board[0][1].unit).toBeNull();
    expect(events.deaths).toHaveLength(1);
    expect(events.deaths[0].tplId).toBe('FIRE_PARTMOLE_FLAME_LIZARD');
    expect(state.players[1].graveyard).toHaveLength(1);
  });

  it('Undead King Novogus вызывает fieldquake при уроне вне земли', () => {
    const state = {
      board: makeBoard('FIRE'),
      players: [{}, {}],
    };
    state.board[1][1].element = 'FOREST';
    state.board[1][1].unit = {
      owner: 0,
      tplId: 'BIOLITH_UNDEAD_KING_NOVOGUS',
      currentHP: 6,
    };
    state.board[0][1].element = 'FIRE';
    state.board[0][1].unit = {
      owner: 1,
      tplId: 'FIRE_PARTMOLE_FLAME_LIZARD',
      currentHP: 2,
    };

    const tpl = CARDS.BIOLITH_UNDEAD_KING_NOVOGUS;
    const interactions = collectDamageInteractions(state, {
      attackerPos: { r: 1, c: 1 },
      attackerUnit: state.board[1][1].unit,
      tpl,
      hits: [ { r: 0, c: 1, dealt: 2 } ],
    });

    expect(interactions.events).toHaveLength(1);
    expect(interactions.preventRetaliation.has('0,1')).toBe(true);

    const applied = applyDamageInteractionResults(state, interactions);
    expect(state.board[0][1].element).toBe('WATER');
    expect(applied.logLines.some(line => line.includes('Fieldquake'))).toBe(true);
  });

  it('Novogus удаляет цель, потерявшую все HP от смены поля', () => {
    const state = {
      board: makeBoard('FIRE'),
      players: [
        { graveyard: [] },
        { graveyard: [] },
      ],
    };
    state.board[1][1].element = 'FOREST';
    state.board[1][1].unit = {
      owner: 0,
      tplId: 'BIOLITH_UNDEAD_KING_NOVOGUS',
      currentHP: 6,
    };
    state.board[0][1].element = 'FIRE';
    state.board[0][1].unit = {
      owner: 1,
      tplId: 'FIRE_PARTMOLE_FLAME_LIZARD',
      currentHP: 2,
    };

    const tpl = CARDS.BIOLITH_UNDEAD_KING_NOVOGUS;
    const interactions = collectDamageInteractions(state, {
      attackerPos: { r: 1, c: 1 },
      attackerUnit: state.board[1][1].unit,
      tpl,
      hits: [ { r: 0, c: 1, dealt: 1 } ],
    });

    const applied = applyDamageInteractionResults(state, interactions);

    expect(state.board[0][1].unit).toBeNull();
    expect(applied.deaths).toHaveLength(1);
    expect(applied.deaths[0].tplId).toBe('FIRE_PARTMOLE_FLAME_LIZARD');
  });

  it('Novogus не срабатывает на земле', () => {
    const state = {
      board: makeBoard('EARTH'),
      players: [{}, {}],
    };
    state.board[1][1].element = 'EARTH';
    state.board[1][1].unit = {
      owner: 0,
      tplId: 'BIOLITH_UNDEAD_KING_NOVOGUS',
      currentHP: 6,
    };
    state.board[0][1].element = 'FIRE';
    state.board[0][1].unit = {
      owner: 1,
      tplId: 'FIRE_PARTMOLE_FLAME_LIZARD',
      currentHP: 2,
    };

    const tpl = CARDS.BIOLITH_UNDEAD_KING_NOVOGUS;
    const interactions = collectDamageInteractions(state, {
      attackerPos: { r: 1, c: 1 },
      attackerUnit: state.board[1][1].unit,
      tpl,
      hits: [ { r: 0, c: 1, dealt: 2 } ],
    });

    expect(interactions.events).toHaveLength(0);
  });

  it('Ouroboros Dragon получает бонус и блокирует fieldquake на биолите', () => {
    const state = {
      board: makeBoard('FIRE'),
      players: [{}, {}],
    };
    state.board[1][1].element = 'BIOLITH';
    state.board[1][1].unit = {
      owner: 0,
      tplId: 'BIOLITH_OUROBOROS_DRAGON',
      currentHP: 10,
    };
    state.board[0][0].unit = {
      owner: 0,
      tplId: 'BIOLITH_MORNING_STAR_WARRIOR',
      currentHP: 3,
    };
    state.board[2][2].unit = {
      owner: 0,
      tplId: 'BIOLITH_BIOLITH_STINGER',
      currentHP: 1,
    };

    const bonus = computeDynamicAttackBonus(state, 1, 1, CARDS.BIOLITH_OUROBOROS_DRAGON);
    expect(bonus?.amount).toBe(2);

    const locked = computeFieldquakeLockedCells(state);
    expect(locked).toHaveLength(9);

    state.board[1][1].element = 'FIRE';
    const unlocked = computeFieldquakeLockedCells(state);
    expect(unlocked.length).toBeLessThan(9);
  });
});

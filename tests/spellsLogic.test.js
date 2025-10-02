import { describe, it, expect } from 'vitest';
import { fieldquakeAll, fieldquakeByElement } from '../src/core/spells/fieldquake.js';
import { swapUnits, moveUnitToCell } from '../src/core/spells/reposition.js';

describe('логика заклинаний (core/spells)', () => {
  function makeEmptyBoard(defaultElement = 'FIRE') {
    return Array.from({ length: 3 }, () => (
      Array.from({ length: 3 }, () => ({ element: defaultElement, unit: null }))
    ));
  }

  it('fieldquakeAll меняет стихии и учитывает HP/смерти', () => {
    const state = {
      board: makeEmptyBoard('FIRE'),
      players: [
        { graveyard: [] },
        { graveyard: [] },
      ],
    };
    // Центр биолит — без изменений
    state.board[1][1].element = 'BIOLITH';

    // Fire → Water: существо теряет 2 HP и погибает
    state.board[0][0].unit = {
      owner: 0,
      tplId: 'FIRE_PARTMOLE_FLAME_LIZARD',
      currentHP: 2,
    };

    // Earth → Forest — потеря баффа приведёт к гибели
    state.board[1][0].element = 'EARTH';
    state.board[1][0].unit = {
      owner: 0,
      tplId: 'EARTH_VERZAR_CANINE',
      currentHP: 1,
    };

    // Water → Fire: существо получает усиление
    state.board[0][1].element = 'WATER';
    state.board[0][1].unit = {
      owner: 0,
      tplId: 'FIRE_FLAME_MAGUS',
      currentHP: 1,
    };

    const result = fieldquakeAll(state, { sourceName: 'Test Spell' });

    expect(result.ok).toBe(true);
    expect(result.fieldquakes).toHaveLength(8); // все клетки кроме биолита
    expect(state.board[0][0].element).toBe('WATER');
    expect(state.board[1][0].element).toBe('FOREST');
    expect(state.board[0][1].element).toBe('FIRE');

    // Усиление/ослабление зафиксировано
    const magusChange = result.hpChanges.find(ch => ch.unitTplId === 'FIRE_FLAME_MAGUS');
    expect(magusChange).toMatchObject({ delta: 4, after: 5 });

    // Два существа погибли
    expect(result.deaths).toHaveLength(2);
    expect(state.players[0].graveyard).toHaveLength(2);
    const tplIds = state.players[0].graveyard.map(card => card.id);
    expect(tplIds).toEqual(expect.arrayContaining([
      'FIRE_PARTMOLE_FLAME_LIZARD',
      'EARTH_VERZAR_CANINE',
    ]));
  });

  it('fieldquakeByElement затрагивает только выбранную стихию', () => {
    const state = {
      board: makeEmptyBoard('FIRE'),
      players: [{ graveyard: [] }, { graveyard: [] }],
    };
    state.board[0][0].element = 'WATER';
    state.board[2][2].element = 'EARTH';

    const result = fieldquakeByElement(state, 'FIRE', { sourceName: 'Selective Quake' });

    expect(result.ok).toBe(true);
    expect(result.fieldquakes.every(fq => state.board[fq.r][fq.c].element !== 'FIRE')).toBe(true);
    // Вода и земля не затронуты
    expect(state.board[0][0].element).toBe('WATER');
    expect(state.board[2][2].element).toBe('EARTH');
  });

  it('swapUnits меняет позиции и обрабатывает смерти', () => {
    const state = {
      board: makeEmptyBoard('FIRE'),
      players: [
        { graveyard: [] },
        { graveyard: [] },
      ],
    };
    state.board[0][0].element = 'FIRE';
    state.board[0][1].element = 'WATER';
    state.board[0][0].unit = {
      owner: 0,
      tplId: 'FIRE_FLAME_MAGUS',
      currentHP: 1,
    };
    state.board[0][1].unit = {
      owner: 0,
      tplId: 'WATER_QUEENS_SERVANT',
      currentHP: 6,
    };

    const result = swapUnits(state, { r: 0, c: 0 }, { r: 0, c: 1 }, { sourceName: 'Teleport Test', requireSameOwner: true });

    expect(result.ok).toBe(true);
    expect(result.deaths).toHaveLength(1);
    expect(state.players[0].graveyard).toHaveLength(1);
    expect(state.players[0].graveyard[0].id).toBe('FIRE_FLAME_MAGUS');
    // Жившее существо осталось на новой клетке
    expect(state.board[0][0].unit?.tplId).toBe('WATER_QUEENS_SERVANT');
    expect(result.hpChanges.some(ch => ch.unitTplId === 'WATER_QUEENS_SERVANT' && ch.delta === -4)).toBe(true);
  });

  it('moveUnitToCell учитывает фатальность на новой клетке', () => {
    const state = {
      board: makeEmptyBoard('EARTH'),
      players: [
        { graveyard: [] },
        { graveyard: [] },
      ],
    };
    state.board[0][0].element = 'WATER';
    state.board[0][0].unit = {
      owner: 0,
      tplId: 'WATER_MOVING_ISLE_OF_KADENA',
      currentHP: 4,
    };
    state.board[0][1].element = 'FIRE';

    const result = moveUnitToCell(state, { r: 0, c: 0 }, { r: 0, c: 1 }, { sourceName: 'Telekinesis', requireOwner: 0 });

    expect(result.ok).toBe(true);
    expect(result.deaths).toHaveLength(1);
    expect(state.players[0].graveyard).toHaveLength(1);
    expect(state.players[0].graveyard[0].id).toBe('WATER_MOVING_ISLE_OF_KADENA');
    expect(state.board[0][1].unit).toBeNull();
  });
});

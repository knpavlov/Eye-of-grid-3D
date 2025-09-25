import { describe, expect, it } from 'vitest';
import { applyDeathDiscardEffects } from '../src/core/abilityHandlers/discard.js';

function makePlayer(handIds = []) {
  return {
    hand: handIds.map(id => ({ id })),
    deck: [],
    discard: [],
    graveyard: [],
    mana: 0,
    maxMana: 10,
  };
}

function createBoard(elements) {
  return elements.map(row => row.map(el => ({ element: el, unit: null })));
}

describe('discard ability handlers', () => {
  it('adds discard request for Elven Rider on non-wood field', () => {
    const elements = [
      ['FOREST', 'FOREST', 'EARTH'],
      ['FIRE', 'FOREST', 'FOREST'],
      ['FOREST', 'WATER', 'FOREST'],
    ];
    const state = {
      board: createBoard(elements),
      players: [
        makePlayer([]),
        makePlayer([
          'FIRE_FLAME_MAGUS',
          'FIRE_HELLFIRE_SPITTER',
          'FIRE_FLAME_ASCETIC',
          'FIRE_PARTMOLE_FLAME_LIZARD',
          'FIRE_PARTMOLE_FLAME_GUARD',
        ]),
      ],
      pendingDiscards: [],
      nextDiscardRequestId: 0,
    };
    const deaths = [
      { r: 0, c: 0, owner: 0, tplId: 'FOREST_ELVEN_RIDER', element: 'EARTH' },
    ];
    const result = applyDeathDiscardEffects(state, deaths, { cause: 'TEST' });
    expect(result.requests).toHaveLength(1);
    expect(state.pendingDiscards).toHaveLength(1);
    const request = state.pendingDiscards[0];
    const forestCount = elements.flat().filter(el => el === 'FOREST').length;
    expect(request.target).toBe(1);
    const expectedCount = Math.min(forestCount, state.players[1].hand.length);
    expect(request.remaining).toBe(expectedCount);
    expect(request.autoEndTurn).toBe(false);
    expect(result.logs.some(line => line.includes('оппонент'))).toBe(true);
  });

  it('creates discard for Zomba aura when allies die on forest', () => {
    const elements = [
      ['EARTH', 'FOREST', 'WATER'],
      ['FIRE', 'FOREST', 'EARTH'],
      ['FOREST', 'WATER', 'FIRE'],
    ];
    const state = {
      board: createBoard(elements),
      players: [
        makePlayer([]),
        makePlayer(['FIRE_FLAME_MAGUS', 'FIRE_HELLFIRE_SPITTER', 'FIRE_FLAME_ASCETIC']),
      ],
      pendingDiscards: [],
      nextDiscardRequestId: 0,
    };
    state.board[1][1].unit = { tplId: 'FOREST_GREEN_ERLKING_ZOMBA', owner: 0 };
    const deaths = [
      { r: 0, c: 1, owner: 0, tplId: 'FOREST_GREEN_CUBIC', element: 'FOREST' },
      { r: 0, c: 2, owner: 0, tplId: 'FOREST_SWALLOW_NINJA', element: 'WATER' },
    ];
    const result = applyDeathDiscardEffects(state, deaths, { cause: 'TEST_AURA' });
    expect(result.requests).toHaveLength(1);
    const request = state.pendingDiscards[0];
    expect(request.target).toBe(1);
    expect(request.remaining).toBe(2);
    expect(request.autoEndTurn).toBe(false);
  });

  it('marks requests with autoEndTurn flag when нужно продолжить авто-передачу хода', () => {
    const state = {
      board: createBoard([
        ['EARTH', 'EARTH', 'EARTH'],
        ['EARTH', 'EARTH', 'EARTH'],
        ['EARTH', 'EARTH', 'EARTH'],
      ]),
      players: [makePlayer(['CARD_A', 'CARD_B']), makePlayer(['CARD_C'])],
      pendingDiscards: [],
      nextDiscardRequestId: 0,
    };
    const deaths = [
      { r: 1, c: 1, owner: 0, tplId: 'FOREST_LEAPFROG_BANDIT', element: 'EARTH' },
    ];
    const result = applyDeathDiscardEffects(state, deaths, { cause: 'SUMMON', autoEndTurn: true });
    expect(result.requests).toHaveLength(1);
    const request = state.pendingDiscards[0];
    expect(request.autoEndTurn).toBe(true);
  });
});

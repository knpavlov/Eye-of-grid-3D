import { describe, it, expect } from 'vitest';
import { applyManaGainOnDeaths } from '../src/core/abilityHandlers/manaGain.js';
import { buildManaGainPlan } from '../src/scene/manaFx.js';

function makeBoard(defaultElement = 'FIRE') {
  const board = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => ({ element: defaultElement, unit: null })));
  return board;
}

describe('прирост маны при гибели существ', () => {
  it('Inquisitor Koog даёт ману за каждого врага', () => {
    const state = {
      board: makeBoard('FOREST'),
      players: [{ mana: 0 }, { mana: 0 }],
    };
    state.board[0][0].unit = { owner: 1, tplId: 'FIRE_FLAME_MAGUS' };
    state.board[2][2].unit = { owner: 1, tplId: 'FIRE_FLAME_MAGUS' };
    const deaths = [
      { r: 1, c: 0, owner: 0, tplId: 'FOREST_INQUISITOR_KOOG' },
    ];
    const result = applyManaGainOnDeaths(state, deaths, { boardState: state });
    expect(result.total).toBe(2);
    expect(state.players[0].mana).toBe(2);
  });

  it('Novogus Catapult считает все поля Земли', () => {
    const state = {
      board: makeBoard('FIRE'),
      players: [{ mana: 0 }, { mana: 0 }],
    };
    state.board[0][0].element = 'EARTH';
    state.board[0][1].element = 'EARTH';
    state.board[1][1].element = 'EARTH';
    state.board[2][2].element = 'EARTH';
    const deaths = [
      { r: 2, c: 0, owner: 0, tplId: 'EARTH_NOVOGUS_CATAPULT' },
    ];
    const result = applyManaGainOnDeaths(state, deaths, { boardState: state });
    expect(result.total).toBe(4);
    expect(state.players[0].mana).toBe(4);
  });

  it('Skeleton Soldier суммарно даёт +2 маны (1 базовая + 1 за способность)', () => {
    const state = {
      board: makeBoard('EARTH'),
      players: [{ mana: 5 }, { mana: 0 }],
    };
    const deaths = [
      { r: 0, c: 1, owner: 0, tplId: 'EARTH_SKELETON_SOLDIER' },
    ];
    const before = state.players[0].mana;
    state.players[0].mana = Math.min(10, before + 1); // базовая награда за смерть
    const result = applyManaGainOnDeaths(state, deaths, { boardState: state });
    expect(result.total).toBe(1);
    expect(state.players[0].mana - before).toBe(2);
  });

  it('Undead Dragon получает ману только на земле и по соседству', () => {
    const state = {
      board: makeBoard('FIRE'),
      players: [{ mana: 0 }, { mana: 0 }],
    };
    state.board[1][1].element = 'EARTH';
    state.board[1][1].unit = { owner: 0, tplId: 'EARTH_UNDEAD_DRAGON' };
    const deaths = [
      { r: 1, c: 0, owner: 0, tplId: 'EARTH_NOVOGUS_GOLEM' },
    ];
    const result = applyManaGainOnDeaths(state, deaths, { boardState: state });
    expect(result.total).toBe(1);
    expect(state.players[0].mana).toBe(1);

    // Теперь дракон стоит не на Земле — бонуса быть не должно
    const state2 = {
      board: makeBoard('FIRE'),
      players: [{ mana: 0 }, { mana: 0 }],
    };
    state2.board[1][1].element = 'FOREST';
    state2.board[1][1].unit = { owner: 0, tplId: 'EARTH_UNDEAD_DRAGON' };
    const result2 = applyManaGainOnDeaths(state2, deaths, { boardState: state2 });
    expect(result2.total).toBe(0);
    expect(state2.players[0].mana).toBe(0);
  });

  it('план анимаций строит отдельные события для базовой и бонусной маны', () => {
    const makeVec = (x = 0, y = 0, z = 0) => ({
      x, y, z,
      clone() { return makeVec(this.x, this.y, this.z); },
      add(v = {}) {
        this.x += v.x || 0;
        this.y += v.y || 0;
        this.z += v.z || 0;
        return this;
      },
    });

    const tileMeshes = [
      [null, null, null],
      [null, { position: makeVec() }, null],
      [null, null, null],
    ];

    const plan = buildManaGainPlan({
      playersBefore: [{ mana: 3 }, { mana: 0 }],
      deaths: [{ owner: 0, r: 1, c: 1, tplId: 'EARTH_SKELETON_SOLDIER' }],
      manaGainEntries: [{ owner: 0, amount: 2, death: { owner: 0, r: 1, c: 1 } }],
      tileMeshes,
      THREE: null,
    });

    expect(plan.events.length).toBe(2);
    expect(plan.events[0].amount).toBe(1);
    expect(plan.events[1].amount).toBe(2);
    expect(typeof plan.schedule).toBe('function');
  });
});

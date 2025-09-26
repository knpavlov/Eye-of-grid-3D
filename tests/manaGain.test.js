import { describe, it, expect, vi } from 'vitest';
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

  it('Skeleton Soldier даёт +1 дополнительно к базовой награде', () => {
    const state = {
      board: makeBoard('EARTH'),
      players: [{ mana: 5 }, { mana: 0 }],
    };
    const deaths = [
      { r: 0, c: 1, owner: 0, tplId: 'EARTH_SKELETON_SOLDIER' },
    ];
    const result = applyManaGainOnDeaths(state, deaths, { boardState: state });
    expect(result.total).toBe(1);
    expect(state.players[0].mana).toBe(6);
    const finalWithBase = Math.min(10, state.players[0].mana + 1);
    expect(finalWithBase).toBe(7);
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
});

describe('планирование анимации маны', () => {
  function makePos(x = 0, y = 0, z = 0) {
    return {
      x,
      y,
      z,
      clone() { return makePos(this.x, this.y, this.z); },
      add(vec) {
        this.x += vec?.x ?? 0;
        this.y += vec?.y ?? 0;
        this.z += vec?.z ?? 0;
        return this;
      },
    };
  }

  it('создаёт орбы для базовой и бонусной маны и блокирует панель заранее', () => {
    const originalWindow = globalThis.window;
    const animateSpy = vi.fn();
    const updateUISpy = vi.fn();

    globalThis.window = {
      animateManaGainFromWorld: animateSpy,
      updateUI: updateUISpy,
      PENDING_MANA_BLOCK: [0, 0],
    };

    try {
      const plan = buildManaGainPlan({
        playersBefore: [{ mana: 4 }],
        deaths: [{ owner: 0, r: 0, c: 0 }],
        manaGainEntries: [
          { owner: 0, amount: 2, death: { owner: 0, r: 0, c: 0 } },
        ],
        tileMeshes: [[{ position: makePos() }]],
      });

      expect(plan.events).toHaveLength(2);
      plan.schedule();

      expect(updateUISpy).toHaveBeenCalled();
      expect(globalThis.window.PENDING_MANA_BLOCK[0]).toBe(3);
      expect(animateSpy).toHaveBeenCalledTimes(2);

      const [baseCall, abilityCall] = animateSpy.mock.calls;
      expect(baseCall[4]).toMatchObject({ count: 1, preBlocked: true });
      expect(abilityCall[4]).toMatchObject({ count: 2, preBlocked: true });
      expect(abilityCall[4].startDelayMs).toBeGreaterThan(baseCall[4].startDelayMs);
    } finally {
      if (originalWindow === undefined) {
        delete globalThis.window;
      } else {
        globalThis.window = originalWindow;
      }
    }
  });
});

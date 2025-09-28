import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const originalGsap = globalThis.gsap;

const noop = () => {};

const createGsapStub = () => ({ then: () => ({ then: () => ({}) }) });

globalThis.window = {
  gameState: null,
  updateUI: vi.fn(),
  addLog: vi.fn(),
  __ui: {},
  __fx: {},
  showNotification: noop,
};

globalThis.document = { getElementById: () => null };
globalThis.gsap = {
  to: createGsapStub,
  fromTo: createGsapStub,
};

let interactionState;
let undoPendingSummonManaGain;

beforeAll(async () => {
  const mod = await import('../src/scene/interactions.js');
  interactionState = mod.interactionState;
  undoPendingSummonManaGain = mod.undoPendingSummonManaGain;
});

afterAll(() => {
  globalThis.window = originalWindow;
  globalThis.document = originalDocument;
  globalThis.gsap = originalGsap;
});

beforeEach(() => {
  window.updateUI.mockClear?.();
  window.gameState = {
    players: [
      { mana: 6 },
      { mana: 9 },
    ],
  };
  interactionState.pendingSummonManaGain = [
    { owner: 0, amount: 2 },
    { owner: 1, amount: 3 },
  ];
});

describe('undoPendingSummonManaGain', () => {
  it('откатывает бонусную ману и очищает состояние', () => {
    undoPendingSummonManaGain();
    expect(window.gameState.players[0].mana).toBe(4);
    expect(window.gameState.players[1].mana).toBe(6);
    expect(interactionState.pendingSummonManaGain).toBeNull();
    expect(window.updateUI).toHaveBeenCalledTimes(1);
    expect(window.updateUI).toHaveBeenCalledWith(window.gameState);
  });

  it('ничего не делает, если событий нет', () => {
    interactionState.pendingSummonManaGain = null;
    undoPendingSummonManaGain();
    expect(window.gameState.players[0].mana).toBe(6);
    expect(window.gameState.players[1].mana).toBe(9);
    expect(window.updateUI).not.toHaveBeenCalled();
  });
});


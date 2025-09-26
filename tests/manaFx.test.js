import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildManaGainPlan } from '../src/scene/manaFx.js';

function makeTileMeshes() {
  const tile = () => ({ position: { clone: () => ({ x: 0, y: 0, z: 0 }) } });
  return [
    [tile(), tile(), tile()],
    [tile(), tile(), tile()],
    [tile(), tile(), tile()],
  ];
}

describe('планирование полёта орбов маны', () => {
  const originalWindow = global.window;

  beforeEach(() => {
    global.window = {
      __ui: {
        mana: {
          reserveManaBlocks: vi.fn(),
          releaseManaBlocks: vi.fn(),
          animateManaGainFromWorld: vi.fn(),
        },
      },
      THREE: null,
    };
  });

  afterEach(() => {
    global.window = originalWindow;
    vi.restoreAllMocks();
  });

  it('создаёт отдельные события для базового и дополнительного орба', () => {
    const plan = buildManaGainPlan({
      playersBefore: [{ mana: 0 }],
      deaths: [{ owner: 0, r: 1, c: 1 }],
      manaGainEntries: [{ owner: 0, amount: 1, death: { owner: 0, r: 1, c: 1 } }],
      tileMeshes: makeTileMeshes(),
    });
    expect(plan.events).toHaveLength(2);
    expect(plan.events.map(ev => ev.amount)).toEqual([1, 1]);
    const reserved = plan.reserve?.();
    expect(reserved).toBe(true);
    const reserveSpy = window.__ui.mana.reserveManaBlocks;
    expect(reserveSpy).toHaveBeenCalledWith(0, 2);
  });

  it('учитывает множественный прирост от способности', () => {
    const plan = buildManaGainPlan({
      playersBefore: [{ mana: 3 }],
      deaths: [{ owner: 0, r: 0, c: 0 }],
      manaGainEntries: [{ owner: 0, amount: 3, death: { owner: 0, r: 0, c: 0 } }],
      tileMeshes: makeTileMeshes(),
    });
    expect(plan.events).toHaveLength(2);
    expect(plan.events[1].amount).toBe(3);
  });
});

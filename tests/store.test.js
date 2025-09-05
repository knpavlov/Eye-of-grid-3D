import { describe, it, expect, vi } from 'vitest';
import { createStore, makeMiddleware } from '../src/lib/store.js';

describe('store', () => {
  it('dispatch updates state and notifies listeners', () => {
    const reducer = (s = 0, a) => (a.type === 'INC' ? s + 1 : s);
    const store = createStore(reducer, undefined, []);
    const listener = vi.fn();
    const unsub = store.subscribe(listener);
    store.dispatch({ type: 'INC' });
    expect(store.getState()).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);
    unsub();
    store.dispatch({ type: 'INC' });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('middlewares compose in order', () => {
    const order = [];
    const mw1 = makeMiddleware(({ next, action }) => { order.push('mw1-before'); const r = next(action); order.push('mw1-after'); return r; });
    const mw2 = makeMiddleware(({ next, action }) => { order.push('mw2-before'); const r = next(action); order.push('mw2-after'); return r; });
    const reducer = (s = 0, a) => (a.type === 'PING' ? s + 1 : s);
    const store = createStore(reducer, undefined, [mw1, mw2]);
    store.dispatch({ type: 'PING' });
    expect(store.getState()).toBe(1);
    expect(order).toEqual(['mw1-before', 'mw2-before', 'mw2-after', 'mw1-after']);
  });
});


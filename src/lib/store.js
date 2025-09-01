// Minimal store with middleware support

export function createStore(reducer, preloadedState, middlewares = []) {
  let state = preloadedState;
  const listeners = new Set();

  const store = {
    getState: () => state,
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    dispatch: (action) => dispatch(action),
  };

  // Core dispatch
  let dispatch = (action) => {
    state = reducer(state, action);
    for (const l of listeners) try { l(); } catch {}
    return action;
  };

  // Apply middlewares (Redux-like)
  const api = { getState: () => state, dispatch: (a) => store.dispatch(a) };
  const chain = middlewares.map(mw => mw(api));
  dispatch = chain.reduceRight((next, mw) => mw(next), dispatch);

  return store;
}

// Helper to create a simple middleware
export const makeMiddleware = (fn) => ({ getState, dispatch }) => (next) => (action) => fn({ getState, dispatch, next, action });


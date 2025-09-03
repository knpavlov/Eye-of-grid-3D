// Log model + rendering for #log-content

const state = { entries: [] };

export function add(message) {
  try {
    const text = String(message ?? '');
    state.entries.unshift(text);
    if (state.entries.length > 100) state.entries.pop();
    const logContent = document.getElementById('log-content');
    if (logContent) {
      logContent.innerHTML = state.entries.map(entry => `<div>${entry}</div>`).join('');
    }
  } catch {}
}

export function getEntries() { return state.entries.slice(); }

const api = { add, getEntries };
try { if (typeof window !== 'undefined') { window.__ui = window.__ui || {}; window.__ui.log = api; } } catch {}
export default api;


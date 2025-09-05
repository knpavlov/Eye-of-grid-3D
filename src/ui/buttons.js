export function init() {
  function mount() {
    document.getElementById('log-btn')?.addEventListener('click', () => {
      document.getElementById('log-panel')?.classList.remove('hidden');
    });
    document.getElementById('close-log-btn')?.addEventListener('click', () => {
      document.getElementById('log-panel')?.classList.add('hidden');
    });
    document.getElementById('help-btn')?.addEventListener('click', () => {
      document.getElementById('help-panel')?.classList.remove('hidden');
    });
    document.getElementById('close-help-btn')?.addEventListener('click', () => {
      document.getElementById('help-panel')?.classList.add('hidden');
    });
    document.getElementById('new-game-btn')?.addEventListener('click', () => location.reload());
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mount);
    } else {
      mount();
    }
  }
}

const api = { init };
try { if (typeof window !== 'undefined') { window.__ui = window.__ui || {}; window.__ui.buttons = api; } } catch {}
export default api;

// Основное меню и стартовый экран
export function open(opts = {}) {
  if (typeof document === 'undefined') return;
  if (document.getElementById('game-menu-overlay')) return; // уже открыто

  const { start = false } = opts;
  const overlay = document.createElement('div');
  overlay.id = 'game-menu-overlay';
  overlay.className = `fixed inset-0 z-50 flex flex-col items-center justify-center ${start ? 'bg-black' : 'bg-black bg-opacity-40'}`;

  // Логотип только при первом запуске
  if (start) {
    const logo = document.createElement('img');
    logo.src = 'textures/grid_of_judgment_logo.png';
    logo.alt = 'The Grid of Judgement';
    logo.className = 'w-64 mb-8';
    overlay.appendChild(logo);
  }

  const panel = document.createElement('div');
  panel.className = 'overlay-panel p-6 flex flex-col gap-2 w-64';
  overlay.appendChild(panel);

  const buttons = [
    { id: 'menu-online', text: 'Play Online', handler: playOnline },
    { id: 'menu-offline', text: 'Play Offline', handler: playOffline },
    { id: 'menu-deck', text: 'Deck Builder', handler: null, disabled: true },
    { id: 'menu-settings', text: 'Settings', handler: null, disabled: true },
    { id: 'menu-surrender', text: 'Surrender', handler: surrender },
    { id: 'menu-cancel', text: 'Cancel', handler: close },
  ];

  buttons.forEach(b => {
    const btn = document.createElement('button');
    btn.id = b.id;
    btn.textContent = b.text;
    btn.className = 'overlay-panel px-4 py-2 bg-slate-600 hover:bg-slate-700 transition-colors';
    if (b.disabled) {
      btn.disabled = true;
      btn.classList.add('opacity-50', 'cursor-not-allowed');
    } else if (b.handler) {
      btn.addEventListener('click', () => { b.handler(); });
    }
    panel.appendChild(btn);
  });

  document.body.appendChild(overlay);

  function close() {
    try { document.body.removeChild(overlay); } catch {}
  }

  function playOffline() {
    close();
    const ds = window.__ui?.deckSelect;
    if (ds && typeof ds.open === 'function') {
      ds.open(deck => {
        try { localStorage.setItem('selectedDeckId', deck.id); } catch {}
        window.__selectedDeckObj = deck;
        location.reload();
      });
    } else {
      location.reload();
    }
  }

  function playOnline() {
    close();
    const ds = window.__ui?.deckSelect;
    if (ds && typeof ds.open === 'function') {
      ds.open(deck => {
        try { localStorage.setItem('selectedDeckId', deck.id); } catch {}
        window.__selectedDeckObj = deck;
        window.__netClient?.findMatch?.();
      });
    } else {
      window.__netClient?.findMatch?.();
    }
  }

  function surrender() {
    if (confirm('Вы уверены, что хотите сдаться?')) {
      window.__netClient?.resign?.();
      close();
    }
  }

  return { close };
}

const api = { open };
try { if (typeof window !== 'undefined') { window.__ui = window.__ui || {}; window.__ui.menu = api; } } catch {}
export default api;

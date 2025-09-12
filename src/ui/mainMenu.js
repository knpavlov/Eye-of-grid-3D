// Главное меню игры
export function open(initial = false) {
  if (typeof document === 'undefined') return;
  if (document.getElementById('main-menu-overlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'main-menu-overlay';
  // при первом запуске затемняем фон, далее оставляем прозрачным
  overlay.className = `fixed inset-0 z-50 flex flex-col items-center justify-center ${initial ? 'bg-black bg-opacity-60' : 'bg-transparent'}`;

  if (initial) {
    const logo = document.createElement('img');
    logo.src = 'textures/grid_of_judgment_logo.png';
    logo.alt = 'The Grid of Judgement';
    logo.className = 'w-72 mb-6 select-none';
    overlay.appendChild(logo);
  }

  const panel = document.createElement('div');
  panel.className = 'overlay-panel p-6 flex flex-col gap-3 min-w-[12rem]';
  overlay.appendChild(panel);

  // вспомогательный генератор кнопок
  function addBtn(id, label, onClick, disabled = false) {
    const b = document.createElement('button');
    b.id = id;
    b.textContent = label;
    b.className = 'overlay-panel px-4 py-2 bg-slate-600 hover:bg-slate-700 glossy-btn transition-colors';
    if (disabled) {
      b.disabled = true;
      b.classList.add('opacity-50', 'cursor-not-allowed');
    }
    if (onClick) {
      b.addEventListener('click', onClick);
    }
    panel.appendChild(b);
  }

  addBtn('mm-play-online', 'Play Online', () => {
    close();
    window.__ui?.mainMenuActions?.playOnline?.();
  });
  addBtn('mm-play-offline', 'Play Offline', () => {
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
  });
  addBtn('mm-surrender', 'Surrender', () => {
    close();
    window.__ui?.mainMenuActions?.surrender?.();
  });
  addBtn('mm-deckbuilder', 'Deck Builder', null, true);
  addBtn('mm-settings', 'Settings', null, true);
  addBtn('mm-cancel', 'Cancel', () => close());

  document.body.appendChild(overlay);
}

export function close() {
  try { document.getElementById('main-menu-overlay')?.remove(); } catch {}
}

export default { open, close };

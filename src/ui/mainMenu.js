// Главное меню игры
let firstOpen = true;

export function open(initial = false) {
  if (typeof document === 'undefined') return;
  if (initial) firstOpen = true;
  const overlay = document.createElement('div');
  overlay.id = 'main-menu-overlay';
  const bgClass = firstOpen ? 'bg-black bg-opacity-90' : 'bg-black bg-opacity-50';
  overlay.className = `fixed inset-0 z-50 flex items-center justify-center ${bgClass}`;
  // При первом открытии меню останавливаем таймер хода
  if (firstOpen) {
    try {
      if (window.__turnTimerId) {
        clearInterval(window.__turnTimerId);
        window.__turnTimerId = null;
      }
    } catch {}
  }

  const panel = document.createElement('div');
  panel.className = 'overlay-panel p-6 w-60 flex flex-col items-center gap-3';
  overlay.appendChild(panel);

  if (firstOpen) {
    const logo = document.createElement('img');
    logo.src = 'textures/grid_of_judgment_logo.png';
    logo.className = 'w-48 mb-4';
    panel.appendChild(logo);
  }

  function addBtn(id, text, handler, disabled = false) {
    const btn = document.createElement('button');
    btn.id = id;
    btn.textContent = text;
    btn.className = 'w-full overlay-panel px-4 py-2 bg-slate-600 hover:bg-slate-700 transition-colors';
    if (disabled) {
      btn.classList.add('opacity-50', 'cursor-not-allowed');
      btn.disabled = true;
    } else {
      btn.addEventListener('click', handler);
    }
    panel.appendChild(btn);
  }

  function close() {
    try { document.body.removeChild(overlay); } catch {}
  }

  addBtn('mm-online', 'Play Online', () => {
    close();
    const ds = window.__ui?.deckSelect;
    if (ds && typeof ds.open === 'function') {
      ds.open(deck => {
        try { localStorage.setItem('selectedDeckId', deck.id); } catch {}
        window.__selectedDeckObj = deck;
        window.__net?.findMatch?.();
      });
    } else {
      window.__net?.findMatch?.();
    }
    firstOpen = false;
  });

  addBtn('mm-offline', 'Play Offline', () => {
    close();
    const ds = window.__ui?.deckSelect;
    if (ds && typeof ds.open === 'function') {
      ds.open(deck => {
        try {
          localStorage.setItem('selectedDeckId', deck.id);
          // Устанавливаем флаг для пропуска стартового меню после перезагрузки
          localStorage.setItem('skipMainMenu', '1');
        } catch {}
        window.__selectedDeckObj = deck;
        location.reload();
      });
    } else {
      try { localStorage.setItem('skipMainMenu', '1'); } catch {}
      location.reload();
    }
    firstOpen = false;
  });

  addBtn('mm-deck', 'Deck Builder', () => {}, true);
  addBtn('mm-settings', 'Settings', () => {}, true);

  if (!firstOpen) {
    addBtn('mm-surrender', 'Surrender', () => {
      close();
      const confirmModal = document.createElement('div');
      confirmModal.className = 'fixed inset-0 flex items-center justify-center bg-black bg-opacity-60 z-50';
      confirmModal.innerHTML = `<div class="overlay-panel p-6 space-y-4 text-center">
        <div>Вы уверены, что хотите сдаться?</div>
        <div class="flex gap-2 justify-center">
          <button id="mm-r-yes" class="overlay-panel px-4 py-2 bg-red-600 hover:bg-red-700">Да</button>
          <button id="mm-r-no" class="overlay-panel px-4 py-2">Нет</button>
        </div>
      </div>`;
      document.body.appendChild(confirmModal);
      confirmModal.querySelector('#mm-r-no').addEventListener('click', () => confirmModal.remove());
      confirmModal.querySelector('#mm-r-yes').addEventListener('click', () => {
        try { window.socket?.emit('resign'); } catch {}
        try { window.setWinner?.(1 - window.gameState.active, 'resign'); } catch {}
        confirmModal.remove();
        // После сдачи возвращаемся в стартовое меню
        open(true);
      });
    });

    addBtn('mm-cancel', 'Cancel', () => {
      close();
      firstOpen = false;
    });
  }

  document.body.appendChild(overlay);
}

const api = { open };
try {
  if (typeof window !== 'undefined') {
    window.__ui = window.__ui || {};
    window.__ui.mainMenu = api;
  }
} catch {}

export default api;

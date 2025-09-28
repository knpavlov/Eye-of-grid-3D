// Главное меню игры
import { getActiveUser } from '../auth/sessionStore.js';
import { logout as authLogout } from './authScreen.js';

let firstOpen = true;

export function open(initial = false) {
  if (typeof document === 'undefined') return;
  if (initial) firstOpen = true;
  const existing = document.getElementById('main-menu-overlay');
  if (existing) {
    try { document.body.removeChild(existing); } catch {}
  }
  const overlay = document.createElement('div');
  overlay.id = 'main-menu-overlay';
  // На стартовом экране фон полностью непрозрачный, чтобы скрыть игровое поле
  const bgClass = firstOpen ? 'bg-slate-900' : 'bg-black bg-opacity-50';
  overlay.className = `fixed inset-0 z-50 flex items-center justify-center ${bgClass}`;

  const panel = document.createElement('div');
  panel.className = 'overlay-panel p-6 w-60 flex flex-col items-center gap-3';
  overlay.appendChild(panel);

  const user = getActiveUser();
  if (user) {
    const userRow = document.createElement('div');
    userRow.className = 'w-full flex justify-end';
    const badge = document.createElement('div');
    badge.className = 'flex items-center gap-2 bg-slate-800/80 border border-slate-700 rounded-full px-3 py-1 text-xs text-slate-200';
    const name = document.createElement('span');
    name.className = 'font-semibold text-slate-100';
    name.textContent = user.nickname || user.email || 'Player';
    const logoutBtn = document.createElement('button');
    logoutBtn.type = 'button';
    logoutBtn.className = 'text-red-300 hover:text-red-200';
    logoutBtn.textContent = 'Log Out';
    logoutBtn.addEventListener('click', (evt) => {
      evt.preventDefault();
      close();
      authLogout();
    });
    badge.appendChild(name);
    badge.appendChild(logoutBtn);
    userRow.appendChild(badge);
    panel.appendChild(userRow);
  }

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
    // запускаем сетевую игру после выбора колоды
    const startOnline = deck => {
      try { localStorage.setItem('selectedDeckId', deck.id); } catch {}
      window.__selectedDeckObj = deck;
      firstOpen = false;
      window.__net?.findMatch?.(deck.id);
    };
    // если передумали — возвращаемся в стартовое меню
    const back = () => open(true);
    if (ds && typeof ds.open === 'function') {
      ds.open({ onConfirm: startOnline, onCancel: back });
    } else {
      firstOpen = false;
      window.__net?.findMatch?.(window.__selectedDeckObj?.id);
    }
  });

  addBtn('mm-offline', 'Play Offline', () => {
    close();
    const ds = window.__ui?.deckSelect;
    // старт офлайн-игры без перезагрузки страницы
    const startOffline = deck => {
      try { localStorage.setItem('selectedDeckId', deck.id); } catch {}
      window.__selectedDeckObj = deck;
      firstOpen = false;
      try {
        window.socket?.emit('leaveQueue');
        window.socket?.disconnect();
        window.NET_ACTIVE = false;
        window.__opponentDeckId = null;
        window.MY_SEAT = null;
        window.updateIndicator?.();
        window.updateInputLock?.();
      } catch {}
      try { window.initGame?.(); } catch {}
    };
    const back = () => open(true);
    if (ds && typeof ds.open === 'function') {
      ds.open({ onConfirm: startOffline, onCancel: back });
    } else {
      firstOpen = false;
      startOffline(window.__selectedDeckObj || (window.DECKS && window.DECKS[0]));
    }
  });

  addBtn('mm-deck', 'Deck Builder', () => {
    close();
    const ds = window.__ui?.deckSelect;
    const openEditor = (deck) => {
      const db = window.__ui?.deckBuilder;
      db?.open(deck, () => ds.open({ onCancel: () => open(true), onEdit: openEditor, onCreate: () => openEditor(null) }));
    };
    ds.open({ onCancel: () => open(true), onEdit: openEditor, onCreate: () => openEditor(null) });
  });
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
        try { window.location.reload(); } catch {}
      });
    });

    addBtn('mm-cancel', 'Cancel', () => {
      close();
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

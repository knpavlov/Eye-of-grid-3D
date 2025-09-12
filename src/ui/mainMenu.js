// Главное меню игры
import * as DeckSelect from './deckSelect.js';

let firstLaunch = true;

// открываем меню; при первом запуске поле игры скрывается и показывается логотип
export function open() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('game-menu')) return;
  const initial = firstLaunch;
  firstLaunch = false;

  const overlay = document.createElement('div');
  overlay.id = 'game-menu';
  overlay.className = 'fixed inset-0 z-50 flex flex-col items-center justify-center' +
    (initial ? ' bg-slate-900' : ' bg-black bg-opacity-50');

  if (initial) {
    const logo = document.createElement('img');
    logo.src = 'textures/grid_of_judgment_logo.png';
    logo.alt = 'The Grid of Judgement';
    logo.className = 'mb-6 w-80';
    overlay.appendChild(logo);
  }

  const panel = document.createElement('div');
  panel.className = 'overlay-panel p-6 flex flex-col gap-2 items-stretch w-48';
  overlay.appendChild(panel);

  // Вспомогательная функция создания кнопок
  function makeButton(text, handler, disabled=false) {
    const b = document.createElement('button');
    b.className = 'overlay-panel px-4 py-2 bg-slate-600 hover:bg-slate-700 glossy-btn transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
    b.textContent = text;
    if (disabled) b.disabled = true;
    if (handler) b.addEventListener('click', handler);
    return b;
  }

  // Играть онлайн
  panel.appendChild(makeButton('Play Online', () => {
    DeckSelect.open(deck => {
      try { localStorage.setItem('selectedDeckId', deck.id); } catch {}
      window.__selectedDeckObj = deck;
      try { window.__onFindMatchClick?.(); } catch {}
    }, () => { open(); });
    try { document.body.removeChild(overlay); } catch {}
  }));

  // Играть оффлайн
  panel.appendChild(makeButton('Play Offline', () => {
    DeckSelect.open(deck => {
      try { localStorage.setItem('selectedDeckId', deck.id); } catch {}
      window.__selectedDeckObj = deck;
      location.reload();
    }, () => { open(); });
    try { document.body.removeChild(overlay); } catch {}
  }));

  // Сдаться
  panel.appendChild(makeButton('Surrender', () => {
    const confirmModal = document.createElement('div');
    confirmModal.className = 'mp-modal';
    confirmModal.innerHTML = `<div class="mp-card">
      <div>Вы уверены, что хотите сдаться?</div>
      <div style="display:flex;gap:8px;justify-content:center;margin-top:10px">
        <button id="r-yes" class="mp-btn">Да</button>
        <button id="r-no" class="mp-btn">Нет</button>
      </div>
    </div>`;
    document.body.appendChild(confirmModal);
    confirmModal.querySelector('#r-no').addEventListener('click', ()=> confirmModal.remove());
    confirmModal.querySelector('#r-yes').addEventListener('click', ()=>{
      try { (window.socket || {}).emit('resign'); } catch {}
      try { confirmModal.remove(); } catch {}
      try { document.body.removeChild(overlay); } catch {}
    });
  }));

  // Заглушки
  panel.appendChild(makeButton('Deck Builder', null, true));
  panel.appendChild(makeButton('Settings', null, true));

  // Закрыть меню
  panel.appendChild(makeButton('Cancel', () => {
    try { document.body.removeChild(overlay); } catch {}
  }));

  document.body.appendChild(overlay);
}

const api = { open };
try { if (typeof window !== 'undefined') { window.__ui = window.__ui || {}; window.__ui.mainMenu = api; } } catch {}
export default api;

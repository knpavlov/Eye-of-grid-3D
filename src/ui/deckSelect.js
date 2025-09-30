// Меню выбора колоды
import { DECKS, removeDeck as removeDeckLocal, onDecksChanged } from '../core/decks.js';
import { refreshDecks, deleteDeck as deleteDeckRemote } from '../net/decks.js';
import { show as showNotification } from './notifications.js';

function pickDeckImage(deck) {
  // выбираем самую дорогую по мане карту; при равенстве — случайная
  const costs = deck.cards.map(c => c.cost || 0);
  const max = Math.max(...costs);
  const candidates = deck.cards.filter(c => (c.cost || 0) === max);
  const card = candidates[Math.floor(Math.random() * candidates.length)];
  return `card images/${card.id}.png`;
}

export function open(opts = {}) {
  if (typeof document === 'undefined') return;
  const { onConfirm, onCancel, onEdit, onCreate } = opts;
  let selectedId = null;
  let unsubscribe = null;

  const overlay = document.createElement('div');
  overlay.id = 'deck-select-overlay';
  overlay.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80 backdrop-blur-sm';

  const panel = document.createElement('div');
  panel.className = 'bg-slate-800 p-4 rounded-lg w-[26rem] max-h-[90vh] flex flex-col shadow-2xl';
  overlay.appendChild(panel);

  const title = document.createElement('div');
  title.className = 'text-lg font-semibold mb-3';
  title.textContent = 'Choose a deck';
  panel.appendChild(title);

  const list = document.createElement('div');
  list.className = 'flex-1 overflow-y-auto space-y-3 px-2 max-h-[32rem] deck-scroll';
  panel.appendChild(list);

  const btnWrap = document.createElement('div');
  btnWrap.className = 'flex justify-between gap-2 mt-4';
  panel.appendChild(btnWrap);

  const leftBtns = document.createElement('div');
  leftBtns.className = 'flex gap-2';
  btnWrap.appendChild(leftBtns);
  const rightBtns = document.createElement('div');
  rightBtns.className = 'flex gap-2';
  btnWrap.appendChild(rightBtns);

  let editBtn = null;
  let delBtn = null;
  let okBtn = null;

  function getSelectedDeck() {
    return DECKS.find(d => d.id === selectedId) || null;
  }

  function updateSelectionClasses() {
    [...list.children].forEach(el => {
      const active = el.dataset.deckId === selectedId;
      el.classList.toggle('border-yellow-400', active);
      el.classList.toggle('border-slate-700', !active);
    });
  }

  function updateButtonsState() {
    const hasDeck = !!getSelectedDeck();
    if (editBtn) editBtn.disabled = !hasDeck;
    if (delBtn) delBtn.disabled = !hasDeck;
    if (okBtn) okBtn.disabled = !hasDeck;
  }

  function setSelected(id) {
    selectedId = id || null;
    updateSelectionClasses();
    updateButtonsState();
  }

  function cleanup() {
    unsubscribe?.();
    try { document.body.removeChild(overlay); } catch {}
  }

  function closeAnd(cb) {
    cleanup();
    cb && cb();
  }

  if (onEdit) {
    editBtn = document.createElement('button');
    editBtn.className = 'overlay-panel px-3 py-1.5 bg-slate-600 hover:bg-slate-700 glossy-btn transition-colors';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => {
      const deck = getSelectedDeck();
      if (!deck) return;
      closeAnd(() => onEdit(deck));
    });
    leftBtns.appendChild(editBtn);

    delBtn = document.createElement('button');
    delBtn.className = 'overlay-panel px-3 py-1.5 bg-red-600 hover:bg-red-700 glossy-btn transition-colors';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', async () => {
      const deck = getSelectedDeck();
      if (!deck) return;

      // Подтверждаем удаление, чтобы избежать случайных действий
      let accepted = true;
      try {
        if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
          accepted = window.confirm(`Delete deck "${deck.name}"?`);
        }
      } catch {}
      if (!accepted) return;

      const prevText = delBtn.textContent;
      delBtn.disabled = true;
      delBtn.textContent = 'Deleting…';

      try {
        await deleteDeckRemote(deck.id);
        showNotification('Deck deleted on the server', 'success');
      } catch (err) {
        console.warn('[deckSelect] Ошибка удаления колоды', err);
        const status = err?.status;
        const isNetworkError = err?.name === 'TypeError' || err?.message?.includes('Failed to fetch');
        if (status === 404) {
          // Колода уже отсутствует на сервере — очищаем локальную копию
          removeDeckLocal(deck.id);
          showNotification('Deck already missing on the server — removed locally', 'success');
        } else if (status === 503 || status === 0 || isNetworkError) {
          const removed = removeDeckLocal(deck.id);
          const message = removed
            ? 'Server unavailable — deck removed locally'
            : 'Server unavailable — unable to remove deck';
          showNotification(message, 'error');
        } else {
          const message = err?.message || 'Unable to delete deck';
          showNotification(message, 'error');
        }
      } finally {
        delBtn.disabled = false;
        delBtn.textContent = prevText;
      }
    });
    leftBtns.appendChild(delBtn);

    const createBtn = document.createElement('button');
    createBtn.className = 'overlay-panel px-3 py-1.5 bg-slate-600 hover:bg-slate-700 glossy-btn transition-colors';
    createBtn.textContent = 'Create New Deck';
    createBtn.addEventListener('click', () => closeAnd(() => onCreate && onCreate()));
    leftBtns.appendChild(createBtn);
  }

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'overlay-panel px-3 py-1.5 bg-slate-600 hover:bg-slate-700 glossy-btn transition-colors';
  cancelBtn.textContent = 'Back';
  cancelBtn.addEventListener('click', () => closeAnd(onCancel));
  rightBtns.appendChild(cancelBtn);

  if (onConfirm) {
    okBtn = document.createElement('button');
    okBtn.className = 'overlay-panel px-3 py-1.5 bg-slate-600 hover:bg-slate-700 glossy-btn transition-colors';
    okBtn.textContent = 'Confirm';
    okBtn.addEventListener('click', () => {
      const deck = getSelectedDeck();
      if (!deck) return;
      closeAnd(() => onConfirm(deck));
    });
    rightBtns.appendChild(okBtn);
  }

  function renderList() {
    const decks = DECKS;
    list.innerHTML = '';
    if (!decks.length) {
      const empty = document.createElement('div');
      empty.className = 'text-center text-sm text-slate-300 py-6';
      empty.textContent = 'Нет доступных колод';
      list.appendChild(empty);
      setSelected(null);
      return;
    }
    if (!selectedId || !decks.some(d => d.id === selectedId)) {
      selectedId = decks[0].id;
    }
    decks.forEach(deck => {
      const item = document.createElement('div');
      item.dataset.deckId = deck.id;
      item.className = [
        'relative flex h-24 cursor-pointer rounded-md overflow-hidden',
        'border-2 border-slate-700 transition-transform hover:bg-slate-700/30',
        'hover:scale-[1.02] mx-1',
      ].join(' ');
      if (deck.id === selectedId) item.classList.add('border-yellow-400');

      const imgWrap = document.createElement('div');
      imgWrap.className = 'relative w-40 h-full flex-shrink-0 overflow-hidden';
      const img = document.createElement('img');
      img.src = pickDeckImage(deck);
      img.className = 'w-full h-full object-cover';
      imgWrap.appendChild(img);
      const fade = document.createElement('div');
      fade.className = 'absolute inset-0 bg-gradient-to-r from-transparent to-slate-800';
      imgWrap.appendChild(fade);
      item.appendChild(imgWrap);

      const text = document.createElement('div');
      text.className = 'pl-4 pr-2 flex flex-col justify-center';
      const nm = document.createElement('div');
      nm.className = 'font-semibold';
      nm.textContent = deck.name;
      const ds = document.createElement('div');
      ds.className = 'text-sm text-slate-300';
      ds.textContent = deck.description || '';
      text.appendChild(nm);
      text.appendChild(ds);
      item.appendChild(text);

      item.addEventListener('click', () => setSelected(deck.id));
      list.appendChild(item);
    });
    updateSelectionClasses();
    updateButtonsState();
  }

  document.body.appendChild(overlay);
  renderList();
  unsubscribe = onDecksChanged(() => renderList());
  refreshDecks().catch(err => console.warn('[deckSelect] Не удалось обновить список колод', err));
}

const api = { open };
try { if (typeof window !== 'undefined') { window.__ui = window.__ui || {}; window.__ui.deckSelect = api; } } catch {}
export default api;

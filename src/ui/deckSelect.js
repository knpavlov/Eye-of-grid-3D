// Меню выбора колоды
import { getDecks, subscribeToDecks } from '../core/decks.js';
import { refreshDecks } from '../lib/deckController.js';

function pickDeckImage(deck) {
  if (!deck || !Array.isArray(deck.cards) || deck.cards.length === 0) {
    return 'textures/card_deck_side_view.jpeg';
  }
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
  const state = {
    decks: getDecks(),
    selected: 0,
  };

  const overlay = document.createElement('div');
  overlay.id = 'deck-select-overlay';
  overlay.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60';

  const panel = document.createElement('div');
  panel.className = 'bg-slate-800 p-4 rounded-lg w-[26rem] max-h-[90vh] flex flex-col shadow-2xl';
  overlay.appendChild(panel);

  const title = document.createElement('div');
  title.className = 'text-lg font-semibold mb-3';
  title.textContent = 'Choose a deck';
  panel.appendChild(title);

  const list = document.createElement('div');
  list.className = 'flex-1 overflow-y-auto space-y-3 px-2 max-h-64 deck-scroll';
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

  let unsubscribe = null;
  let confirmBtn = null;
  let editBtn = null;

  const cleanup = (action) => {
    if (unsubscribe) unsubscribe();
    unsubscribe = null;
    try { document.body.removeChild(overlay); } catch {}
    if (action === 'cancel') {
      onCancel && onCancel();
    }
  };

  function updateButtons() {
    const hasDecks = state.decks.length > 0;
    if (confirmBtn) confirmBtn.disabled = !hasDecks;
    if (editBtn) editBtn.disabled = !hasDecks;
  }

  function renderList() {
    list.innerHTML = '';
    if (!state.decks.length) {
      const empty = document.createElement('div');
      empty.className = 'text-center text-sm text-slate-300 py-6';
      empty.textContent = 'Колоды пока не найдены.';
      list.appendChild(empty);
      state.selected = 0;
      updateButtons();
      return;
    }

    if (state.selected >= state.decks.length) {
      state.selected = Math.max(0, state.decks.length - 1);
    }

    state.decks.forEach((deck, idx) => {
      const item = document.createElement('div');
      item.className = 'relative flex h-24 cursor-pointer rounded-md overflow-hidden border-2 transition transform hover:bg-slate-700/30 hover:scale-[1.02] mx-1';
      item.classList.add(idx === state.selected ? 'border-yellow-400' : 'border-slate-700');

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

      item.addEventListener('click', () => {
        state.selected = idx;
        renderList();
      });

      list.appendChild(item);
    });

    updateButtons();
  }

  if (onEdit) {
    const edit = document.createElement('button');
    edit.className = 'overlay-panel px-3 py-1.5 bg-slate-600 hover:bg-slate-700 glossy-btn transition-colors';
    edit.textContent = 'Edit';
    edit.addEventListener('click', () => {
      const deck = state.decks[state.selected];
      if (!deck) return;
      cleanup();
      onEdit(deck);
    });
    leftBtns.appendChild(edit);
    editBtn = edit;

    const createBtn = document.createElement('button');
    createBtn.className = 'overlay-panel px-3 py-1.5 bg-slate-600 hover:bg-slate-700 glossy-btn transition-colors';
    createBtn.textContent = 'Create New Deck';
    createBtn.addEventListener('click', () => {
      cleanup();
      onCreate && onCreate();
    });
    leftBtns.appendChild(createBtn);
  }

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'overlay-panel px-3 py-1.5 bg-slate-600 hover:bg-slate-700 glossy-btn transition-colors';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => cleanup('cancel'));
  rightBtns.appendChild(cancelBtn);

  if (onConfirm) {
    const okBtn = document.createElement('button');
    okBtn.className = 'overlay-panel px-3 py-1.5 bg-slate-600 hover:bg-slate-700 glossy-btn transition-colors';
    okBtn.textContent = 'Confirm';
    okBtn.addEventListener('click', () => {
      const deck = state.decks[state.selected];
      if (!deck) return;
      cleanup();
      onConfirm(deck);
    });
    rightBtns.appendChild(okBtn);
    confirmBtn = okBtn;
  }

  unsubscribe = subscribeToDecks(next => {
    state.decks = next;
    renderList();
  });

  renderList();
  document.body.appendChild(overlay);

  refreshDecks({ silent: true }).catch(err => {
    console.warn('[deckSelect] Не удалось обновить список колод', err);
  });
}

const api = { open };
try { if (typeof window !== 'undefined') { window.__ui = window.__ui || {}; window.__ui.deckSelect = api; } } catch {}
export default api;

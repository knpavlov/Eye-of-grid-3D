// Редактор колод (упрощённая версия)
import { CARDS } from '../core/cards.js';
import { DECKS, addDeck, updateDeck, saveDecks } from '../core/decks.js';
import { show as showNotification } from './notifications.js';

// Создание нового ID
function makeId() {
  return 'DECK_' + Math.random().toString(36).slice(2, 9);
}

export function open(deck = null, onDone) {
  if (typeof document === 'undefined') return;
  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 z-50 flex items-start justify-center bg-black bg-opacity-60 overflow-auto';

  const panel = document.createElement('div');
  panel.className = 'bg-slate-800 mt-6 p-4 rounded-lg w-[90vw] h-[90vh] flex flex-col';
  overlay.appendChild(panel);

  const topBar = document.createElement('div');
  topBar.className = 'flex items-center gap-4 mb-4';
  panel.appendChild(topBar);

  const searchInput = document.createElement('input');
  searchInput.placeholder = 'Search';
  searchInput.className = 'overlay-panel px-2 py-1 flex-1';
  topBar.appendChild(searchInput);

  const main = document.createElement('div');
  main.className = 'flex flex-1 overflow-hidden';
  panel.appendChild(main);

  // Левая панель
  const left = document.createElement('div');
  left.className = 'w-64 flex-shrink-0 flex flex-col border-r border-slate-700 pr-2';
  main.appendChild(left);

  const nameInput = document.createElement('input');
  nameInput.placeholder = 'Deck name';
  nameInput.className = 'overlay-panel mb-2 px-2 py-1';
  left.appendChild(nameInput);

  const deckList = document.createElement('div');
  deckList.className = 'flex-1 overflow-y-auto space-y-1 text-sm';
  left.appendChild(deckList);

  const summary = document.createElement('div');
  summary.className = 'mt-2 text-center';
  left.appendChild(summary);

  const doneBtn = document.createElement('button');
  doneBtn.className = 'overlay-panel mt-2 px-3 py-1.5 bg-slate-600 hover:bg-slate-700';
  doneBtn.textContent = 'Done';
  left.appendChild(doneBtn);

  // Каталог
  const catalog = document.createElement('div');
  catalog.className = 'flex-1 overflow-y-auto grid grid-cols-4 gap-2 pl-4';
  main.appendChild(catalog);

  // Состояние редактируемой колоды
  const working = deck ? {
    id: deck.id,
    name: deck.name,
    description: deck.description || '',
    cards: [...deck.cards],
  } : { id: makeId(), name: '', description: '', cards: [] };

  function renderDeck() {
    deckList.innerHTML = '';
    const grouped = {};
    working.cards.forEach(c => {
      grouped[c.id] = grouped[c.id] || { card: c, count: 0 };
      grouped[c.id].count++;
    });
    Object.values(grouped).forEach(({ card, count }) => {
      const row = document.createElement('div');
      row.className = 'flex items-center justify-between overlay-panel px-1';
      row.textContent = `${card.name}`;
      const cnt = document.createElement('span');
      cnt.textContent = count;
      row.appendChild(cnt);
      row.addEventListener('click', () => {
        const i = working.cards.findIndex(x => x.id === card.id);
        if (i >= 0) working.cards.splice(i, 1);
        renderDeck();
        updateSummary();
      });
      deckList.appendChild(row);
    });
  }

  function updateSummary() {
    summary.textContent = `${working.cards.length}/20`;
  }

  function addCard(card) {
    const copies = working.cards.filter(c => c.id === card.id).length;
    if (copies >= 3) {
      showNotification('Лимит копий достигнут', 'error');
      return;
    }
    working.cards.push(card);
    renderDeck();
    updateSummary();
  }

  function renderCatalog() {
    catalog.innerHTML = '';
    const query = searchInput.value.toLowerCase();
    const cards = Object.values(CARDS).filter(c =>
      c.name.toLowerCase().includes(query) ||
      (c.desc || '').toLowerCase().includes(query)
    );
    cards.forEach(card => {
      const item = document.createElement('div');
      item.className = 'overlay-panel p-2 text-center cursor-pointer hover:bg-slate-700';
      const img = document.createElement('img');
      img.src = `card images/${card.id}.png`;
      img.className = 'w-full h-32 object-cover mb-1';
      item.appendChild(img);
      const nm = document.createElement('div');
      nm.className = 'text-xs';
      nm.textContent = card.name;
      item.appendChild(nm);
      item.addEventListener('click', () => addCard(card));
      catalog.appendChild(item);
    });
  }

  searchInput.addEventListener('input', renderCatalog);

  doneBtn.addEventListener('click', () => {
    working.name = nameInput.value.trim() || 'Untitled';
    if (deck) {
      updateDeck(deck.id, working);
    } else {
      addDeck(working);
    }
    saveDecks();
    document.body.removeChild(overlay);
    onDone && onDone();
  });

  nameInput.value = working.name;
  renderDeck();
  updateSummary();
  renderCatalog();

  document.body.appendChild(overlay);
}

const api = { open };
try { if (typeof window !== 'undefined') { window.__ui = window.__ui || {}; window.__ui.deckBuilder = api; } } catch {}
export default api;

// Редактор колод: позволяет собирать набор карт и сохранять его
import { CARDS } from '../core/cards.js';
import { addDeck, updateDeck } from '../core/decks.js';

// Получить массив всех карт
const ALL_CARDS = Object.values(CARDS);

export function open({ deck = null, onDone } = {}) {
  if (typeof document === 'undefined') return;
  // текущее состояние редактируемой колоды
  const deckId = deck?.id || null;
  const deckCards = deck?.cards ? deck.cards.map(c => c.id || c) : [];
  let deckName = deck?.name || '';

  // выбранные элементы (по умолчанию все)
  const elements = ['FIRE', 'WATER', 'EARTH', 'FOREST', 'BIOLITH'];
  const activeElems = new Set(elements);

  // создаём основной оверлей
  const overlay = document.createElement('div');
  overlay.id = 'deck-builder-overlay';
  overlay.className = 'fixed inset-0 z-50 flex flex-col bg-slate-900 text-slate-100';

  // верхняя панель фильтров
  const top = document.createElement('div');
  top.className = 'p-2 flex items-center gap-2 bg-slate-800';
  overlay.appendChild(top);

  // переключатели стихий
  const elemWrap = document.createElement('div');
  elemWrap.className = 'flex gap-1';
  elements.forEach(el => {
    const lbl = document.createElement('label');
    lbl.className = 'flex items-center gap-1 text-xs';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = true;
    cb.addEventListener('change', () => {
      if (cb.checked) activeElems.add(el); else activeElems.delete(el);
      renderCatalog();
    });
    lbl.appendChild(cb);
    lbl.appendChild(document.createTextNode(el.toLowerCase()));
    elemWrap.appendChild(lbl);
  });
  top.appendChild(elemWrap);

  // поиск
  const search = document.createElement('input');
  search.type = 'text';
  search.placeholder = 'Search...';
  search.className = 'overlay-panel px-2 py-1 text-sm bg-slate-700';
  search.addEventListener('input', renderCatalog);
  top.appendChild(search);

  // основная область: левая панель + каталог
  const main = document.createElement('div');
  main.className = 'flex flex-1 overflow-hidden';
  overlay.appendChild(main);

  // левая панель колоды
  const left = document.createElement('div');
  left.className = 'w-64 p-2 bg-slate-800 flex flex-col';
  main.appendChild(left);

  const nameInput = document.createElement('input');
  nameInput.value = deckName;
  nameInput.placeholder = 'Deck name';
  nameInput.className = 'overlay-panel px-2 py-1 mb-2 text-sm bg-slate-700';
  left.appendChild(nameInput);

  const deckList = document.createElement('div');
  deckList.className = 'flex-1 overflow-y-auto space-y-1 text-sm';
  left.appendChild(deckList);

  const summary = document.createElement('div');
  summary.className = 'mt-2 text-sm';
  left.appendChild(summary);

  const doneBtn = document.createElement('button');
  doneBtn.className = 'overlay-panel mt-2 px-3 py-1.5 bg-slate-600 hover:bg-slate-700';
  doneBtn.textContent = 'Done';
  doneBtn.addEventListener('click', () => {
    deckName = nameInput.value.trim() || 'New Deck';
    const data = { id: deckId || `DECK_${Date.now()}`, name: deckName, cards: [...deckCards] };
    if (deckId) updateDeck(deckId, data); else addDeck(data);
    document.body.removeChild(overlay);
    onDone && onDone(data);
  });
  left.appendChild(doneBtn);

  // область каталога
  const catalog = document.createElement('div');
  catalog.className = 'flex-1 overflow-y-auto p-2 grid grid-cols-2 md:grid-cols-4 gap-2';
  main.appendChild(catalog);

  function addCard(id) {
    deckCards.push(id);
    renderDeck();
  }

  function removeCard(id) {
    const idx = deckCards.indexOf(id);
    if (idx !== -1) deckCards.splice(idx, 1);
    renderDeck();
  }

  function renderDeck() {
    deckList.innerHTML = '';
    const counts = {};
    deckCards.forEach(id => { counts[id] = (counts[id] || 0) + 1; });
    const entries = Object.keys(counts).map(id => ({ card: CARDS[id], count: counts[id] }))
      .sort((a, b) => (a.card.cost || 0) - (b.card.cost || 0));
    entries.forEach(({ card, count }) => {
      const row = document.createElement('div');
      row.className = 'flex items-center gap-1 cursor-pointer hover:bg-slate-700 px-1';
      const img = document.createElement('img');
      img.src = `card images/${card.id}.png`;
      img.className = 'w-8 h-8 object-cover';
      row.appendChild(img);
      const name = document.createElement('div');
      name.className = 'flex-1 truncate';
      name.textContent = card.name;
      row.appendChild(name);
      const costs = document.createElement('div');
      costs.className = 'flex gap-1 text-xs';
      costs.innerHTML = `<span class="px-1 bg-slate-700 rounded">${card.cost || 0}</span><span class="px-1 bg-slate-700 rounded">${card.activation || 0}</span>`;
      row.appendChild(costs);
      const cnt = document.createElement('div');
      cnt.className = 'px-1 bg-slate-700 rounded text-xs';
      cnt.textContent = count;
      row.appendChild(cnt);
      row.addEventListener('click', () => removeCard(card.id));
      deckList.appendChild(row);
    });
    summary.textContent = `${deckCards.length}/20 cards`;
  }

  function renderCatalog() {
    catalog.innerHTML = '';
    const term = search.value.toLowerCase();
    ALL_CARDS.filter(c => activeElems.has(c.element))
      .filter(c => c.name.toLowerCase().includes(term) || (c.desc || '').toLowerCase().includes(term))
      .forEach(card => {
        const cell = document.createElement('div');
        cell.className = 'overlay-panel p-1 cursor-pointer hover:bg-slate-700 flex flex-col';
        const img = document.createElement('img');
        img.src = `card images/${card.id}.png`;
        img.className = 'w-full h-32 object-cover mb-1';
        cell.appendChild(img);
        const nm = document.createElement('div');
        nm.className = 'text-xs font-semibold truncate';
        nm.textContent = card.name;
        cell.appendChild(nm);
        const cost = document.createElement('div');
        cost.className = 'text-[10px]';
        cost.textContent = `C:${card.cost || 0} A:${card.activation || 0}`;
        cell.appendChild(cost);
        cell.addEventListener('click', () => addCard(card.id));
        catalog.appendChild(cell);
      });
  }

  renderDeck();
  renderCatalog();
  document.body.appendChild(overlay);
}

const api = { open };
try { if (typeof window !== 'undefined') { window.__ui = window.__ui || {}; window.__ui.deckBuilder = api; } } catch {}
export default api;

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

  // Скрываем диагностические панели, чтобы не мешали редактору
  const hidden = [];
  ['#mod-status', '#mp-debug', '.mp-ind'].forEach(sel => {
    const el = document.querySelector(sel);
    if (el) { hidden.push({ el, display: el.style.display }); el.style.display = 'none'; }
  });

  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 z-50 flex items-start justify-center bg-black bg-opacity-60 overflow-auto';

  const panel = document.createElement('div');
  panel.className = 'bg-slate-800 mt-6 p-4 rounded-lg w-[90vw] h-[90vh] flex flex-col';
  overlay.appendChild(panel);

  // Подсказка при наведении на карточку в колоде
  const tooltip = document.createElement('div');
  tooltip.className = 'fixed z-50 px-2 py-1 bg-slate-700 text-xs rounded pointer-events-none hidden';
  document.body.appendChild(tooltip);

  const topBar = document.createElement('div');
  topBar.className = 'flex items-center gap-4 mb-4 relative';
  panel.appendChild(topBar);

  // --- Переключатель стихий ---
  const elementBtn = document.createElement('button');
  elementBtn.className = 'overlay-panel px-2 py-1';
  elementBtn.textContent = 'Элементы';
  topBar.appendChild(elementBtn);

  const elementMenu = document.createElement('div');
  elementMenu.className = 'overlay-panel absolute top-full mt-1 left-0 p-2 bg-slate-700 rounded hidden';
  topBar.appendChild(elementMenu);

  const ELEMENTS = [
    { id: 'FIRE', label: '🔥 Огонь' },
    { id: 'WATER', label: '💧 Вода' },
    { id: 'EARTH', label: '⛰️ Земля' },
    { id: 'FOREST', label: '🌳 Лес' },
    { id: 'BIOLITH', label: '⚙️ Biolith' },
  ];
  const selectedElements = new Set(ELEMENTS.map(e => e.id));

  const selectAllBtn = document.createElement('button');
  selectAllBtn.className = 'overlay-panel mb-2 px-2 py-1 w-full';
  selectAllBtn.textContent = 'Select / Deselect All';
  elementMenu.appendChild(selectAllBtn);

  ELEMENTS.forEach(el => {
    const lbl = document.createElement('label');
    lbl.className = 'flex items-center gap-1 text-sm';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = true;
    cb.dataset.el = el.id;
    lbl.appendChild(cb);
    const span = document.createElement('span');
    span.textContent = el.label;
    lbl.appendChild(span);
    elementMenu.appendChild(lbl);
    cb.addEventListener('change', () => {
      if (cb.checked) selectedElements.add(el.id); else selectedElements.delete(el.id);
      renderCatalog();
    });
  });

  elementBtn.addEventListener('click', () => {
    elementMenu.classList.toggle('hidden');
  });

  selectAllBtn.addEventListener('click', () => {
    const all = selectedElements.size !== ELEMENTS.length;
    selectedElements.clear();
    ELEMENTS.forEach(el => {
      const input = elementMenu.querySelector(`input[data-el="${el.id}"]`);
      if (all) { selectedElements.add(el.id); input.checked = true; }
      else { input.checked = false; }
    });
    renderCatalog();
  });

  const outsideClick = (e) => {
    if (!topBar.contains(e.target)) elementMenu.classList.add('hidden');
  };
  document.addEventListener('click', outsideClick);

  // --- Кнопка фильтров ---
  const filterBtn = document.createElement('button');
  filterBtn.className = 'overlay-panel px-2 py-1';
  filterBtn.textContent = 'Фильтры';
  topBar.appendChild(filterBtn);

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

  // --- Состояние фильтров ---
  const typeFilter = new Set(['UNIT', 'SPELL']);
  const summonFilter = new Set(Array.from({ length: 8 }, (_, i) => i));
  const actionFilter = new Set(Array.from({ length: 8 }, (_, i) => i));

  function openFilters() {
    const fOv = document.createElement('div');
    fOv.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60';
    const box = document.createElement('div');
    box.className = 'bg-slate-800 p-4 rounded-lg w-80 space-y-4';
    fOv.appendChild(box);

    const addSection = (title) => {
      const h = document.createElement('div');
      h.className = 'font-bold mb-2';
      h.textContent = title;
      box.appendChild(h);
    };

    // Тип
    addSection('By Type');
    ['UNIT', 'SPELL'].forEach(t => {
      const lbl = document.createElement('label');
      lbl.className = 'flex items-center gap-1 text-sm mb-1';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = typeFilter.has(t);
      lbl.appendChild(cb);
      lbl.appendChild(document.createTextNode(t === 'UNIT' ? 'Creatures' : 'Spells'));
      cb.addEventListener('change', () => {
        if (cb.checked) typeFilter.add(t); else typeFilter.delete(t);
      });
      box.appendChild(lbl);
    });

    // Фильтр по стоимости призыва
    addSection('By Summoning Cost');
    for (let i = 0; i <= 7; i++) {
      const lbl = document.createElement('label');
      lbl.className = 'flex items-center gap-1 text-sm mb-1';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.dataset.cost = String(i);
      cb.checked = summonFilter.size === 0 || summonFilter.has(i);
      lbl.appendChild(cb);
      lbl.appendChild(document.createTextNode(i === 7 ? '7+' : String(i)));
      cb.addEventListener('change', () => {
        if (cb.checked) summonFilter.add(i); else summonFilter.delete(i);
      });
      box.appendChild(lbl);
    }

    // Фильтр по стоимости действия
    addSection('By Action Cost');
    for (let i = 0; i <= 7; i++) {
      const lbl = document.createElement('label');
      lbl.className = 'flex items-center gap-1 text-sm mb-1';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.dataset.act = String(i);
      cb.checked = actionFilter.size === 0 || actionFilter.has(i);
      lbl.appendChild(cb);
      lbl.appendChild(document.createTextNode(i === 7 ? '7+' : String(i)));
      cb.addEventListener('change', () => {
        if (cb.checked) actionFilter.add(i); else actionFilter.delete(i);
      });
      box.appendChild(lbl);
    }

    const applyBtn = document.createElement('button');
    applyBtn.className = 'overlay-panel px-3 py-1.5 bg-slate-600 hover:bg-slate-700 w-full';
    applyBtn.textContent = 'Apply';
    box.appendChild(applyBtn);

    applyBtn.addEventListener('click', () => {
      document.body.removeChild(fOv);
      renderCatalog();
    });

    document.body.appendChild(fOv);
  }

  filterBtn.addEventListener('click', openFilters);

  // Состояние редактируемой колоды
  const working = deck ? {
    id: deck.id,
    name: deck.name,
    description: deck.description || '',
    cards: [...deck.cards],
  } : { id: makeId(), name: '', description: '', cards: [] };

  const ART_OFFSET = 0; // смещение изображения по вертикали

  function renderDeck() {
    deckList.innerHTML = '';
    const byCost = {};
    working.cards.forEach(c => {
      const cost = c.cost || 0;
      byCost[cost] = byCost[cost] || {};
      const g = byCost[cost];
      g[c.id] = g[c.id] || { card: c, count: 0 };
      g[c.id].count++;
    });
    Object.keys(byCost).sort((a, b) => a - b).forEach(cost => {
      const header = document.createElement('div');
      header.className = 'text-xs text-slate-400 mt-2';
      header.textContent = `Cost ${cost}`;
      deckList.appendChild(header);
      Object.values(byCost[cost]).forEach(({ card, count }) => {
        const row = document.createElement('div');
        row.className = 'flex items-center gap-1 overlay-panel px-1 cursor-pointer';

        const sc = document.createElement('span');
        sc.className = 'w-5 h-5 flex items-center justify-center rounded-full bg-slate-700 text-[10px]';
        sc.textContent = card.cost ?? 0;
        row.appendChild(sc);

        const ac = document.createElement('span');
        ac.className = 'w-5 h-5 flex items-center justify-center rounded-full bg-slate-700 text-[10px]';
        ac.textContent = card.activation ?? 0;
        row.appendChild(ac);

        const art = document.createElement('div');
        art.className = 'w-8 h-12 bg-cover bg-center';
        art.style.backgroundImage = `url(card images/${card.id}.png)`;
        art.style.backgroundPosition = `center ${ART_OFFSET}px`;
        row.appendChild(art);

        const nm = document.createElement('div');
        nm.className = 'flex-1 truncate';
        nm.textContent = card.name;
        row.appendChild(nm);

        const cnt = document.createElement('span');
        cnt.textContent = count;
        row.appendChild(cnt);

        row.addEventListener('mouseenter', (e) => {
          tooltip.innerHTML = `<b>Atk ${card.atk}</b> / <b>HP ${card.hp}</b><br>${card.desc || ''}`;
          tooltip.style.left = e.clientX + 12 + 'px';
          tooltip.style.top = e.clientY + 12 + 'px';
          tooltip.classList.remove('hidden');
        });
        row.addEventListener('mouseleave', () => tooltip.classList.add('hidden'));

        row.addEventListener('click', () => {
          const i = working.cards.findIndex(x => x.id === card.id);
          if (i >= 0) working.cards.splice(i, 1);
          renderDeck();
          updateSummary();
        });
        deckList.appendChild(row);
      });
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
    const cards = Object.values(CARDS).filter(c => {
      const inQuery = c.name.toLowerCase().includes(query) || (c.desc || '').toLowerCase().includes(query);
      const inElement = selectedElements.has(c.element);
      const inType = typeFilter.has(c.type);
      const sCost = Math.min(c.cost || 0, 7);
      const aCost = Math.min(c.activation || 0, 7);
      const inSummon = summonFilter.has(sCost);
      const inAction = actionFilter.has(aCost);
      return inQuery && inElement && inType && inSummon && inAction;
    });
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
    document.removeEventListener('click', outsideClick);
    tooltip.remove();
    hidden.forEach(h => { h.el.style.display = h.display; });
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

// Редактор колод (расширенная версия фронтенда)
// Логика отделена от визуализации, чтобы упростить перенос на Unity

import { CARDS } from '../core/cards.js';
import { addDeck, updateDeck, saveDecks } from '../core/decks.js';
import { show as showNotification } from './notifications.js';

// Генерация ID новой колоды
function makeId() {
  return 'DECK_' + Math.random().toString(36).slice(2, 9);
}

// Иконки стихий (нейтральная иконка закодирована в base64)
const ELEMENTS = [
  { id: 'FIRE', label: 'Fire', icon: 'textures/tile_fire.png' },
  { id: 'WATER', label: 'Water', icon: 'textures/tile_water.png' },
  { id: 'EARTH', label: 'Earth', icon: 'textures/tile_earth.png' },
  { id: 'FOREST', label: 'Forest', icon: 'textures/tile_forest.png' },
  { id: 'BIOLITH', label: 'Biolith', icon: 'textures/tile_mech.png' },
  {
    id: 'NEUTRAL',
    label: 'Neutral',
    icon:
      'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMiAzMiI+PGNpcmNsZSBjeD0iMTYiIGN5PSIxNiIgcj0iMTYiIGZpbGw9ImdyYXkiLz48L3N2Zz4=',
  },
];

export function open(deck = null, onDone) {
  if (typeof document === 'undefined') return;

  // Прячем диагностические панели на время работы редактора
  const hiddenEls = [];
  ['mod-status', 'corner-right'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      hiddenEls.push({ el, display: el.style.display });
      el.style.display = 'none';
    }
  });

  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 z-50 flex items-start justify-center bg-black bg-opacity-60 overflow-auto';

  const panel = document.createElement('div');
  panel.className = 'bg-slate-800 mt-6 p-4 rounded-lg w-[90vw] h-[90vh] flex flex-col relative';
  overlay.appendChild(panel);

  // === Верхняя панель фильтров ===
  const topBar = document.createElement('div');
  topBar.className = 'flex items-center gap-4 mb-4';
  panel.appendChild(topBar);

  // Универсальная функция для всплывающих окон под кнопками
  function openPopup(anchor, builder) {
    const rect = anchor.getBoundingClientRect();
    const fo = document.createElement('div');
    fo.className = 'fixed inset-0 z-60';
    fo.addEventListener('click', () => fo.remove());
    const box = document.createElement('div');
    box.className = 'overlay-panel absolute bg-slate-700 p-2 rounded flex flex-col gap-1';
    box.style.top = rect.bottom + 'px';
    box.style.left = rect.left + 'px';
    box.addEventListener('click', e => e.stopPropagation());
    builder(box, () => fo.remove());
    fo.appendChild(box);
    overlay.appendChild(fo);
  }

  // Переключатель стихий
  const elementBtn = document.createElement('button');
  elementBtn.className = 'overlay-panel px-2 py-1';
  elementBtn.textContent = 'Elements';
  topBar.appendChild(elementBtn);

  const selectedElements = new Set(ELEMENTS.map(e => e.id));

  function updateElementBtn() {
    const active = selectedElements.size !== ELEMENTS.length;
    elementBtn.classList.toggle('ring-2', active);
    elementBtn.classList.toggle('ring-yellow-400', active);
  }

  function openElementMenu() {
    openPopup(elementBtn, (box, close) => {
      const allBtn = document.createElement('button');
      allBtn.className = 'overlay-panel px-2 py-1 mb-1';
      allBtn.textContent =
        selectedElements.size === ELEMENTS.length ? 'Deselect All' : 'Select All';
      allBtn.addEventListener('click', () => {
        if (selectedElements.size === ELEMENTS.length) selectedElements.clear();
        else ELEMENTS.forEach(e => selectedElements.add(e.id));
        updateElementBtn();
        renderCatalog();
        close();
        openElementMenu();
      });
      box.appendChild(allBtn);

      ELEMENTS.forEach(el => {
        const opt = document.createElement('label');
        opt.className = 'flex items-center gap-2 cursor-pointer py-1';
        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.checked = selectedElements.has(el.id);
        chk.addEventListener('change', ev => {
          ev.stopPropagation();
          if (chk.checked) selectedElements.add(el.id);
          else selectedElements.delete(el.id);
          updateElementBtn();
          renderCatalog();
        });
        if (el.icon) {
          const img = document.createElement('img');
          img.src = el.icon;
          img.className = 'w-5 h-5';
          opt.appendChild(chk);
          opt.appendChild(img);
        } else {
          opt.appendChild(chk);
        }
        const lbl = document.createElement('span');
        lbl.textContent = el.label;
        opt.appendChild(lbl);
        box.appendChild(opt);
      });
    });
  }

  elementBtn.addEventListener('click', openElementMenu);

  // Кнопка открытия фильтров
  const filtersBtn = document.createElement('button');
  filtersBtn.className = 'overlay-panel px-2 py-1';
  filtersBtn.textContent = 'Filters';
  topBar.appendChild(filtersBtn);

  // Поиск
  const searchInput = document.createElement('input');
  searchInput.placeholder = 'Search';
  searchInput.className = 'overlay-panel px-2 py-1 flex-1';
  topBar.appendChild(searchInput);

  // === Левая панель текущей колоды ===
  const main = document.createElement('div');
  main.className = 'flex flex-1 overflow-hidden';
  panel.appendChild(main);

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

  // === Каталог карт ===
  const catalog = document.createElement('div');
  catalog.className = 'flex-1 overflow-y-auto grid grid-cols-4 gap-2 pl-4';
  main.appendChild(catalog);

  // Подсказка для строк колоды
  const tooltip = document.createElement('div');
  tooltip.className = 'absolute z-50 hidden overlay-panel p-2 text-xs max-w-xs pointer-events-none';
  panel.appendChild(tooltip);

  // Состояние фильтров
  const filterState = {
    types: new Set(['UNIT', 'SPELL']),
    cost: new Set([0, 1, 2, 3, 4, 5, 6, 7]),
    activation: new Set([0, 1, 2, 3, 4, 5, 6, 7]),
  };

  function isFilterDefault() {
    const all = [0, 1, 2, 3, 4, 5, 6, 7];
    const typesDefault = filterState.types.size === 2 && filterState.types.has('UNIT') && filterState.types.has('SPELL');
    return (
      typesDefault &&
      all.every(v => filterState.cost.has(v)) &&
      all.every(v => filterState.activation.has(v))
    );
  }

  function updateFiltersBtn() {
    const active = !isFilterDefault();
    filtersBtn.classList.toggle('ring-2', active);
    filtersBtn.classList.toggle('ring-yellow-400', active);
  }

  function openFilters() {
    openPopup(filtersBtn, (box, close) => {
      // Типы карт
      const typeSec = document.createElement('div');
      typeSec.innerHTML = '<div class="mb-1">By Spells / By Creatures</div>';
      [
        ['UNIT', 'Creatures'],
        ['SPELL', 'Spells'],
      ].forEach(([id, label]) => {
        const wrap = document.createElement('label');
        wrap.className = 'flex items-center gap-2 mb-1 cursor-pointer';
        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.checked = filterState.types.has(id);
        chk.addEventListener('change', () => {
          if (chk.checked) filterState.types.add(id);
          else filterState.types.delete(id);
        });
        wrap.append(chk, document.createTextNode(label));
        typeSec.appendChild(wrap);
      });
      box.appendChild(typeSec);

      // Стоимость призыва
      const costSec = document.createElement('div');
      costSec.innerHTML = '<div class="mb-1">By Summoning Cost</div>';
      const costRow = document.createElement('div');
      costRow.className = 'flex flex-wrap gap-2';
      [0, 1, 2, 3, 4, 5, 6, 7].forEach(v => {
        const orb = document.createElement('div');
        orb.className =
          'w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-xs cursor-pointer' +
          (filterState.cost.has(v) ? ' ring-2 ring-yellow-400' : '');
        orb.textContent = v === 7 ? '7+' : String(v);
        orb.addEventListener('click', () => {
          if (filterState.cost.has(v)) filterState.cost.delete(v);
          else filterState.cost.add(v);
          orb.classList.toggle('ring-2');
          orb.classList.toggle('ring-yellow-400');
        });
        costRow.appendChild(orb);
      });
      costSec.appendChild(costRow);
      box.appendChild(costSec);

      // Стоимость действия
      const actSec = document.createElement('div');
      actSec.innerHTML = '<div class="mb-1">By Action Cost</div>';
      const actRow = document.createElement('div');
      actRow.className = 'flex flex-wrap gap-2';
      [0, 1, 2, 3, 4, 5, 6, 7].forEach(v => {
        const orb = document.createElement('div');
        orb.className =
          'w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-xs cursor-pointer' +
          (filterState.activation.has(v) ? ' ring-2 ring-yellow-400' : '');
        orb.textContent = v === 7 ? '7+' : String(v);
        orb.addEventListener('click', () => {
          if (filterState.activation.has(v)) filterState.activation.delete(v);
          else filterState.activation.add(v);
          orb.classList.toggle('ring-2');
          orb.classList.toggle('ring-yellow-400');
        });
        actRow.appendChild(orb);
      });
      actSec.appendChild(actRow);
      box.appendChild(actSec);

      const applyBtn = document.createElement('button');
      applyBtn.className = 'overlay-panel mt-2 px-3 py-1.5 bg-slate-600 hover:bg-slate-700 w-full';
      applyBtn.textContent = 'Apply';
      applyBtn.addEventListener('click', () => {
        close();
        updateFiltersBtn();
        renderCatalog();
      });
      box.appendChild(applyBtn);
    });
  }

  filtersBtn.addEventListener('click', openFilters);

  // Состояние редактируемой колоды
  const working = deck ? {
    id: deck.id,
    name: deck.name,
    description: deck.description || '',
    cards: [...deck.cards],
  } : { id: makeId(), name: '', description: '', cards: [] };

  // Группировка карт колоды по стоимости
  function renderDeck() {
    deckList.innerHTML = '';

    // Группируем карты по id и сортируем по стоимости призыва
    const grouped = {};
    working.cards.forEach(c => {
      grouped[c.id] = grouped[c.id] || { card: c, count: 0 };
      grouped[c.id].count++;
    });
    const list = Object.values(grouped).sort(
      (a, b) => (a.card.cost ?? 0) - (b.card.cost ?? 0)
    );

    list.forEach(({ card, count }) => {
      const row = document.createElement('div');
      row.className =
        'relative h-12 rounded cursor-pointer overflow-hidden flex items-center justify-between text-xs text-white';
      row.style.backgroundImage =
        `linear-gradient(to left, rgba(15,23,42,0), rgba(15,23,42,0.9)), url(card images/${card.id}.png)`;
      row.style.backgroundSize = 'cover';
      row.style.backgroundPosition = 'center';

      const costWrap = document.createElement('div');
      costWrap.className = 'flex items-center gap-1 pl-1 z-10';
      const summon = document.createElement('span');
      summon.className =
        'w-5 h-5 rounded-full bg-slate-900/70 flex items-center justify-center text-[10px]';
      summon.textContent = card.cost ?? 0;
      const act = document.createElement('span');
      act.className =
        'w-5 h-5 rounded-full bg-slate-900/70 flex items-center justify-center text-[10px]';
      act.textContent = card.activation ?? 0;
      costWrap.append(summon, act);
      row.appendChild(costWrap);

      const nm = document.createElement('div');
      nm.className = 'truncate flex-1 ml-2 z-10';
      nm.textContent = card.name;
      row.appendChild(nm);

      const copiesEl = document.createElement('span');
      copiesEl.className = 'pr-1 z-10';
      copiesEl.textContent = count;
      row.appendChild(copiesEl);

      // Удаление копии по клику
      row.addEventListener('click', () => {
        const i = working.cards.findIndex(x => x.id === card.id);
        if (i >= 0) working.cards.splice(i, 1);
        renderDeck();
        updateSummary();
      });

      // Tooltip
      function showTip(e) {
        const stats = card.type === 'UNIT' ? `АТК ${card.atk} / HP ${card.hp}` : '';
        const text = card.desc || card.text || '';
        tooltip.innerHTML = `<div class='font-semibold mb-1'>${card.name}</div>` +
          (stats ? `<div class='mb-1'>${stats}</div>` : '') +
          `<div>${text}</div>`;
        tooltip.style.left = e.clientX + 12 + 'px';
        tooltip.style.top = e.clientY + 12 + 'px';
        tooltip.classList.remove('hidden');
      }
      row.addEventListener('mouseenter', showTip);
      row.addEventListener('mousemove', showTip);
      row.addEventListener('mouseleave', () => tooltip.classList.add('hidden'));

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

  // Отрисовка каталога с учётом фильтров
  function renderCatalog() {
    catalog.innerHTML = '';
    const query = searchInput.value.toLowerCase();
    const cards = Object.values(CARDS).filter(c => {
      const el = c.element || 'NEUTRAL';
      if (!selectedElements.has(el)) return false;
      if (!filterState.types.has(c.type)) return false;
      const costVal = Math.min(c.cost ?? 0, 7);
      if (!filterState.cost.has(costVal)) return false;
      const actVal = Math.min(c.activation ?? 0, 7);
      if (!filterState.activation.has(actVal)) return false;
      const text = (c.desc || c.text || '').toLowerCase();
      return c.name.toLowerCase().includes(query) || text.includes(query);
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
    if (deck) updateDeck(deck.id, working); else addDeck(working);
    saveDecks();
    cleanup();
    onDone && onDone();
  });

  function cleanup() {
    document.body.removeChild(overlay);
    hiddenEls.forEach(({el, display}) => { el.style.display = display; });
  }

  nameInput.value = working.name;
  renderDeck();
  updateSummary();
  renderCatalog();
  updateElementBtn();
  updateFiltersBtn();

  document.body.appendChild(overlay);
}

const api = { open };
try { if (typeof window !== 'undefined') { window.__ui = window.__ui || {}; window.__ui.deckBuilder = api; } } catch {}
export default api;


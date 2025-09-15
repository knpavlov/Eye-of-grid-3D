// Редактор колод (расширенная версия фронтенда)
// Логика отделена от визуализации, чтобы упростить перенос на Unity

import { CARDS } from '../core/cards.js';
import { addDeck, updateDeck, saveDecks } from '../core/decks.js';
import { show as showNotification } from './notifications.js';

// Генерация ID новой колоды
function makeId() {
  return 'DECK_' + Math.random().toString(36).slice(2, 9);
}

// Иконки стихий
const ELEMENTS = [
  { id: 'FIRE', label: 'Fire', icon: 'textures/tile_fire.png' },
  { id: 'WATER', label: 'Water', icon: 'textures/tile_water.png' },
  { id: 'EARTH', label: 'Earth', icon: 'textures/tile_earth.png' },
  { id: 'FOREST', label: 'Forest', icon: 'textures/tile_forest.png' },
  { id: 'BIOLITH', label: 'Biolith', icon: 'textures/tile_mech.png' },
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

  // Переключатель стихий
  const elementWrap = document.createElement('div');
  elementWrap.className = 'relative';
  topBar.appendChild(elementWrap);

  const elementBtn = document.createElement('button');
  elementBtn.className = 'overlay-panel px-2 py-1';
  elementBtn.textContent = 'Elements';
  elementWrap.appendChild(elementBtn);

  const elementMenu = document.createElement('div');
  elementMenu.className = 'absolute left-0 mt-1 overlay-panel bg-slate-700 p-2 flex-col gap-1 hidden';
  elementWrap.appendChild(elementMenu);

  const selectedElements = new Set(ELEMENTS.map(e => e.id));

  function renderElementMenu() {
    elementMenu.innerHTML = '';
    const allBtn = document.createElement('button');
    allBtn.className = 'overlay-panel px-2 py-1 mb-1';
    allBtn.textContent = selectedElements.size === ELEMENTS.length ? 'Deselect All' : 'Select All';
    allBtn.addEventListener('click', () => {
      if (selectedElements.size === ELEMENTS.length) selectedElements.clear();
      else ELEMENTS.forEach(e => selectedElements.add(e.id));
      renderElementMenu();
      renderCatalog();
    });
    elementMenu.appendChild(allBtn);

    ELEMENTS.forEach(el => {
      const opt = document.createElement('div');
      opt.className = 'flex items-center gap-2 cursor-pointer py-1';
      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.checked = selectedElements.has(el.id);
      chk.addEventListener('change', ev => {
        ev.stopPropagation();
        if (chk.checked) selectedElements.add(el.id);
        else selectedElements.delete(el.id);
        renderElementMenu();
        renderCatalog();
      });
      const img = document.createElement('img');
      img.src = el.icon; img.className = 'w-5 h-5';
      const lbl = document.createElement('span');
      lbl.textContent = el.label;
      opt.append(chk, img, lbl);
      elementMenu.appendChild(opt);
    });
  }

  elementBtn.addEventListener('click', e => {
    e.stopPropagation();
    elementMenu.classList.toggle('hidden');
  });
  document.addEventListener('click', e => {
    if (!elementWrap.contains(e.target)) elementMenu.classList.add('hidden');
  });

  renderElementMenu();

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
    cost: new Set([0,1,2,3,4,5,6,7]),
    activation: new Set([0,1,2,3,4,5,6,7]),
  };

  function openFilters() {
    const fo = document.createElement('div');
    fo.className = 'absolute inset-0 z-60 flex items-center justify-center bg-black bg-opacity-60';

    const box = document.createElement('div');
    box.className = 'bg-slate-800 p-4 rounded-lg w-72 space-y-4';
    fo.appendChild(box);

    // Типы карт
    const typeSec = document.createElement('div');
    typeSec.innerHTML = '<div class="mb-1">By Spells / By Creatures</div>';
    [['UNIT','Creatures'],['SPELL','Spells']].forEach(([id,label])=>{
      const wrap = document.createElement('label');
      wrap.className = 'flex items-center gap-2 mb-1 cursor-pointer';
      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.checked = filterState.types.has(id);
      chk.addEventListener('change', ()=>{
        if (chk.checked) filterState.types.add(id); else filterState.types.delete(id);
      });
      wrap.append(chk, document.createTextNode(label));
      typeSec.appendChild(wrap);
    });
    box.appendChild(typeSec);

    // Стоимость призыва
    const costSec = document.createElement('div');
    costSec.innerHTML = '<div class="mb-1">By Summoning Cost</div>';
    [0,1,2,3,4,5,6,7].forEach(v=>{
      const wrap = document.createElement('label');
      wrap.className = 'mr-2';
      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.checked = filterState.cost.has(v);
      chk.addEventListener('change', ()=>{
        if (chk.checked) filterState.cost.add(v); else filterState.cost.delete(v);
      });
      const span = document.createElement('span');
      span.textContent = v===7 ? '7+' : String(v);
      wrap.append(chk, span);
      costSec.appendChild(wrap);
    });
    box.appendChild(costSec);

    // Стоимость действия
    const actSec = document.createElement('div');
    actSec.innerHTML = '<div class="mb-1">By Action Cost</div>';
    [0,1,2,3,4,5,6,7].forEach(v=>{
      const wrap = document.createElement('label');
      wrap.className = 'mr-2';
      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.checked = filterState.activation.has(v);
      chk.addEventListener('change', ()=>{
        if (chk.checked) filterState.activation.add(v); else filterState.activation.delete(v);
      });
      const span = document.createElement('span');
      span.textContent = v===7 ? '7+' : String(v);
      wrap.append(chk, span);
      actSec.appendChild(wrap);
    });
    box.appendChild(actSec);

    const applyBtn = document.createElement('button');
    applyBtn.className = 'overlay-panel mt-2 px-3 py-1.5 bg-slate-600 hover:bg-slate-700 w-full';
    applyBtn.textContent = 'Apply';
    applyBtn.addEventListener('click', () => {
      fo.remove();
      renderCatalog();
    });
    box.appendChild(applyBtn);

    panel.appendChild(fo);
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
    const byCost = {};
    working.cards.forEach(c => {
      const cost = c.cost || 0;
      byCost[cost] = byCost[cost] || [];
      byCost[cost].push(c);
    });
    Object.keys(byCost).map(Number).sort((a,b)=>a-b).forEach(cost => {
      const header = document.createElement('div');
      header.className = 'text-center text-xs mt-2 mb-1';
      header.textContent = `Cost ${cost}`;
      deckList.appendChild(header);

      const grouped = {};
      byCost[cost].forEach(c => {
        grouped[c.id] = grouped[c.id] || { card: c, count: 0 };
        grouped[c.id].count++;
      });

      Object.values(grouped).forEach(({ card, count }) => {
        const row = document.createElement('div');
        row.className = 'flex items-center justify-between overlay-panel px-1 cursor-pointer';

        // Левая часть: стоимости, превью, имя
        const leftPart = document.createElement('div');
        leftPart.className = 'flex items-center gap-2 flex-1';

        const costWrap = document.createElement('div');
        costWrap.className = 'flex items-center gap-1';
        const summon = document.createElement('span');
        summon.className = 'w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center text-[10px]';
        summon.textContent = card.cost ?? 0;
        const act = document.createElement('span');
        act.className = 'w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center text-[10px]';
        act.textContent = card.activation ?? 0;
        costWrap.append(summon, act);
        leftPart.appendChild(costWrap);

        const img = document.createElement('img');
        img.src = `card images/${card.id}.png`;
        img.className = 'w-10 h-6 object-cover object-center rounded';
        // При необходимости можно изменить позицию превью:
        // img.style.objectPosition = '0 -10px';
        leftPart.appendChild(img);

        const nm = document.createElement('div');
        nm.className = 'truncate';
        nm.textContent = card.name;
        leftPart.appendChild(nm);

        row.appendChild(leftPart);

        const copiesEl = document.createElement('span');
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
        function showTip(e){
          const stats = card.type === 'UNIT' ? `АТК ${card.atk} / HP ${card.hp}` : '';
          const text = card.desc || card.text || '';
          tooltip.innerHTML = `<div class='font-semibold mb-1'>${card.name}</div>` +
            (stats ? `<div class='mb-1'>${stats}</div>` : '') +
            `<div>${text}</div>`;
          tooltip.style.left = (e.clientX + 12) + 'px';
          tooltip.style.top = (e.clientY + 12) + 'px';
          tooltip.classList.remove('hidden');
        }
        row.addEventListener('mouseenter', showTip);
        row.addEventListener('mousemove', showTip);
        row.addEventListener('mouseleave', () => tooltip.classList.add('hidden'));

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

  // Отрисовка каталога с учётом фильтров
  function renderCatalog() {
    catalog.innerHTML = '';
    const query = searchInput.value.toLowerCase();
    const cards = Object.values(CARDS).filter(c => {
      if (!selectedElements.has(c.element)) return false;
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

  document.body.appendChild(overlay);
}

const api = { open };
try { if (typeof window !== 'undefined') { window.__ui = window.__ui || {}; window.__ui.deckBuilder = api; } } catch {}
export default api;


// Редактор колод (расширенная версия фронтенда)
// Логика отделена от визуализации, чтобы упростить перенос на Unity

import { CARDS } from '../core/cards.js';
import { addDeck, updateDeck, saveDecks } from '../core/decks.js';
import { show as showNotification } from './notifications.js';
// Используем генератор карт из игрового рендера, чтобы показать карты целиком
import { drawCardFace, preloadCardTextures } from '../scene/cards.js';

// Генерация ID новой колоды
function makeId() {
  return 'DECK_' + Math.random().toString(36).slice(2, 9);
}

// Иконки стихий
// Для заклинаний добавляем «нейтральную» стихию
const ELEMENTS = [
  { id: 'FIRE', label: 'Fire', icon: 'textures/tile_fire.png' },
  { id: 'WATER', label: 'Water', icon: 'textures/tile_water.png' },
  { id: 'EARTH', label: 'Earth', icon: 'textures/tile_earth.png' },
  { id: 'FOREST', label: 'Forest', icon: 'textures/tile_forest.png' },
  { id: 'BIOLITH', label: 'Biolith', icon: 'textures/tile_mech.png' },
  // Простая серая сфера в виде SVG для нейтральных карт
  { id: 'NEUTRAL', label: 'Neutral', icon: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="%23aaa"/></svg>' },
];

// Настройки полоски иллюстрации в левой панели
// Высота строки и вертикальное смещение (0-100%) можно менять при необходимости
const STRIP_HEIGHT = 48;
const STRIP_OFFSET = 50;
// Возможны индивидуальные настройки через card.deckStripOffset и card.deckStripHeight

// Размеры канваса для превью карты в каталоге (под игровое соотношение сторон)
const PREVIEW_W = 256;
const PREVIEW_H = 356;

export function open(deck = null, onDone) {
  if (typeof document === 'undefined') return;

  // Подгружаем текстуры карт для рендера превью
  try { preloadCardTextures(); } catch {}

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
  overlay.id = 'deck-builder-overlay';
  overlay.className = 'fixed inset-0 z-50 flex items-start justify-center bg-black bg-opacity-60 overflow-auto';

  const panel = document.createElement('div');
  panel.className = 'bg-slate-800 mt-4 p-4 rounded-lg w-[90vw] h-[95vh] flex flex-col relative';
  overlay.appendChild(panel);

  // === Верхняя панель фильтров ===
  const topBar = document.createElement('div');
  topBar.className = 'flex items-center gap-4 mb-4';
  panel.appendChild(topBar);

  // Переключатель стихий
  const elementBtn = document.createElement('button');
  elementBtn.className = 'overlay-panel px-2 py-1';
  elementBtn.textContent = 'Elements';
  topBar.appendChild(elementBtn);

  const selectedElements = new Set(ELEMENTS.map(e => e.id));

  function updateElementBtn() {
    if (selectedElements.size !== ELEMENTS.length) {
      elementBtn.classList.add('ring-2', 'ring-yellow-400');
    } else {
      elementBtn.classList.remove('ring-2', 'ring-yellow-400');
    }
  }

  function openElementFilter() {
    const fo = document.createElement('div');
    // Поверх всех элементов
    fo.className = 'fixed inset-0 z-[100]';
    const rect = elementBtn.getBoundingClientRect();
    const menu = document.createElement('div');
    menu.className = 'overlay-panel bg-slate-700 p-2 flex flex-col gap-1 absolute';
    menu.style.left = rect.left + 'px';
    menu.style.top = rect.bottom + 'px';
    fo.appendChild(menu);

    function renderMenu() {
      menu.innerHTML = '';
      const allBtn = document.createElement('button');
      allBtn.className = 'overlay-panel px-2 py-1 mb-1';
      allBtn.textContent = selectedElements.size === ELEMENTS.length ? 'Deselect All' : 'Select All';
      allBtn.addEventListener('click', () => {
        if (selectedElements.size === ELEMENTS.length) selectedElements.clear();
        else ELEMENTS.forEach(e => selectedElements.add(e.id));
        renderMenu();
        renderCatalog({ preserveScroll: true });
        updateElementBtn();
      });
      menu.appendChild(allBtn);

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
          renderMenu();
          renderCatalog({ preserveScroll: true });
          updateElementBtn();
        });
        const img = document.createElement('img');
        img.src = el.icon; img.className = 'w-5 h-5';
        const lbl = document.createElement('span');
        lbl.textContent = el.label;
        opt.append(chk, img, lbl);
        menu.appendChild(opt);
      });
    }

    renderMenu();
    fo.addEventListener('click', e => { if (e.target === fo) fo.remove(); });
    panel.appendChild(fo);
  }

  elementBtn.addEventListener('click', openElementFilter);
  updateElementBtn();

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
  deckList.className = 'flex-1 overflow-y-auto space-y-1 text-sm deck-scroll';
  left.appendChild(deckList);
  // Принимаем перетаскиваемые карты из каталога
  deckList.addEventListener('dragover', e => e.preventDefault());
  deckList.addEventListener('drop', e => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    const card = CARDS[id];
    if (card) addCard(card);
  });

  const summary = document.createElement('div');
  summary.className = 'mt-2 text-center';
  left.appendChild(summary);

  const doneBtn = document.createElement('button');
  doneBtn.className = 'overlay-panel mt-2 px-3 py-1.5 bg-slate-600 hover:bg-slate-700';
  doneBtn.textContent = 'Done';
  left.appendChild(doneBtn);

  // === Каталог карт ===
  const catalog = document.createElement('div');
  // Сетка 5x2 с увеличенными отступами между картами
  catalog.className = 'flex-1 overflow-y-auto grid grid-cols-5 grid-rows-2 gap-4 pl-4 deck-scroll catalog-grid';
  main.appendChild(catalog);

  // Подписка на готовность текстур/иллюстраций
  let prevRequestCardsRedraw = null;
  let catalogRefreshPlanned = false;
  function scheduleCatalogRerender() {
    if (catalogRefreshPlanned) return;
    catalogRefreshPlanned = true;
    const raf = typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : (fn => setTimeout(fn, 16));
    raf(() => {
      catalogRefreshPlanned = false;
      const scrollTop = catalog.scrollTop;
      renderCatalog({ preserveScroll: true, scrollTop });
    });
  }
  if (typeof window !== 'undefined') {
    prevRequestCardsRedraw = window.requestCardsRedraw;
    window.requestCardsRedraw = function deckBuilderRequestCardsRedraw(...args) {
      try {
        if (typeof prevRequestCardsRedraw === 'function') {
          prevRequestCardsRedraw.apply(window, args);
        }
      } catch {}
      scheduleCatalogRerender();
    };
  }

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
    // Поверх всех элементов
    fo.className = 'fixed inset-0 z-[100]';
    const rect = filtersBtn.getBoundingClientRect();
    const box = document.createElement('div');
    box.className = 'overlay-panel bg-slate-800 p-4 rounded-lg w-72 space-y-4 absolute';
    box.style.left = rect.left + 'px';
    box.style.top = rect.bottom + 'px';
    fo.appendChild(box);

    function renderBox() {
      box.innerHTML = '';

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
          updateFiltersBtn();
        });
        wrap.append(chk, document.createTextNode(label));
        typeSec.appendChild(wrap);
      });
      box.appendChild(typeSec);

      // Стоимость призыва
      const costSec = document.createElement('div');
      costSec.innerHTML = '<div class="mb-1">By Summoning Cost</div>';
      const costRow = document.createElement('div');
      costRow.className = 'flex flex-wrap gap-1';
      [0,1,2,3,4,5,6,7].forEach(v=>{
        const orb = document.createElement('div');
        orb.className = 'w-7 h-7 rounded-full flex items-center justify-center text-xs cursor-pointer select-none ' +
          (filterState.cost.has(v) ? 'bg-blue-500' : 'bg-slate-600');
        orb.textContent = v===7 ? '7+' : String(v);
        orb.addEventListener('click', ()=>{
          if (filterState.cost.has(v)) filterState.cost.delete(v); else filterState.cost.add(v);
          updateFiltersBtn();
          renderBox();
        });
        costRow.appendChild(orb);
      });
      costSec.appendChild(costRow);
      box.appendChild(costSec);

      // Стоимость действия
      const actSec = document.createElement('div');
      actSec.innerHTML = '<div class="mb-1">By Action Cost</div>';
      const actRow = document.createElement('div');
      actRow.className = 'flex flex-wrap gap-1';
      [0,1,2,3,4,5,6,7].forEach(v=>{
        const orb = document.createElement('div');
        orb.className = 'w-7 h-7 rounded-full flex items-center justify-center text-xs cursor-pointer select-none ' +
          (filterState.activation.has(v) ? 'bg-blue-500' : 'bg-slate-600');
        orb.textContent = v===7 ? '7+' : String(v);
        orb.addEventListener('click', ()=>{
          if (filterState.activation.has(v)) filterState.activation.delete(v); else filterState.activation.add(v);
          updateFiltersBtn();
          renderBox();
        });
        actRow.appendChild(orb);
      });
      actSec.appendChild(actRow);
      box.appendChild(actSec);

      const applyBtn = document.createElement('button');
      applyBtn.className = 'overlay-panel mt-2 px-3 py-1.5 bg-slate-600 hover:bg-slate-700 w-full';
      applyBtn.textContent = 'Apply';
      applyBtn.addEventListener('click', () => {
        fo.remove();
        renderCatalog({ preserveScroll: true });
        updateFiltersBtn();
      });
      box.appendChild(applyBtn);
    }

    renderBox();
    fo.addEventListener('click', e => {
      if (e.target === fo) {
        fo.remove();
        renderCatalog({ preserveScroll: true });
        updateFiltersBtn();
      }
    });
    panel.appendChild(fo);
  }

  function updateFiltersBtn() {
    const allTypes = filterState.types.size === 2;
    const allCost = filterState.cost.size === 8;
    const allAct = filterState.activation.size === 8;
    if (allTypes && allCost && allAct) {
      filtersBtn.classList.remove('ring-2', 'ring-yellow-400');
    } else {
      filtersBtn.classList.add('ring-2', 'ring-yellow-400');
    }
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

    // Группируем карты по id, чтобы посчитать копии
    const grouped = {};
    working.cards.forEach(c => {
      grouped[c.id] = grouped[c.id] || { card: c, count: 0 };
      grouped[c.id].count++;
    });

    Object.values(grouped)
      .sort((a,b) => (a.card.cost || 0) - (b.card.cost || 0))
      .forEach(({ card, count }) => {
        const row = document.createElement('div');
        row.className = 'relative rounded overflow-hidden cursor-pointer bg-slate-900/60';
        const stripHeight = typeof card.deckStripHeight === 'number' ? card.deckStripHeight : STRIP_HEIGHT;
        row.style.height = stripHeight + 'px';
        const stripOffset = typeof card.deckStripOffset === 'number' ? card.deckStripOffset : STRIP_OFFSET;
        const artUrl = `card images/${card.id}.png`;
        row.style.backgroundImage = `url("${encodeURI(artUrl)}")`;
        row.style.backgroundSize = 'cover';
        row.style.backgroundRepeat = 'no-repeat';
        row.style.backgroundPosition = `center ${stripOffset}%`;

        // Градиент для затемнения слева (при желании направление можно изменить)
        const fade = document.createElement('div');
        fade.className = 'absolute inset-0 bg-gradient-to-r from-slate-900/80 to-transparent';
        row.appendChild(fade);

        const content = document.createElement('div');
        content.className = 'relative z-10 flex items-center justify-between h-full px-1';
        row.appendChild(content);

        // Левая часть: стоимости и имя
        const leftPart = document.createElement('div');
        leftPart.className = 'flex items-center gap-2 flex-1';

        const costWrap = document.createElement('div');
        costWrap.className = 'flex items-center gap-1';
        const summon = document.createElement('span');
        summon.className = 'w-5 h-5 rounded-full bg-slate-700/80 flex items-center justify-center text-[10px]';
        summon.textContent = card.cost ?? 0;
        const act = document.createElement('span');
        act.className = 'w-5 h-5 rounded-full bg-slate-700/80 flex items-center justify-center text-[10px]';
        act.textContent = card.activation ?? 0;
        costWrap.append(summon, act);
        leftPart.appendChild(costWrap);

        const nm = document.createElement('div');
        nm.className = 'truncate';
        nm.textContent = card.name;
        leftPart.appendChild(nm);

        content.appendChild(leftPart);

        const copiesEl = document.createElement('span');
        copiesEl.className = 'pr-1 font-semibold drop-shadow';
        copiesEl.textContent = count;
        content.appendChild(copiesEl);

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
  function renderCatalog(options = {}) {
    const preserveScroll = options === true || (options && typeof options === 'object' && options.preserveScroll);
    const savedScroll = preserveScroll
      ? (typeof options.scrollTop === 'number' ? options.scrollTop : catalog.scrollTop)
      : 0;
    catalog.innerHTML = '';
    const query = searchInput.value.toLowerCase();
    const cards = Object.values(CARDS).filter(c => {
      const elem = c.element || 'NEUTRAL';
      if (!selectedElements.has(elem)) return false;
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
      item.className = 'catalog-card cursor-pointer';
      item.draggable = true;
      item.addEventListener('dragstart', e => e.dataTransfer.setData('text/plain', card.id));
      item.addEventListener('click', () => addCard(card));
      const canvas = document.createElement('canvas');
      canvas.width = PREVIEW_W; canvas.height = PREVIEW_H;
      drawCardFace(canvas.getContext('2d'), card, PREVIEW_W, PREVIEW_H);
      canvas.className = 'w-full h-auto';
      item.appendChild(canvas);
      catalog.appendChild(item);
    });
    if (preserveScroll) catalog.scrollTop = savedScroll;
  }

  searchInput.addEventListener('input', () => renderCatalog());

  doneBtn.addEventListener('click', () => {
    working.name = nameInput.value.trim() || 'Untitled';
    if (deck) updateDeck(deck.id, working); else addDeck(working);
    saveDecks();
    cleanup();
    onDone && onDone();
  });

  function cleanup() {
    document.body.removeChild(overlay);
    if (typeof window !== 'undefined') {
      if (prevRequestCardsRedraw) {
        window.requestCardsRedraw = prevRequestCardsRedraw;
      } else {
        try { delete window.requestCardsRedraw; } catch { window.requestCardsRedraw = undefined; }
      }
    }
    prevRequestCardsRedraw = null;
    catalogRefreshPlanned = false;
    hiddenEls.forEach(({el, display}) => { el.style.display = display; });
  }

  nameInput.value = working.name;
  renderDeck();
  updateSummary();
  renderCatalog();
  updateFiltersBtn();

  document.body.appendChild(overlay);
}

const api = { open };
try { if (typeof window !== 'undefined') { window.__ui = window.__ui || {}; window.__ui.deckBuilder = api; } } catch {}
export default api;


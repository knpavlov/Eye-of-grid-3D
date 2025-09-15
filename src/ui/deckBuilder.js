// Редактор колод (упрощённая версия)
// Базовые данные карт и хранения колод
import { CARDS } from '../core/cards.js';
import { DECKS, addDeck, updateDeck, saveDecks } from '../core/decks.js';
import { elementEmoji } from '../core/constants.js';
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

  // Наборы фильтров
  const selectedElements = new Set();
  const filterTypes = new Set();
  const filterSummon = new Set();
  const filterAction = new Set();

  // Прячем диагностические элементы, чтобы не мешали интерфейсу
  const hiddenEls = [];
  ['mod-status', 'mp-debug'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { hiddenEls.push({ el, display: el.style.display }); el.style.display = 'none'; }
  });
  const netInd = document.querySelector('.mp-ind');
  if (netInd) { hiddenEls.push({ el: netInd, display: netInd.style.display }); netInd.style.display = 'none'; }

  // --- Верхняя панель: выбор стихий, фильтры и поиск ---
  const topBar = document.createElement('div');
  topBar.className = 'flex items-center gap-2 mb-4';
  panel.appendChild(topBar);

  // Переключатель стихий
  const elementBtn = document.createElement('button');
  elementBtn.className = 'overlay-panel px-3 py-1 relative';
  elementBtn.textContent = 'Elements ▾';
  topBar.appendChild(elementBtn);

  const elementMenu = document.createElement('div');
  elementMenu.className = 'hidden absolute left-0 top-full mt-1 bg-slate-800 border border-slate-700 rounded p-2 space-y-1 z-10';
  elementBtn.appendChild(elementMenu);

  const elementChecks = [];
  const elementKeys = ['FIRE','WATER','EARTH','FOREST','BIOLITH'];
  elementKeys.forEach(k=>{
    const lbl = document.createElement('label');
    lbl.className = 'flex items-center gap-1 whitespace-nowrap';
    const cb = document.createElement('input'); cb.type='checkbox'; cb.dataset.el=k;
    elementChecks.push(cb);
    lbl.appendChild(cb);
    lbl.appendChild(document.createTextNode(`${elementEmoji[k]||''} ${k}`));
    elementMenu.appendChild(lbl);
  });
  const allLbl = document.createElement('label');
  allLbl.className='flex items-center gap-1 pt-1 mt-1 border-t border-slate-700';
  const allCb = document.createElement('input'); allCb.type='checkbox';
  allLbl.appendChild(allCb);
  allLbl.appendChild(document.createTextNode('Select / Deselect All'));
  elementMenu.appendChild(allLbl);

  function updateElements(){
    selectedElements.clear();
    elementChecks.forEach(cb=>{ if(cb.checked) selectedElements.add(cb.dataset.el); });
    renderCatalog();
  }
  elementChecks.forEach(cb=>cb.addEventListener('change', updateElements));
  allCb.addEventListener('change', ()=>{
    elementChecks.forEach(cb=>{ cb.checked = allCb.checked; });
    updateElements();
  });
  elementBtn.addEventListener('click', (e)=>{ e.stopPropagation(); elementMenu.classList.toggle('hidden'); });
  document.addEventListener('click', (e)=>{ if(!elementBtn.contains(e.target)) elementMenu.classList.add('hidden'); });

  // Кнопка фильтров
  const filterBtn = document.createElement('button');
  filterBtn.className = 'overlay-panel px-3 py-1';
  filterBtn.textContent = 'Filters';
  topBar.appendChild(filterBtn);

  // Оверлей фильтров
  function openFilters(){
    const ov = document.createElement('div');
    ov.className = 'fixed inset-0 z-60 flex items-center justify-center bg-black bg-opacity-60';
    const box = document.createElement('div');
    box.className = 'bg-slate-800 p-4 rounded-lg w-72 max-h-[90vh] overflow-y-auto space-y-4';
    ov.appendChild(box);

    // --- Фильтр по типу ---
    const typeSec = document.createElement('div');
    typeSec.innerHTML = '<div class="mb-1">By Type</div>';
    const spellLbl = document.createElement('label');
    spellLbl.className='flex items-center gap-1';
    const spellCb=document.createElement('input'); spellCb.type='checkbox'; spellCb.checked=filterTypes.has('SPELL');
    spellCb.addEventListener('change',()=>{ if(spellCb.checked) filterTypes.add('SPELL'); else filterTypes.delete('SPELL'); renderCatalog(); });
    spellLbl.appendChild(spellCb); spellLbl.appendChild(document.createTextNode('Spells')); typeSec.appendChild(spellLbl);
    const unitLbl = document.createElement('label');
    unitLbl.className='flex items-center gap-1';
    const unitCb=document.createElement('input'); unitCb.type='checkbox'; unitCb.checked=filterTypes.has('UNIT');
    unitCb.addEventListener('change',()=>{ if(unitCb.checked) filterTypes.add('UNIT'); else filterTypes.delete('UNIT'); renderCatalog(); });
    unitLbl.appendChild(unitCb); unitLbl.appendChild(document.createTextNode('Creatures')); typeSec.appendChild(unitLbl);
    box.appendChild(typeSec);

    // Общая функция секций стоимости
    function buildCostSection(title,set){
      const sec=document.createElement('div');
      sec.innerHTML=`<div class='mb-1'>${title}</div>`;
      const grid=document.createElement('div'); grid.className='grid grid-cols-4 gap-1';
      const vals=[0,1,2,3,4,5,6,'7+'];
      vals.forEach(v=>{
        const lbl=document.createElement('label'); lbl.className='flex items-center gap-1';
        const cb=document.createElement('input'); cb.type='checkbox'; cb.dataset.val=(v==='7+')?7:v; cb.checked=set.has(cb.dataset.val);
        cb.addEventListener('change',()=>{ const val=parseInt(cb.dataset.val); if(cb.checked) set.add(val); else set.delete(val); renderCatalog(); });
        lbl.appendChild(cb); lbl.appendChild(document.createTextNode(String(v)));
        grid.appendChild(lbl);
      });
      sec.appendChild(grid);
      return sec;
    }

    box.appendChild(buildCostSection('By Summoning Cost', filterSummon));
    box.appendChild(buildCostSection('By Action Cost', filterAction));

    const closeBtn=document.createElement('button');
    closeBtn.className='overlay-panel mt-2 px-3 py-1.5 bg-slate-600 hover:bg-slate-700 w-full';
    closeBtn.textContent='Done';
    closeBtn.addEventListener('click',()=>document.body.removeChild(ov));
    box.appendChild(closeBtn);

    document.body.appendChild(ov);
  }

  filterBtn.addEventListener('click', openFilters);

  // Поисковая строка
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
      row.className = 'flex items-center overlay-panel px-1 relative';

      // Стоимости призыва и действия
      const costWrap = document.createElement('div');
      costWrap.className = 'flex flex-col items-center mr-2';
      const summonEl = document.createElement('div');
      summonEl.className = 'w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center text-[10px]';
      summonEl.textContent = card.cost ?? 0;
      const actEl = document.createElement('div');
      actEl.className = 'w-5 h-5 rounded-full bg-slate-600 flex items-center justify-center text-[10px] mt-0.5';
      actEl.textContent = card.activation ?? 0;
      costWrap.appendChild(summonEl); costWrap.appendChild(actEl);
      row.appendChild(costWrap);

      // Полоска иллюстрации
      const img = document.createElement('img');
      img.src = `card images/${card.id}.png`;
      img.className = 'w-10 h-8 object-cover object-center mr-2';
      if (typeof card.thumbOffset !== 'undefined') {
        img.style.objectPosition = `center ${card.thumbOffset}%`; // возможность ручной настройки
      }
      row.appendChild(img);

      // Название карты
      const nm = document.createElement('span');
      nm.className = 'flex-1 overflow-hidden text-ellipsis whitespace-nowrap';
      nm.textContent = card.name;
      row.appendChild(nm);

      // Счётчик копий
      const cnt = document.createElement('span');
      cnt.textContent = count;
      row.appendChild(cnt);

      // Удаление копии по клику
      row.addEventListener('click', () => {
        const i = working.cards.findIndex(x => x.id === card.id);
        if (i >= 0) working.cards.splice(i, 1);
        renderDeck();
        updateSummary();
      });

      // Подсказка с характеристиками
      row.addEventListener('mouseenter', () => {
        const tip = document.createElement('div');
        tip.className = 'fixed z-50 max-w-xs p-2 bg-slate-700 border border-slate-600 rounded text-xs';
        tip.innerHTML = `<div class="font-bold mb-1">${card.name}</div><div>ATK: ${card.atk} HP: ${card.hp}</div><div class="mt-1">${card.desc || ''}</div>`;
        document.body.appendChild(tip);
        const r = row.getBoundingClientRect();
        tip.style.left = `${r.right + 6}px`;
        tip.style.top = `${r.top}px`;
        row._tip = tip;
      });
      row.addEventListener('mouseleave', () => {
        if (row._tip) { document.body.removeChild(row._tip); row._tip = null; }
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
    const cards = Object.values(CARDS).filter(c => {
      if (selectedElements.size && !selectedElements.has(c.element)) return false;
      if (filterTypes.size) {
        const t = (c.type === 'SPELL') ? 'SPELL' : 'UNIT';
        if (!filterTypes.has(t)) return false;
      }
      if (filterSummon.size) {
        const sc = Math.min(c.cost || 0, 7);
        if (!filterSummon.has(sc)) return false;
      }
      if (filterAction.size) {
        const ac = Math.min(c.activation || 0, 7);
        if (!filterAction.has(ac)) return false;
      }
      return c.name.toLowerCase().includes(query) ||
             (c.desc || '').toLowerCase().includes(query);
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
    cleanup();
  });

  // Восстановление скрытых элементов и закрытие окна
  function cleanup(){
    hiddenEls.forEach(h => { h.el.style.display = h.display; });
    document.body.removeChild(overlay);
    onDone && onDone();
  }

  // Закрытие по клику вне панели
  overlay.addEventListener('click', e=>{ if (e.target===overlay) cleanup(); });

  nameInput.value = working.name;
  renderDeck();
  updateSummary();
  renderCatalog();

  document.body.appendChild(overlay);
}

const api = { open };
try { if (typeof window !== 'undefined') { window.__ui = window.__ui || {}; window.__ui.deckBuilder = api; } } catch {}
export default api;

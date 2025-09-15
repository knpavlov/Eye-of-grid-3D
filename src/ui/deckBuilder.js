// Редактор колод: фронтенд без проверки ограничений
import { CARDS } from '../core/cards.js';
import { DECKS, saveUserDecks } from '../core/decks.js';

const ELEMENTS = ['FIRE','WATER','EARTH','FOREST','BIOLITH'];
const MAX_COPIES = 3;

// Простая нечёткая проверка
function fuzzyIncludes(text, term) {
  return text.toLowerCase().includes(term.toLowerCase());
}

export function open(deck = null, onDone) {
  if (typeof document === 'undefined') return;
  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 bg-black bg-opacity-60 z-50 flex';

  // Состояние редактируемой колоды
  const working = deck ? { ...deck } : { id: 'CUSTOM_' + Date.now(), name: '', description: '', cards: [], builtIn: false };
  const counts = {};
  (deck ? deck.cards : []).forEach(c => { counts[c.id] = (counts[c.id]||0)+1; });

  // Фильтры
  const elFilter = new Set(ELEMENTS);
  const typeFilter = new Set();
  const summonFilter = new Set();
  const actionFilter = new Set();
  let search = '';

  // ЛЕВАЯ ПАНЕЛЬ (колода)
  const left = document.createElement('div');
  left.className = 'w-64 bg-slate-800 p-3 flex flex-col';
  overlay.appendChild(left);

  const nameInput = document.createElement('input');
  nameInput.className = 'mb-2 p-1 text-sm text-black';
  nameInput.placeholder = 'Deck name';
  nameInput.value = working.name || '';
  left.appendChild(nameInput);

  const deckList = document.createElement('div');
  deckList.className = 'flex-1 overflow-y-auto space-y-2 pr-1';
  left.appendChild(deckList);

  function updateSummary() {
    const total = Object.values(counts).reduce((a,b)=>a+b,0);
    summary.textContent = `${total}/20 cards`;
  }

  function rebuildDeckList() {
    deckList.innerHTML = '';
    // группировка по стоимости
    const groups = {};
    Object.entries(counts).forEach(([id,cnt]) => {
      const card = CARDS[id];
      const cost = card.cost || 0;
      (groups[cost] = groups[cost] || []).push({card, cnt});
    });
    Object.keys(groups).sort((a,b)=>a-b).forEach(cost => {
      const group = document.createElement('div');
      const gtitle = document.createElement('div');
      gtitle.className = 'text-xs text-slate-300 mt-2';
      gtitle.textContent = `Cost ${cost}`;
      group.appendChild(gtitle);
      groups[cost].forEach(({card,cnt}) => {
        const row = document.createElement('div');
        row.className = 'flex items-center h-10 cursor-pointer hover:bg-slate-700 rounded';
        // узкая полоска изображения
        const img = document.createElement('img');
        img.src = `card images/${card.id}.png`;
        img.className = 'w-10 h-full object-cover object-center';
        row.appendChild(img);
        // название
        const nm = document.createElement('div');
        nm.className = 'flex-1 pl-2 truncate';
        nm.textContent = card.name;
        row.appendChild(nm);
        // стоимости
        const costWrap = document.createElement('div');
        costWrap.className = 'flex gap-1 pr-2 text-xs';
        const sCost = document.createElement('span');
        sCost.className = 'px-1 bg-slate-600 rounded';
        sCost.textContent = card.cost ?? 0;
        const aCost = document.createElement('span');
        aCost.className = 'px-1 bg-slate-600 rounded';
        aCost.textContent = card.activation ?? 0;
        costWrap.appendChild(sCost); costWrap.appendChild(aCost);
        row.appendChild(costWrap);
        // счётчик
        const cntDiv = document.createElement('div');
        cntDiv.className = 'w-6 text-right pr-1';
        cntDiv.textContent = cnt;
        row.appendChild(cntDiv);
        // tooltip
        row.title = `${card.atk ?? '-'} / ${card.hp ?? '-'}\n${card.desc || ''}`;
        // удаление по клику
        row.addEventListener('click', () => {
          if (counts[card.id]) {
            counts[card.id]--;
            if (counts[card.id] <= 0) delete counts[card.id];
            rebuildDeckList(); updateSummary();
          }
        });
        group.appendChild(row);
      });
      deckList.appendChild(group);
    });
    updateSummary();
  }

  const summary = document.createElement('div');
  summary.className = 'mt-2 text-sm';
  left.appendChild(summary);

  const doneBtn = document.createElement('button');
  doneBtn.className = 'mt-2 overlay-panel px-3 py-1.5 bg-slate-600 hover:bg-slate-700';
  doneBtn.textContent = 'Done';
  doneBtn.addEventListener('click', () => {
    working.name = nameInput.value || 'Untitled';
    // разворачиваем counts в массив карт
    working.cards = Object.entries(counts).flatMap(([id,c]) => Array(c).fill(CARDS[id]));
    const idx = DECKS.findIndex(d => d.id === working.id);
    if (idx >= 0) DECKS[idx] = working; else DECKS.push(working);
    saveUserDecks();
    try { document.body.removeChild(overlay); } catch {}
    onDone && onDone(working);
  });
  left.appendChild(doneBtn);

  // ЦЕНТРАЛЬНАЯ ПАНЕЛЬ (каталог)
  const center = document.createElement('div');
  center.className = 'flex-1 bg-slate-900 p-3 flex flex-col';
  overlay.appendChild(center);

  // верхняя панель фильтров
  const topBar = document.createElement('div');
  topBar.className = 'flex items-center gap-2 mb-3';
  center.appendChild(topBar);

  // выбор стихий
  ELEMENTS.forEach(el => {
    const chk = document.createElement('button');
    chk.className = 'px-2 py-1 text-xs overlay-panel';
    chk.textContent = el[0]; // первая буква как условная иконка
    chk.dataset.el = el;
    chk.classList.add('bg-slate-600');
    chk.addEventListener('click', () => {
      if (elFilter.has(el)) elFilter.delete(el); else elFilter.add(el);
      chk.classList.toggle('opacity-50', !elFilter.has(el));
      rebuildCatalog();
    });
    topBar.appendChild(chk);
  });

  // кнопка фильтров
  const filterBtn = document.createElement('button');
  filterBtn.className = 'px-2 py-1 text-xs overlay-panel bg-slate-600';
  filterBtn.textContent = 'Filters';
  topBar.appendChild(filterBtn);

  // поиск
  const searchInput = document.createElement('input');
  searchInput.className = 'flex-1 p-1 text-black text-sm';
  searchInput.placeholder = 'Search';
  searchInput.addEventListener('input', () => { search = searchInput.value; rebuildCatalog(); });
  topBar.appendChild(searchInput);

  // оверлей фильтров
  const filterOverlay = document.createElement('div');
  filterOverlay.className = 'fixed inset-0 z-50 hidden items-center justify-center bg-black bg-opacity-60';
  filterOverlay.innerHTML = `<div class="overlay-panel p-4 space-y-3">
    <div class="text-sm font-semibold">By Type</div>
    <label class="block text-sm"><input type="checkbox" id="flt-unit" class="mr-1">Units</label>
    <label class="block text-sm mb-2"><input type="checkbox" id="flt-spell" class="mr-1">Spells</label>
    <div class="text-sm font-semibold">By Summoning Cost</div>
    <div id="flt-summon" class="flex flex-wrap gap-1 mb-2"></div>
    <div class="text-sm font-semibold">By Action Cost</div>
    <div id="flt-action" class="flex flex-wrap gap-1"></div>
    <div class="text-right mt-3"><button id="flt-close" class="overlay-panel px-3 py-1.5 bg-slate-600 hover:bg-slate-700">Close</button></div>
  </div>`;
  document.body.appendChild(filterOverlay);

  filterBtn.addEventListener('click', ()=>{ filterOverlay.classList.remove('hidden'); });
  filterOverlay.querySelector('#flt-close').addEventListener('click', ()=>{ filterOverlay.classList.add('hidden'); rebuildCatalog(); });
  // заполнение блоков стоимостей
  const summonWrap = filterOverlay.querySelector('#flt-summon');
  const actionWrap = filterOverlay.querySelector('#flt-action');
  const costOptions = [0,1,2,3,4,5,6,'7+'];
  costOptions.forEach(c => {
    const sBtn = document.createElement('button');
    sBtn.className = 'overlay-panel px-2 py-1 text-xs bg-slate-600';
    sBtn.textContent = c;
    sBtn.addEventListener('click', () => { toggleCost(summonFilter,c,sBtn); });
    summonWrap.appendChild(sBtn);
    const aBtn = document.createElement('button');
    aBtn.className = 'overlay-panel px-2 py-1 text-xs bg-slate-600';
    aBtn.textContent = c;
    aBtn.addEventListener('click', () => { toggleCost(actionFilter,c,aBtn); });
    actionWrap.appendChild(aBtn);
  });
  function toggleCost(set,val,btn){
    if(set.has(val)) set.delete(val); else set.add(val);
    btn.classList.toggle('opacity-50', !set.has(val));
  }
  // чекбоксы типов
  filterOverlay.querySelector('#flt-unit').addEventListener('change', e=>{ if(e.target.checked) typeFilter.add('UNIT'); else typeFilter.delete('UNIT'); });
  filterOverlay.querySelector('#flt-spell').addEventListener('change', e=>{ if(e.target.checked) typeFilter.add('SPELL'); else typeFilter.delete('SPELL'); });

  const catalog = document.createElement('div');
  catalog.className = 'grid grid-cols-4 gap-2 flex-1 overflow-y-auto';
  center.appendChild(catalog);

  function cardPasses(card){
    if (elFilter.size && !elFilter.has(card.element)) return false;
    if (typeFilter.size && !typeFilter.has(card.type)) return false;
    const sCost = card.cost || 0;
    const aCost = card.activation || 0;
    const sKey = sCost >=7 ? '7+' : sCost;
    const aKey = aCost >=7 ? '7+' : aCost;
    if (summonFilter.size && !summonFilter.has(sKey)) return false;
    if (actionFilter.size && !actionFilter.has(aKey)) return false;
    if (search && !fuzzyIncludes(card.name + ' ' + (card.desc||''), search)) return false;
    return true;
  }

  function rebuildCatalog(){
    catalog.innerHTML = '';
    Object.values(CARDS).filter(cardPasses).forEach(card => {
      const wrap = document.createElement('div');
      wrap.className = 'relative cursor-pointer';
      wrap.draggable = true;
      const img = document.createElement('img');
      img.src = `card images/${card.id}.png`;
      img.className = 'w-full h-full object-cover';
      wrap.appendChild(img);
      wrap.addEventListener('click', () => addCard(card));
      wrap.addEventListener('dragstart', e=>{ e.dataTransfer.setData('text/plain', card.id); });
      catalog.appendChild(wrap);
    });
  }

  function addCard(card){
    const cur = counts[card.id]||0;
    if (cur >= MAX_COPIES){ alert('Лимит копий достигнут'); return; }
    counts[card.id] = cur+1;
    rebuildDeckList();
  }

  // поддержка dnd в левую панель
  deckList.addEventListener('dragover', e=>{ e.preventDefault(); });
  deckList.addEventListener('drop', e=>{
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    const card = CARDS[id];
    if(card) addCard(card);
  });

  rebuildDeckList();
  rebuildCatalog();

  document.body.appendChild(overlay);
}

const api = { open };
try { if (typeof window !== 'undefined') { window.__ui = window.__ui || {}; window.__ui.deckBuilder = api; } } catch {}
export default api;

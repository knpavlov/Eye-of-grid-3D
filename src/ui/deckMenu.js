// Меню выбора колоды
import { DECKS } from '../core/decks.js';

// Получить путь к изображению самой дорогой карты колоды
function deckImage(deck){
  let max = -1; let pool = [];
  (deck.cards || []).forEach(c => {
    const cost = c?.cost ?? 0;
    if (cost > max){ max = cost; pool = [c]; }
    else if (cost === max){ pool.push(c); }
  });
  const pick = pool[Math.floor(Math.random()*pool.length)] || null;
  return pick ? `card images/${pick.id}.png` : '';
}

// Показать меню выбора
export function showDeckSelect(onConfirm){
  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 flex items-center justify-center bg-black/60 z-50';
  const wrap = document.createElement('div');
  wrap.className = 'bg-slate-800 p-4 rounded-lg w-80 max-h-[80vh] flex flex-col';
  const list = document.createElement('div');
  list.className = 'flex-1 overflow-y-auto space-y-3 pr-1';

  let selected = DECKS[0]?.id;

  // Создаём элементы списка
  DECKS.forEach(d => {
    const item = document.createElement('div');
    item.className = 'deck-item flex gap-3 p-2 rounded-md cursor-pointer hover:bg-slate-700';
    item.dataset.id = d.id;

    const imgBox = document.createElement('div');
    imgBox.className = 'relative w-24 h-32 flex-shrink-0 rounded-md overflow-hidden';
    const img = document.createElement('img');
    img.src = deckImage(d);
    img.className = 'w-full h-full object-cover';
    const grad = document.createElement('div');
    grad.className = 'absolute inset-0 pointer-events-none';
    grad.style.background = 'linear-gradient(to right, rgba(15,23,42,0) 60%, rgba(15,23,42,1) 100%)';
    imgBox.appendChild(img); imgBox.appendChild(grad);

    const info = document.createElement('div');
    info.className = 'flex-1 flex flex-col justify-center';
    const name = document.createElement('div');
    name.textContent = d.name; name.className = 'font-semibold';
    const desc = document.createElement('div');
    desc.textContent = d.desc; desc.className = 'text-xs text-slate-300';
    info.appendChild(name); info.appendChild(desc);

    item.appendChild(imgBox); item.appendChild(info);
    list.appendChild(item);
  });

  function refresh(){
    list.querySelectorAll('.deck-item').forEach(el => {
      if (el.dataset.id === selected){ el.classList.add('ring-2','ring-sky-500'); }
      else { el.classList.remove('ring-2','ring-sky-500'); }
    });
  }
  refresh();

  list.addEventListener('click', e => {
    const item = e.target.closest('.deck-item');
    if (!item) return;
    selected = item.dataset.id;
    refresh();
  });

  const btns = document.createElement('div');
  btns.className = 'mt-4 flex justify-end gap-2';
  const ok = document.createElement('button');
  ok.className = 'overlay-panel px-4 py-2 bg-sky-600 hover:bg-sky-700';
  ok.textContent = 'Подтвердить';
  const cancel = document.createElement('button');
  cancel.className = 'overlay-panel px-4 py-2 bg-gray-600 hover:bg-gray-700';
  cancel.textContent = 'Отмена';
  btns.appendChild(cancel); btns.appendChild(ok);

  ok.addEventListener('click', () => {
    const deck = DECKS.find(d=>d.id===selected);
    overlay.remove();
    if (deck) onConfirm?.(deck);
  });
  cancel.addEventListener('click', () => overlay.remove());

  wrap.appendChild(list); wrap.appendChild(btns); overlay.appendChild(wrap);
  document.body.appendChild(overlay);
}

export default { showDeckSelect };

// Меню выбора колоды
import { DECKS } from '../core/decks.js';

function pickDeckImage(deck) {
  // выбираем самую дорогую по мане карту; при равенстве — случайная
  const costs = deck.cards.map(c => c.cost || 0);
  const max = Math.max(...costs);
  const candidates = deck.cards.filter(c => (c.cost || 0) === max);
  const card = candidates[Math.floor(Math.random() * candidates.length)];
  return `card images/${card.id}.png`;
}

export function open(onConfirm, onCancel) {
  if (typeof document === 'undefined') return;
  let selected = 0;
  const overlay = document.createElement('div');
  overlay.id = 'deck-select-overlay';
  overlay.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60';

  const panel = document.createElement('div');
  // панель стала шире и получила лёгкую тень для выразительности
  panel.className = 'bg-slate-800 p-4 rounded-lg w-[26rem] max-h-[90vh] flex flex-col shadow-xl';
  overlay.appendChild(panel);

  const title = document.createElement('div');
  title.className = 'text-lg font-semibold mb-3';
  title.textContent = 'Choose a deck';
  panel.appendChild(title);

  const list = document.createElement('div');
  // ограничиваем высоту списка, чтобы появлялась прокрутка
  list.className = 'flex-1 overflow-y-auto space-y-3 pr-1 max-h-72';
  panel.appendChild(list);

  DECKS.forEach((d, idx) => {
    const item = document.createElement('div');
    // внутреннее кольцо выделения, эффект наведения и плавное масштабирование
    item.className = 'relative flex h-24 cursor-pointer rounded-md border border-slate-700 overflow-hidden transition-all hover:scale-[1.02] hover:shadow-lg';
    if (idx === selected) item.classList.add('ring-2', 'ring-inset', 'ring-yellow-500');

    const imgWrap = document.createElement('div');
    imgWrap.className = 'relative w-40 h-full flex-shrink-0 overflow-hidden';
    const img = document.createElement('img');
    img.src = pickDeckImage(d);
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
    nm.textContent = d.name;
    const ds = document.createElement('div');
    ds.className = 'text-sm text-slate-300';
    ds.textContent = d.description;
    text.appendChild(nm); text.appendChild(ds);
    item.appendChild(text);

    item.addEventListener('click', () => {
      selected = idx;
      [...list.children].forEach((el, i) => {
        el.classList.toggle('ring-2', i === selected);
        el.classList.toggle('ring-inset', i === selected);
        el.classList.toggle('ring-yellow-500', i === selected);
      });
    });
    list.appendChild(item);
  });

  const btnWrap = document.createElement('div');
  btnWrap.className = 'flex justify-end gap-2 mt-4';
  panel.appendChild(btnWrap);

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'overlay-panel px-3 py-1.5 bg-slate-600 hover:bg-slate-500 transition-colors btn-gloss';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => { document.body.removeChild(overlay); onCancel && onCancel(); });
  btnWrap.appendChild(cancelBtn);

  const okBtn = document.createElement('button');
  okBtn.className = 'overlay-panel px-3 py-1.5 bg-slate-600 hover:bg-slate-500 transition-colors btn-gloss';
  okBtn.textContent = 'Confirm';
  okBtn.addEventListener('click', () => {
    try { document.body.removeChild(overlay); } catch {}
    onConfirm && onConfirm(DECKS[selected]);
  });
  btnWrap.appendChild(okBtn);

  document.body.appendChild(overlay);
}

const api = { open };
try { if (typeof window !== 'undefined') { window.__ui = window.__ui || {}; window.__ui.deckSelect = api; } } catch {}
export default api;

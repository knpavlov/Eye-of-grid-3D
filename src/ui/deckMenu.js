import { DECKS } from '../core/decks.js';

// Промпт выбора колоды. Возвращает промис с объектом
// выбранной колоды { index, deck }, либо null при отмене.
export function selectDeck() {
  return new Promise(resolve => {
    // Создаём затемнённый фон
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50';

    // Каркас окна
    const panel = document.createElement('div');
    panel.className = 'overlay-panel p-6 w-96 max-h-[80vh] flex flex-col';
    overlay.appendChild(panel);

    const title = document.createElement('h3');
    title.className = 'text-xl font-semibold mb-4 text-center';
    title.textContent = 'Выберите колоду';
    panel.appendChild(title);

    // Список колод
    const list = document.createElement('div');
    list.className = 'flex-1 overflow-y-auto space-y-3 mb-4';
    panel.appendChild(list);

    // Текущий выбор
    let current = 0;

    DECKS.forEach((d, i) => {
      const item = document.createElement('div');
      item.className = 'flex gap-4 p-2 rounded cursor-pointer bg-slate-800 hover:bg-slate-700';
      item.dataset.index = String(i);

      // Иллюстрация: карта с максимальной стоимостью
      const imgWrap = document.createElement('div');
      imgWrap.className = 'relative w-24 h-16 flex-shrink-0 rounded overflow-hidden';
      const maxCost = Math.max(...d.cards.map(c => c.cost || 0));
      const candidates = d.cards.filter(c => (c.cost || 0) === maxCost);
      const card = candidates[Math.floor(Math.random() * candidates.length)] || {};
      const img = document.createElement('img');
      img.src = `card images/${card.id || ''}.png`;
      img.className = 'w-full h-full object-cover';
      imgWrap.appendChild(img);
      // Градиент для плавного перехода
      const fade = document.createElement('div');
      fade.className = 'absolute inset-0 bg-gradient-to-r from-transparent to-slate-800';
      imgWrap.appendChild(fade);
      item.appendChild(imgWrap);

      const info = document.createElement('div');
      info.className = 'flex-1';
      const name = document.createElement('div');
      name.className = 'font-semibold';
      name.textContent = d.name;
      const desc = document.createElement('div');
      desc.className = 'text-xs text-slate-300';
      desc.textContent = d.desc;
      info.appendChild(name);
      info.appendChild(desc);
      item.appendChild(info);

      item.addEventListener('click', () => {
        current = i;
        // Подсветка выбора
        [...list.children].forEach(el => el.classList.remove('ring-2', 'ring-yellow-500'));
        item.classList.add('ring-2', 'ring-yellow-500');
      });

      if (i === current) item.classList.add('ring-2', 'ring-yellow-500');
      list.appendChild(item);
    });

    // Кнопки подтверждения
    const btnRow = document.createElement('div');
    btnRow.className = 'flex justify-end gap-2';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'overlay-panel px-4 py-2 bg-gray-600 hover:bg-gray-700';
    cancelBtn.textContent = 'Отмена';
    cancelBtn.addEventListener('click', () => {
      overlay.remove();
      resolve(null);
    });

    const okBtn = document.createElement('button');
    okBtn.className = 'overlay-panel px-4 py-2 bg-green-600 hover:bg-green-700';
    okBtn.textContent = 'Выбрать';
    okBtn.addEventListener('click', () => {
      overlay.remove();
      resolve({ index: current, deck: DECKS[current] });
    });

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(okBtn);
    panel.appendChild(btnRow);

    document.body.appendChild(overlay);
  });
}

export default { selectDeck };

// Логика вычисления клеток, защищённых от fieldquake и обмена
// Чистая логика без зависимостей от визуализации
import { CARDS } from './cards.js';
import { DIR_VECTORS, inBounds } from './constants.js';

// Возвращает массив координат {r,c} клеток, которые нельзя fieldquake/exchange
export function computeFieldquakeLockedCells(state) {
  const locked = new Set();
  if (!state?.board) return [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const unit = state.board[r]?.[c]?.unit;
      if (!unit) continue;
      const tpl = CARDS[unit.tplId];
      const lock = tpl?.fieldquakeLock;
      if (!lock) continue;
      if (lock.onlyWhileOnElement) {
        const required = String(lock.onlyWhileOnElement).toUpperCase();
        const cellElement = String(state.board?.[r]?.[c]?.element || '').toUpperCase();
        if (!required || cellElement !== required) continue;
      }
      const add = (rr, cc) => {
        if (inBounds(rr, cc)) locked.add(`${rr},${cc}`);
      };
      switch (lock.type) {
        case 'ADJACENT':
          for (const [dr, dc] of Object.values(DIR_VECTORS)) add(r + dr, c + dc);
          break;
        case 'ELEMENT':
          const el = lock.element;
          for (let rr = 0; rr < 3; rr++)
            for (let cc = 0; cc < 3; cc++)
              if (state.board[rr][cc]?.element === el) add(rr, cc);
          break;
        case 'FRONT':
          const vec = DIR_VECTORS[unit.facing];
          if (vec) add(r + vec[0], c + vec[1]);
          break;
        case 'SELF':
          add(r, c);
          break;
        case 'ALL':
          for (let rr = 0; rr < 3; rr++)
            for (let cc = 0; cc < 3; cc++) add(rr, cc);
          break;
        default:
          break;
      }
    }
  }
  return Array.from(locked).map(s => {
    const [r, c] = s.split(',').map(Number);
    return { r, c };
  });
}

export default { computeFieldquakeLockedCells };

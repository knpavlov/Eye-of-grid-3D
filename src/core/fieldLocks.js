// Логика вычисления клеток, защищённых от fieldquake и обмена
// Чистая логика без зависимостей от визуализации
import { CARDS } from './cards.js';
import { DIR_VECTORS, inBounds } from './constants.js';
import { normalizeElementName } from './utils/elements.js';

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
      const cellElement = state.board?.[r]?.[c]?.element || null;
      const normalizedCell = normalizeElementName(cellElement);
      const requireElement = normalizeElementName(lock.requireElement || lock.onElement);
      if (requireElement && normalizedCell !== requireElement) continue;
      const forbidElement = normalizeElementName(lock.forbidElement || lock.excludeElement);
      if (forbidElement && normalizedCell === forbidElement) continue;
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

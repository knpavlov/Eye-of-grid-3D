// Управление запретами на fieldquake/обмен полей
import { CARDS } from './cards.js';

// Возвращает массив уникальных клеток, которые защищены
export function computeLockedCells(state) {
  const cells = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const unit = state.board?.[r]?.[c]?.unit;
      if (!unit) continue;
      const tpl = CARDS[unit.tplId];
      if (!tpl) continue;
      const lock = tpl.fieldquakeLock;
      const add = (rr, cc) => {
        if (rr >= 0 && rr < 3 && cc >= 0 && cc < 3) cells.push({ r: rr, c: cc });
      };
      if (tpl.fortress || lock?.scope === 'ADJACENT') {
        add(r + 1, c); add(r - 1, c); add(r, c + 1); add(r, c - 1);
      }
      if (lock?.scope === 'ALL') {
        for (let rr = 0; rr < 3; rr++) for (let cc = 0; cc < 3; cc++) add(rr, cc);
      }
      if (lock?.scope === 'ELEMENT') {
        const el = lock.element;
        for (let rr = 0; rr < 3; rr++) for (let cc = 0; cc < 3; cc++) {
          if (state.board?.[rr]?.[cc]?.element === el) add(rr, cc);
        }
      }
      if (lock?.scope === 'FRONT') {
        const dirs = { N:[-1,0], S:[1,0], E:[0,1], W:[0,-1] };
        const [dr, dc] = dirs[unit.facing] || [0,0];
        add(r + dr, c + dc);
      }
    }
  }
  const uniq = {};
  cells.forEach(({r,c}) => { uniq[`${r},${c}`] = { r, c }; });
  return Object.values(uniq);
}

export function isFieldquakeLocked(state, r, c) {
  return computeLockedCells(state).some(cell => cell.r === r && cell.c === c);
}

export default { computeLockedCells, isFieldquakeLocked };

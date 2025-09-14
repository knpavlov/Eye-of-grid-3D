import { CARDS } from './cards.js';
import { DIR_VECTORS, inBounds } from './constants.js';

// Пересчитывает блокировки изменения полей.
// Возвращает массив координат заблокированных клеток.
export function recomputeFieldLocks(state) {
  const locked = [];
  if (!state || !state.board) return locked;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const cell = state.board[r][c];
      if (cell) cell.fieldLock = null;
    }
  }
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const unit = state.board?.[r]?.[c]?.unit;
      if (!unit) continue;
      const tpl = CARDS[unit.tplId];
      const lock = tpl?.fieldquakeLock;
      if (!lock) continue;
      if (lock.scope === 'ADJACENT') {
        for (const [dr, dc] of Object.values(DIR_VECTORS)) {
          const nr = r + dr, nc = c + dc;
          if (!inBounds(nr, nc)) continue;
          state.board[nr][nc].fieldLock = { quake: true, exchange: true };
          locked.push({ r: nr, c: nc });
        }
      } else if (lock.scope === 'ELEMENT') {
        for (let rr = 0; rr < 3; rr++) {
          for (let cc = 0; cc < 3; cc++) {
            if (state.board[rr][cc].element === lock.element) {
              state.board[rr][cc].fieldLock = { quake: true, exchange: true };
              locked.push({ r: rr, c: cc });
            }
          }
        }
      } else if (lock.scope === 'FRONT') {
        const [dr, dc] = DIR_VECTORS[unit.facing] || [0, 0];
        const nr = r + dr, nc = c + dc;
        if (inBounds(nr, nc)) {
          state.board[nr][nc].fieldLock = { quake: true, exchange: true };
          locked.push({ r: nr, c: nc });
        }
      } else if (lock.scope === 'ALL') {
        for (let rr = 0; rr < 3; rr++) {
          for (let cc = 0; cc < 3; cc++) {
            state.board[rr][cc].fieldLock = { quake: true, exchange: true };
            locked.push({ r: rr, c: cc });
          }
        }
      }
    }
  }
  return locked;
}

export function isFieldLocked(state, r, c) {
  return !!state?.board?.[r]?.[c]?.fieldLock;
}

export function getLockedCells(state) {
  const cells = [];
  if (!state || !state.board) return cells;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if (state.board[r][c]?.fieldLock) cells.push({ r, c });
    }
  }
  return cells;
}

const api = { recomputeFieldLocks, isFieldLocked, getLockedCells };
try { if (typeof window !== 'undefined') window.__fieldLocks = api; } catch {}
export default api;

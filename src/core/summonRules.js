// Правила призыва существ на поле.
// Файл содержит чистые функции, определяющие допустимые клетки для размещения.
import { countControlled } from './board.js';

function isAdjacentToAnyUnit(state, r, c) {
  if (!state || !Array.isArray(state.board)) return false;
  const dirs = [
    { dr: -1, dc: 0 },
    { dr: 1, dc: 0 },
    { dr: 0, dc: -1 },
    { dr: 0, dc: 1 },
  ];
  for (const { dr, dc } of dirs) {
    const nr = r + dr;
    const nc = c + dc;
    if (nr < 0 || nc < 0) continue;
    if (nr >= state.board.length) continue;
    if (!Array.isArray(state.board[nr])) continue;
    if (nc >= state.board[nr].length) continue;
    const cell = state.board[nr][nc];
    if (cell && cell.unit) return true;
  }
  return false;
}

export function getSummonableCells(state, playerIndex) {
  if (!state || !Array.isArray(state.board)) return [];
  const board = state.board;
  const rows = board.length;
  if (!Number.isInteger(playerIndex) || playerIndex < 0) return [];
  const ownCount = countControlled(state, playerIndex);
  const firstSummon = ownCount <= 0;
  const cells = [];
  for (let r = 0; r < rows; r++) {
    const cols = Array.isArray(board[r]) ? board[r].length : 0;
    for (let c = 0; c < cols; c++) {
      const cell = board[r][c];
      if (!cell || cell.unit) continue;
      if (firstSummon) {
        cells.push({ r, c });
        continue;
      }
      if (isAdjacentToAnyUnit(state, r, c)) {
        cells.push({ r, c });
      }
    }
  }
  return cells;
}

export function canSummonAt(state, playerIndex, r, c) {
  if (!state || !Array.isArray(state.board)) return false;
  if (!Number.isInteger(playerIndex) || playerIndex < 0) return false;
  if (!Number.isInteger(r) || !Number.isInteger(c)) return false;
  const row = state.board[r];
  if (!Array.isArray(row)) return false;
  const cell = row[c];
  if (!cell || cell.unit) return false;
  if (countControlled(state, playerIndex) <= 0) return true;
  return isAdjacentToAnyUnit(state, r, c);
}

export default {
  getSummonableCells,
  canSummonAt,
};

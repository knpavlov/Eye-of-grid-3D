// Логика ограничений на призыв существ.
// Здесь нет никакой визуальной части, только вычисление допустимых клеток.

const ORTHOGONAL_DIRS = [
  { dr: -1, dc: 0 },
  { dr: 1, dc: 0 },
  { dr: 0, dc: -1 },
  { dr: 0, dc: 1 },
];

function isValidCell(board, r, c) {
  return Array.isArray(board)
    && r >= 0
    && c >= 0
    && r < board.length
    && Array.isArray(board[r])
    && c < board[r].length
    && board[r][c];
}

export function hasPlayerSummoned(state, playerIndex) {
  if (!state || !Array.isArray(state.board)) return false;
  for (let r = 0; r < state.board.length; r++) {
    const row = state.board[r];
    if (!Array.isArray(row)) continue;
    for (let c = 0; c < row.length; c++) {
      const unit = row[c]?.unit;
      if (!unit) continue;
      if (unit.owner === playerIndex) {
        return true;
      }
    }
  }
  return false;
}

function isAdjacentToAnyUnit(state, r, c) {
  if (!state || !Array.isArray(state.board)) return false;
  for (const { dr, dc } of ORTHOGONAL_DIRS) {
    const nr = r + dr;
    const nc = c + dc;
    if (!isValidCell(state.board, nr, nc)) continue;
    if (state.board[nr][nc]?.unit) {
      return true;
    }
  }
  return false;
}

export function canSummonOnCell(state, playerIndex, r, c) {
  if (!state || !isValidCell(state.board, r, c)) return false;
  const cell = state.board[r][c];
  if (!cell || cell.unit) return false;
  if (!hasPlayerSummoned(state, playerIndex)) {
    return true;
  }
  return isAdjacentToAnyUnit(state, r, c);
}

export function getAllowedSummonCells(state, playerIndex) {
  const result = [];
  if (!state || !Array.isArray(state.board)) return result;
  for (let r = 0; r < state.board.length; r++) {
    const row = state.board[r];
    if (!Array.isArray(row)) continue;
    for (let c = 0; c < row.length; c++) {
      if (canSummonOnCell(state, playerIndex, r, c)) {
        result.push({ r, c });
      }
    }
  }
  return result;
}

export function getAdjacentDirs() {
  return ORTHOGONAL_DIRS.map(({ dr, dc }) => ({ dr, dc }));
}

export default {
  hasPlayerSummoned,
  canSummonOnCell,
  getAllowedSummonCells,
  getAdjacentDirs,
};

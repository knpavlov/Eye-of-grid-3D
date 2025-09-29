// Логика доступных клеток для призыва существ.
// Вынесена в отдельный модуль, чтобы изоляция от визуальных эффектов была проще
// и миграция на другой движок не требовала переписывать правила.

const ORTHO_DIRS = [
  { dr: 1, dc: 0 },
  { dr: -1, dc: 0 },
  { dr: 0, dc: 1 },
  { dr: 0, dc: -1 },
];

function isBoardCellAccessible(board, r, c) {
  return Array.isArray(board)
    && r >= 0 && r < board.length
    && Array.isArray(board[r])
    && c >= 0 && c < board[r].length;
}

export function hasPlayerPlacedUnit(state, playerIndex) {
  if (!state || typeof playerIndex !== 'number') return false;
  const player = state.players?.[playerIndex];
  if (player?.hasSummonedUnit) return true;
  const checkPile = (pile) => Array.isArray(pile)
    && pile.some(card => card && typeof card === 'object' && card.type === 'UNIT');
  if (checkPile(player?.discard) || checkPile(player?.graveyard)) return true;
  const board = state.board;
  if (!Array.isArray(board)) return false;
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[r].length; c++) {
      const unit = board[r]?.[c]?.unit;
      if (unit && unit.owner === playerIndex) return true;
    }
  }
  return false;
}

export function markPlayerSummoned(state, playerIndex) {
  if (!state || typeof playerIndex !== 'number') return;
  const player = state.players?.[playerIndex];
  if (!player) return;
  player.hasSummonedUnit = true;
}

function hasAdjacentUnit(board, r, c) {
  if (!Array.isArray(board)) return false;
  for (const { dr, dc } of ORTHO_DIRS) {
    const nr = r + dr;
    const nc = c + dc;
    if (!isBoardCellAccessible(board, nr, nc)) continue;
    if (board[nr][nc]?.unit) return true;
  }
  return false;
}

export function isSummonCellAllowed(state, playerIndex, row, col, options = {}) {
  if (!state || typeof playerIndex !== 'number') return false;
  const board = state.board;
  if (!isBoardCellAccessible(board, row, col)) return false;
  const cell = board[row][col];
  const unit = cell?.unit || null;
  const allowOccupiedFriendly = !!options.allowOccupiedFriendly;

  if (unit) {
    if (!allowOccupiedFriendly) return false;
    return unit.owner === playerIndex;
  }

  const firstPlacement = !hasPlayerPlacedUnit(state, playerIndex);
  if (firstPlacement) return true;

  return hasAdjacentUnit(board, row, col);
}

export function computeSummonableCells(state, playerIndex, options = {}) {
  const includeOccupiedFriendly = !!options.includeOccupiedFriendly;
  const board = state?.board;
  if (!Array.isArray(board)) return [];
  const rows = board.length;
  const cols = rows ? board[0].length : 0;
  const cells = [];

  const firstPlacement = !hasPlayerPlacedUnit(state, playerIndex);
  if (firstPlacement) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const unit = board[r]?.[c]?.unit || null;
        if (unit) {
          if (includeOccupiedFriendly && unit.owner === playerIndex) {
            cells.push({ r, c });
          }
          continue;
        }
        cells.push({ r, c });
      }
    }
    return cells;
  }

  const seen = new Set();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!board[r]?.[c]?.unit) continue;
      for (const { dr, dc } of ORTHO_DIRS) {
        const nr = r + dr;
        const nc = c + dc;
        if (!isBoardCellAccessible(board, nr, nc)) continue;
        const key = `${nr}:${nc}`;
        if (seen.has(key)) continue;
        const targetUnit = board[nr][nc]?.unit || null;
        if (targetUnit) {
          if (includeOccupiedFriendly && targetUnit.owner === playerIndex) {
            cells.push({ r: nr, c: nc });
            seen.add(key);
          }
          continue;
        }
        cells.push({ r: nr, c: nc });
        seen.add(key);
      }
    }
  }
  return cells;
}

export default {
  hasPlayerPlacedUnit,
  markPlayerSummoned,
  isSummonCellAllowed,
  computeSummonableCells,
};

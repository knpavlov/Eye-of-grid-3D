// Правила размещения существ на поле.
// Логика вынесена в отдельный модуль, чтобы облегчить перенос на другие движки.

// Проверка принадлежности координат игровому полю 3x3
function isInBounds(r, c) {
  return r >= 0 && r < 3 && c >= 0 && c < 3;
}

// Возвращает true, если у игрока уже есть существа на поле
export function hasPlayerUnits(gameState, playerIndex) {
  if (!gameState || !Array.isArray(gameState.board)) return false;
  for (let r = 0; r < gameState.board.length; r++) {
    const row = gameState.board[r];
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      const unit = row[c]?.unit;
      if (unit && typeof unit.owner === 'number' && unit.owner === playerIndex) {
        return true;
      }
    }
  }
  return false;
}

// Проверяет, есть ли хотя бы одно существо рядом (по сторонам) с указанной клеткой
function hasAdjacentUnits(gameState, r, c) {
  if (!gameState || !Array.isArray(gameState.board)) return false;
  const dirs = [
    { dr: -1, dc: 0 },
    { dr: 1, dc: 0 },
    { dr: 0, dc: -1 },
    { dr: 0, dc: 1 },
  ];
  for (const { dr, dc } of dirs) {
    const nr = r + dr;
    const nc = c + dc;
    if (!isInBounds(nr, nc)) continue;
    const unit = gameState.board?.[nr]?.[nc]?.unit;
    if (unit) return true;
  }
  return false;
}

// Возвращает true, если указанная клетка занята любым существом
export function isCellOccupied(gameState, r, c) {
  if (!gameState || !Array.isArray(gameState.board)) return false;
  return !!gameState.board?.[r]?.[c]?.unit;
}

// Проверяет возможность постановки существа на пустую клетку с учётом новых ограничений
export function canSummonOnEmptyCell(gameState, playerIndex, r, c) {
  if (!gameState || !Array.isArray(gameState.board)) {
    return { allowed: false, reason: 'Game state is unavailable.' };
  }
  if (!isInBounds(r, c)) {
    return { allowed: false, reason: 'Cell is out of bounds.' };
  }
  if (isCellOccupied(gameState, r, c)) {
    return { allowed: false, reason: 'Cell is occupied.' };
  }
  if (!hasPlayerUnits(gameState, playerIndex)) {
    // Первое существо можно ставить в любую пустую клетку
    return { allowed: true };
  }
  if (!hasAdjacentUnits(gameState, r, c)) {
    return { allowed: false, reason: 'Choose a field next to any creature.' };
  }
  return { allowed: true };
}

// Собирает список пустых клеток, доступных для постановки существа
export function getAvailableEmptyCells(gameState, playerIndex) {
  const result = [];
  if (!gameState || !Array.isArray(gameState.board)) return result;
  for (let r = 0; r < gameState.board.length; r++) {
    const row = gameState.board[r];
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      const check = canSummonOnEmptyCell(gameState, playerIndex, r, c);
      if (check.allowed) {
        result.push({ r, c });
      }
    }
  }
  return result;
}

export default {
  hasPlayerUnits,
  isCellOccupied,
  canSummonOnEmptyCell,
  getAvailableEmptyCells,
};

// Модуль обработки особых областей для магических атак
import { inBounds } from '../constants.js';

function ensureUnique(cells) {
  const seen = new Set();
  const res = [];
  for (const cell of cells || []) {
    if (!cell) continue;
    const key = `${cell.r},${cell.c}`;
    if (seen.has(key)) continue;
    seen.add(key);
    res.push({ r: cell.r, c: cell.c });
  }
  return res;
}

function collectAllByPredicate(state, predicate) {
  const result = [];
  if (!state?.board) return result;
  for (let r = 0; r < state.board.length; r++) {
    for (let c = 0; c < state.board[r].length; c++) {
      if (!inBounds(r, c)) continue;
      const cell = state.board[r][c];
      const unit = cell?.unit || null;
      if (predicate(unit, cell?.element, r, c)) {
        result.push({ r, c });
      }
    }
  }
  return result;
}

function resolveOwner(state, attackerRef = {}) {
  if (typeof attackerRef.owner === 'number') return attackerRef.owner;
  if (typeof attackerRef.r === 'number' && typeof attackerRef.c === 'number') {
    const unit = state?.board?.[attackerRef.r]?.[attackerRef.c]?.unit;
    if (unit) return unit.owner;
  }
  return null;
}

export function collectMagicTargets(state, tpl, attackerRef, primaryTarget, computeDefaultArea) {
  if (!tpl) return [];
  const owner = resolveOwner(state, attackerRef);

  if (tpl.targetAllEnemies) {
    return ensureUnique(collectAllByPredicate(state, (unit) => !!unit && (owner == null || unit.owner !== owner)));
  }

  if (tpl.targetAllNonElement) {
    const forbidden = String(tpl.targetAllNonElement || '').toUpperCase();
    return ensureUnique(collectAllByPredicate(
      state,
      (unit, element) => !!unit && (owner == null || unit.owner !== owner) && element !== forbidden,
    ));
  }

  if (typeof primaryTarget?.r === 'number' && typeof primaryTarget?.c === 'number') {
    const base = computeDefaultArea ? computeDefaultArea(tpl, primaryTarget.r, primaryTarget.c) : [];
    return ensureUnique(base);
  }

  return [];
}

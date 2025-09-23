// Логика динамического изменения атаки существ (чистая логика без визуала)
import { CARDS } from '../cards.js';
import { countUnits } from '../board.js';

const ELEMENT_DYNAMIC_MAP = {
  FIRE_CREATURES: 'FIRE',
  FOREST_CREATURES: 'FOREST',
  WATER_CREATURES: 'WATER',
};

function countElementCreatures(state, element, exclude) {
  if (!state?.board) return 0;
  let count = 0;
  for (let r = 0; r < state.board.length; r += 1) {
    const row = state.board[r];
    if (!Array.isArray(row)) continue;
    for (let c = 0; c < row.length; c += 1) {
      if (exclude && exclude.r === r && exclude.c === c) continue;
      const unit = row[c]?.unit;
      if (!unit) continue;
      const tpl = CARDS[unit.tplId];
      if (tpl?.element === element) count += 1;
    }
  }
  return count;
}

export function computeDynamicAttackBonuses(state, r, c, tpl) {
  const bonuses = [];
  if (!tpl || !tpl.dynamicAtk) return bonuses;
  const key = tpl.dynamicAtk;
  if (key === 'OTHERS_ON_BOARD') {
    const total = Math.max(0, countUnits(state) - 1);
    if (total > 0) {
      bonuses.push({ amount: total, reason: 'OTHERS_ON_BOARD' });
    }
    return bonuses;
  }
  const element = ELEMENT_DYNAMIC_MAP[key];
  if (element) {
    const count = countElementCreatures(state, element, { r, c });
    if (count > 0) {
      bonuses.push({ amount: count, reason: key, element });
    }
  }
  return bonuses;
}

export default {
  computeDynamicAttackBonuses,
};

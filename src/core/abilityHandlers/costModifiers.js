// Модуль для расчёта модификаторов стоимости активации от аур существ
// Держим отдельно от визуала для удобства портирования логики
import { CARDS } from '../cards.js';

const inBounds = (r, c) => r >= 0 && r < 3 && c >= 0 && c < 3;

const ADJACENT_DIRS = [
  { dr: -1, dc: 0 },
  { dr: 1, dc: 0 },
  { dr: 0, dc: -1 },
  { dr: 0, dc: 1 },
];

function normalizeTax(value) {
  if (value == null) return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'object') {
    if (typeof value.amount === 'number') return value.amount;
    if (typeof value.value === 'number') return value.value;
    if (typeof value.plus === 'number') return value.plus;
  }
  return 0;
}

export function extraActivationCostFromAuras(state, r, c, opts = {}) {
  if (!state?.board) return 0;
  const attackerUnit = opts.unit || state.board?.[r]?.[c]?.unit || null;
  const owner = opts.owner ?? attackerUnit?.owner ?? null;
  let total = 0;
  for (const { dr, dc } of ADJACENT_DIRS) {
    const nr = r + dr;
    const nc = c + dc;
    if (!inBounds(nr, nc)) continue;
    const auraUnit = state.board?.[nr]?.[nc]?.unit;
    if (!auraUnit) continue;
    const tplAura = CARDS[auraUnit.tplId];
    if (!tplAura) continue;
    if (owner != null && auraUnit.owner === owner) continue;
    const alive = (auraUnit.currentHP ?? tplAura.hp ?? 0) > 0;
    if (!alive) continue;
    const tax = normalizeTax(tplAura.enemyActivationTaxAdjacent);
    if (!tax) continue;
    total += tax;
  }
  return total;
}

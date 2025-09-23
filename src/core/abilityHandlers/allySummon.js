// Реакции на призыв союзников рядом с источником (чистая логика)
// Модуль не зависит от визуальных компонентов, чтобы упростить перенос на Unity
import { CARDS } from '../cards.js';
import { DIR_VECTORS, inBounds } from '../constants.js';
import { drawCards } from './draw.js';

function toUpper(value) {
  if (!value) return null;
  return String(value).toUpperCase();
}

function safeAmount(value, fallback = 1) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  if (value === true) return 1;
  if (value === false || value == null) return Math.max(0, Math.floor(fallback));
  return Math.max(0, Math.floor(fallback));
}

function normalizeAdjacentDrawConfig(raw) {
  if (!raw) return null;
  if (raw === true) return { amount: 1 };
  if (typeof raw === 'number') return { amount: safeAmount(raw) };
  if (typeof raw === 'object') {
    const amount = safeAmount(raw.amount ?? raw.count ?? 1);
    const requireSourceField = toUpper(raw.requireSourceField || raw.sourceField || raw.requireField);
    const forbidSourceField = toUpper(raw.forbidSourceField || raw.excludeSourceField || raw.sourceFieldNot || raw.forbidField);
    const requireSummonedField = toUpper(raw.requireSummonedField || raw.targetField || raw.requireSummonField);
    const forbidSummonedField = toUpper(raw.forbidSummonedField || raw.excludeSummonedField || raw.forbidSummonField);
    const reason = raw.reason ? String(raw.reason) : null;
    return {
      amount,
      requireSourceField,
      forbidSourceField,
      requireSummonedField,
      forbidSummonedField,
      reason,
    };
  }
  return null;
}

function getTemplate(unit) {
  if (!unit) return null;
  return CARDS[unit.tplId] || null;
}

export function applyAdjacentAllySummonDraw(state, context = {}) {
  const result = { total: 0, details: [] };
  if (!state?.board) return result;
  const { r, c, unit } = context;
  if (typeof r !== 'number' || typeof c !== 'number') return result;
  if (!unit) return result;
  const owner = unit.owner;
  if (owner == null) return result;
  const summonField = state.board?.[r]?.[c]?.element || null;

  for (const vec of Object.values(DIR_VECTORS)) {
    const nr = r + vec[0];
    const nc = c + vec[1];
    if (!inBounds(nr, nc)) continue;
    const neighbor = state.board?.[nr]?.[nc]?.unit;
    if (!neighbor || neighbor.owner !== owner) continue;
    const tpl = getTemplate(neighbor);
    if (!tpl) continue;
    const cfg = normalizeAdjacentDrawConfig(tpl.drawOnAdjacentAllySummon || tpl.drawOnAllySummonAdjacent);
    if (!cfg || cfg.amount <= 0) continue;

    const sourceField = state.board?.[nr]?.[nc]?.element || null;
    if (cfg.requireSourceField && sourceField !== cfg.requireSourceField) continue;
    if (cfg.forbidSourceField && sourceField === cfg.forbidSourceField) continue;
    if (cfg.requireSummonedField && summonField !== cfg.requireSummonedField) continue;
    if (cfg.forbidSummonedField && summonField === cfg.forbidSummonedField) continue;

    const drawn = drawCards(state, owner, cfg.amount);
    if (!drawn.drawn) continue;

    result.total += drawn.drawn;
    result.details.push({
      amount: drawn.drawn,
      cards: drawn.cards,
      element: sourceField,
      reason: cfg.reason || 'ADJACENT_ALLY_SUMMON',
      source: {
        type: 'ADJACENT_ALLY_SUMMON',
        r: nr,
        c: nc,
        tplId: tpl?.id || neighbor.tplId,
      },
    });
  }

  return result;
}

export default {
  applyAdjacentAllySummonDraw,
};

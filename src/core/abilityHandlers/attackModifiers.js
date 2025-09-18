// Обработчики модификаторов атаки, зависящих от параметров цели
import { CARDS } from '../cards.js';

function normalizeLimit(value) {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'object') {
    if (typeof value.limit === 'number') return value.limit;
    if (typeof value.maxCost === 'number') return value.maxCost;
    if (typeof value.threshold === 'number') return value.threshold;
    if (typeof value.cost === 'number') return value.cost;
    if (typeof value.max === 'number') return value.max;
  }
  return null;
}

function normalizeAmount(value) {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'object') {
    if (typeof value.amount === 'number') return value.amount;
    if (typeof value.bonus === 'number') return value.bonus;
    if (typeof value.plus === 'number') return value.plus;
    if (typeof value.value === 'number') return value.value;
  }
  return null;
}

function normalizeConfig(raw) {
  if (!raw) return null;
  if (typeof raw === 'number') {
    return { limit: raw, amount: 1 };
  }
  if (typeof raw === 'object') {
    const limit = normalizeLimit(raw);
    const amount = normalizeAmount(raw);
    if (limit == null || amount == null) return null;
    return { limit, amount };
  }
  return null;
}

function targetCost(state, hit) {
  if (!state || !hit) return null;
  const unit = state.board?.[hit.r]?.[hit.c]?.unit;
  if (!unit) return null;
  const tpl = CARDS[unit.tplId];
  if (!tpl) return null;
  const cost = tpl.cost;
  return (typeof cost === 'number' && Number.isFinite(cost)) ? cost : null;
}

export function computeTargetCostBonus(state, tpl, hits) {
  if (!tpl || !Array.isArray(hits) || !hits.length) return null;
  const cfgRaw = tpl.plusAtkVsSummonCostAtMost || tpl.plusAtkIfTargetCostLeq;
  const cfg = normalizeConfig(cfgRaw);
  if (!cfg) return null;
  const { limit, amount } = cfg;
  if (!Number.isFinite(limit) || !Number.isFinite(amount) || amount === 0) {
    return null;
  }
  const qualifies = hits.some(hit => {
    const cost = targetCost(state, hit);
    return cost != null && cost <= limit;
  });
  if (!qualifies) return null;
  return { amount, limit };
}

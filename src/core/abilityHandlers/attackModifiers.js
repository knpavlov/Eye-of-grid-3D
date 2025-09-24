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

function normalizeHpConfig(raw) {
  if (!raw) return null;
  if (typeof raw === 'number') {
    return { threshold: raw, amount: 1, useCurrent: true };
  }
  if (typeof raw === 'object') {
    const threshold = (() => {
      if (typeof raw.threshold === 'number') return raw.threshold;
      if (typeof raw.min === 'number') return raw.min;
      if (typeof raw.hp === 'number') return raw.hp;
      if (typeof raw.value === 'number') return raw.value;
      if (typeof raw.atLeast === 'number') return raw.atLeast;
      return null;
    })();
    const amount = normalizeAmount(raw);
    if (threshold == null || amount == null) return null;
    const useCurrent = raw.useCurrent != null ? !!raw.useCurrent : true;
    return { threshold, amount, useCurrent };
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

function targetHp(state, hit, useCurrent = true) {
  if (!state || !hit) return null;
  const unit = state.board?.[hit.r]?.[hit.c]?.unit;
  if (!unit) return null;
  const tpl = CARDS[unit.tplId];
  if (!tpl) return null;
  if (!useCurrent) {
    return (typeof tpl.hp === 'number' && Number.isFinite(tpl.hp)) ? tpl.hp : null;
  }
  if (typeof unit.currentHP === 'number' && Number.isFinite(unit.currentHP)) {
    return unit.currentHP;
  }
  return (typeof tpl.hp === 'number' && Number.isFinite(tpl.hp)) ? tpl.hp : null;
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

export function computeTargetHpBonus(state, tpl, hits) {
  if (!tpl || !Array.isArray(hits) || !hits.length) return null;
  const cfgRaw = tpl.plusAtkIfTargetHpAtLeast
    || tpl.plusAtkVsHpAtLeast
    || tpl.plusAtkIfTargetHp
    || tpl.plusAtkVsTargetHp;
  const cfg = normalizeHpConfig(cfgRaw);
  if (!cfg) return null;
  const { threshold, amount, useCurrent } = cfg;
  if (!Number.isFinite(threshold) || !Number.isFinite(amount) || amount === 0) return null;
  const qualifies = hits.some(hit => {
    const hp = targetHp(state, hit, useCurrent);
    return hp != null && hp >= threshold;
  });
  if (!qualifies) return null;
  return { amount, threshold };
}

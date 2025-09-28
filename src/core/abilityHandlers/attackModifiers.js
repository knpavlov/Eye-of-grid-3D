// Обработчики модификаторов атаки, зависящих от параметров цели
import { CARDS } from '../cards.js';
import { normalizeElementName } from '../utils/elements.js';

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

function normalizeOwnerToken(raw) {
  const value = typeof raw === 'string' ? raw.trim().toUpperCase() : null;
  if (value === 'ALLY' || value === 'ALLIED' || value === 'FRIENDLY' || value === 'SELF') return 'ALLY';
  if (value === 'ENEMY' || value === 'OPPONENT' || value === 'FOE') return 'ENEMY';
  if (value === 'ANY' || value === 'BOTH') return 'ANY';
  return null;
}

function normalizeTargetMatchConfig(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const owner = normalizeOwnerToken(raw.owner || raw.side || raw.affinity);
  const element = normalizeElementName(raw.element || raw.elementType || raw.matchElement);
  if (!owner && !element) return null;
  return { owner, element };
}

function normalizeCountStrategy(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    const token = raw.trim().toUpperCase();
    if (!token) return null;
    if (token === 'NON_ELEMENT') {
      return { type: 'NON_ELEMENT', element: null };
    }
    const el = normalizeElementName(token);
    if (el) return { type: 'NON_ELEMENT', element: el };
    return null;
  }
  if (typeof raw === 'object') {
    const type = (raw.type || raw.mode || raw.count || raw.strategy || '').toUpperCase();
    if (type === 'NON_ELEMENT' || type === 'NOT_ELEMENT') {
      const element = normalizeElementName(raw.element || raw.elementType || raw.exclude);
      return { type: 'NON_ELEMENT', element };
    }
    if (!type && raw.element) {
      const element = normalizeElementName(raw.element);
      return { type: 'NON_ELEMENT', element };
    }
  }
  return null;
}

function normalizeTargetCountAttackConfig(raw, tpl) {
  if (!raw || typeof raw !== 'object') return null;
  const match = normalizeTargetMatchConfig(raw.match || raw.when || raw.if || raw.target);
  const count = normalizeCountStrategy(raw.count || raw.counter || raw.measure);
  const baseValue = Number.isFinite(raw.baseValue)
    ? Math.floor(raw.baseValue)
    : Number.isFinite(raw.base)
      ? Math.floor(raw.base)
      : (Number.isFinite(tpl?.atk) ? tpl.atk : 0);
  const amountPer = Number.isFinite(raw.amountPer)
    ? Math.floor(raw.amountPer)
    : Number.isFinite(raw.per)
      ? Math.floor(raw.per)
      : 1;
  const log = typeof raw.log === 'string' ? raw.log : null;
  if (!count) return null;
  return { match, count, baseValue, amountPer, log };
}

function formatCountAttackLog(template, data) {
  if (!template) return null;
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const lower = key.toLowerCase();
    if (lower === 'targetvalue' || lower === 'value') return String(data.targetValue ?? '');
    if (lower === 'count') return String(data.count ?? '');
    return match;
  });
}

function isUnitAlive(unit, tpl) {
  if (!unit || !tpl) return false;
  if (typeof unit.currentHP === 'number') return unit.currentHP > 0;
  if (typeof tpl.hp === 'number') return tpl.hp > 0;
  return true;
}

function evaluateCountConfig(state, cfg, opts = {}) {
  if (!cfg || !state?.board) return 0;
  if (cfg.type === 'NON_ELEMENT') {
    const excludeElement = cfg.element || null;
    let total = 0;
    for (let r = 0; r < state.board.length; r += 1) {
      const row = state.board[r];
      if (!Array.isArray(row)) continue;
      for (let c = 0; c < row.length; c += 1) {
        const unit = row[c]?.unit;
        if (!unit) continue;
        if (opts.exclude && r === opts.exclude.r && c === opts.exclude.c) continue;
        const tpl = CARDS[unit.tplId];
        if (!tpl || !isUnitAlive(unit, tpl)) continue;
        const el = normalizeElementName(tpl.element);
        if (excludeElement && el === excludeElement) continue;
        total += 1;
      }
    }
    return total;
  }
  return 0;
}

function matchTargetCondition(state, hit, cfg, sourceOwner) {
  if (!cfg) return true;
  const unit = state.board?.[hit.r]?.[hit.c]?.unit;
  if (!unit) return false;
  const tpl = CARDS[unit.tplId];
  if (!tpl || !isUnitAlive(unit, tpl)) return false;
  if (cfg.owner === 'ALLY' && sourceOwner != null && unit.owner !== sourceOwner) return false;
  if (cfg.owner === 'ENEMY' && sourceOwner != null && unit.owner === sourceOwner) return false;
  if (cfg.element) {
    const el = normalizeElementName(tpl.element);
    if (el !== cfg.element) return false;
  }
  return true;
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

export function computeTargetCountAttack(state, tpl, hits, opts = {}) {
  if (!tpl || !tpl.targetCountAttack || !Array.isArray(hits) || !hits.length) return null;
  const cfg = normalizeTargetCountAttackConfig(tpl.targetCountAttack, tpl);
  if (!cfg) return null;
  const owner = opts.owner ?? state?.board?.[opts.r]?.[opts.c]?.unit?.owner ?? null;
  const match = hits.some(hit => matchTargetCondition(state, hit, cfg.match, owner));
  if (!match) return null;
  const count = evaluateCountConfig(state, cfg.count, { exclude: opts.exclude });
  const total = cfg.baseValue + cfg.amountPer * count;
  const log = formatCountAttackLog(cfg.log, { targetValue: total, count });
  return {
    attackValue: total,
    count,
    targetValue: total,
    log,
  };
}

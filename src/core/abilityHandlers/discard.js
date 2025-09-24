// Обработчики эффектов, связанных со сбросом карт (чистая логика)
import { CARDS } from '../cards.js';

function ensureQueue(state) {
  if (!state) return [];
  if (!Array.isArray(state.pendingDiscardRequests)) {
    state.pendingDiscardRequests = [];
  }
  return state.pendingDiscardRequests;
}

function nextId(state) {
  if (!state) return Date.now?.() ?? Math.floor(Math.random() * 1e9);
  const seq = Number.isFinite(state.__discardSeq) ? Number(state.__discardSeq) : 1;
  state.__discardSeq = seq + 1;
  return seq;
}

function normalizeElement(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.trim().toUpperCase() || null;
  return String(value).trim().toUpperCase() || null;
}

function countFieldsWithElement(state, element) {
  if (!state?.board || !element) return 0;
  let count = 0;
  for (let r = 0; r < state.board.length; r += 1) {
    const row = state.board[r];
    if (!Array.isArray(row)) continue;
    for (let c = 0; c < row.length; c += 1) {
      if (row[c]?.element === element) count += 1;
    }
  }
  return count;
}

function computeAmount(state, cfg) {
  if (typeof cfg === 'number') {
    return Math.max(0, Math.floor(cfg));
  }
  if (!cfg) return 0;
  if (typeof cfg === 'object') {
    if (cfg.type === 'FIELD_COUNT' || cfg.fieldCount || cfg.element || cfg.field) {
      const element = normalizeElement(cfg.element || cfg.field || cfg.fieldCount);
      if (!element) return 0;
      return countFieldsWithElement(state, element);
    }
    if (typeof cfg.value === 'number') {
      return Math.max(0, Math.floor(cfg.value));
    }
  }
  return 0;
}

function matchesCondition(condition, death) {
  if (!condition) return true;
  const el = normalizeElement(death?.fieldElement);
  if (condition.fieldElement) {
    const required = normalizeElement(condition.fieldElement);
    if (required && el !== required) return false;
  }
  if (condition.fieldElementNot) {
    const forbidden = normalizeElement(condition.fieldElementNot);
    if (forbidden && el === forbidden) return false;
  }
  return true;
}

function resolveTarget(ruleTarget, owner) {
  const target = typeof ruleTarget === 'string' ? ruleTarget.toUpperCase() : ruleTarget;
  if (target === 'OWNER') return owner;
  if (target === 'OPPONENT' || target == null) {
    if (owner == null) return null;
    if (owner === 0) return 1;
    if (owner === 1) return 0;
    return owner === 0 ? 1 : 0;
  }
  if (typeof target === 'number') return target;
  return null;
}

function formatCardCount(amount) {
  const abs = Math.abs(amount);
  if (abs === 1) return '1 карту';
  if (abs >= 2 && abs <= 4) return `${abs} карты`;
  return `${abs} карт`;
}

function queueDiscardRequest(state, payload = {}) {
  const entry = {
    id: payload.id ?? nextId(state),
    target: payload.target ?? null,
    amount: Math.max(0, Math.floor(payload.amount ?? 0)),
    source: {
      tplId: payload.source?.tplId ?? null,
      name: payload.source?.name ?? null,
      owner: payload.source?.owner ?? null,
      cause: payload.source?.cause ?? null,
      fieldElement: payload.source?.fieldElement ?? null,
      reason: payload.source?.reason ?? null,
    },
    createdAt: Date.now?.() ?? null,
  };
  if (entry.amount <= 0 || entry.target == null) return null;
  const queue = ensureQueue(state);
  queue.push(entry);
  return entry;
}

function applyDeathRules(state, death, tpl, result) {
  const rules = Array.isArray(tpl?.deathDiscardRules)
    ? tpl.deathDiscardRules
    : tpl?.deathDiscardRules ? [tpl.deathDiscardRules] : [];
  if (!rules.length) return;
  for (const rule of rules) {
    if (!rule) continue;
    if (!matchesCondition(rule.condition, death)) continue;
    const amount = computeAmount(state, rule.amount ?? 1);
    if (amount <= 0) continue;
    const target = resolveTarget(rule.target, death.owner);
    if (target == null) continue;
    const entry = queueDiscardRequest(state, {
      target,
      amount,
      source: {
        tplId: tpl.id,
        name: tpl.name,
        owner: death.owner,
        cause: 'CARD_DESTROYED',
        fieldElement: death.fieldElement ?? null,
        reason: rule.reason ?? 'DEATH_RULE',
      },
    });
    if (entry) {
      result.requests.push(entry);
      const name = tpl.name || 'Существо';
      result.logLines.push(`${name}: соперник должен сбросить ${formatCardCount(amount)}.`);
    }
  }
}

function normalizeAllyDiscardCfg(raw) {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw.map(normalizeAllyDiscardCfg).find(Boolean) || null;
  const cfg = { ...raw };
  cfg.target = cfg.target ?? 'OPPONENT';
  cfg.amount = cfg.amount ?? 1;
  if (cfg.whileOnElement) cfg.whileOnElement = normalizeElement(cfg.whileOnElement);
  return cfg;
}

function applyAllyDeathRules(state, deaths, result) {
  if (!Array.isArray(deaths) || !deaths.length) return;
  if (!state?.board) return;
  const byOwner = new Map();
  for (const death of deaths) {
    if (death?.owner == null) continue;
    if (!byOwner.has(death.owner)) byOwner.set(death.owner, []);
    byOwner.get(death.owner).push(death);
  }
  for (let r = 0; r < state.board.length; r += 1) {
    const row = state.board[r];
    if (!Array.isArray(row)) continue;
    for (let c = 0; c < row.length; c += 1) {
      const cell = row[c];
      const unit = cell?.unit;
      if (!unit) continue;
      const tpl = CARDS[unit.tplId];
      const cfg = normalizeAllyDiscardCfg(tpl?.allyDeathDiscard);
      if (!cfg) continue;
      const deathsForOwner = byOwner.get(unit.owner) || [];
      if (!deathsForOwner.length) continue;
      if (cfg.whileOnElement) {
        const cellElement = normalizeElement(cell?.element);
        if (cellElement !== cfg.whileOnElement) continue;
      }
      const perDeath = Math.max(0, Math.floor(cfg.amount ?? 1));
      if (perDeath <= 0) continue;
      const total = perDeath * deathsForOwner.length;
      if (total <= 0) continue;
      const target = resolveTarget(cfg.target, unit.owner);
      if (target == null) continue;
      const entry = queueDiscardRequest(state, {
        target,
        amount: total,
        source: {
          tplId: tpl.id,
          name: tpl.name,
          owner: unit.owner,
          cause: 'ALLY_DEATH',
          fieldElement: normalizeElement(cell?.element),
          reason: cfg.reason ?? 'ALLY_DEATH_TRIGGER',
        },
      });
      if (entry) {
        result.requests.push(entry);
        const name = tpl.name || 'Существо';
        result.logLines.push(`${name}: соперник должен сбросить ${formatCardCount(total)} (гибель союзников).`);
      }
    }
  }
}

export function applyDeathDiscardEffects(state, deaths = []) {
  const result = { requests: [], logLines: [] };
  if (!Array.isArray(deaths) || !deaths.length) return result;
  for (const death of deaths) {
    if (!death) continue;
    const tpl = CARDS[death.tplId];
    if (!tpl) continue;
    applyDeathRules(state, death, tpl, result);
  }
  applyAllyDeathRules(state, deaths, result);
  return result;
}

export default {
  applyDeathDiscardEffects,
};

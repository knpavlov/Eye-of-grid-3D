// Дополнительные бонусы к атаке в зависимости от совпадения цели и количества существ на поле
// Логика полностью отделена от визуального слоя
import { CARDS } from '../cards.js';
import { normalizeElementName } from '../utils/elements.js';

function toArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizeTarget(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    return normalizeTarget({ element: raw });
  }
  const ownerToken = typeof raw.owner === 'string' ? raw.owner.trim().toUpperCase() : null;
  let owner = 'ANY';
  if (ownerToken === 'ALLY' || ownerToken === 'FRIENDLY' || ownerToken === 'SELF') owner = 'ALLY';
  if (ownerToken === 'ENEMY' || ownerToken === 'OPPONENT' || ownerToken === 'FOE') owner = 'ENEMY';
  const element = normalizeElementName(raw.element || raw.targetElement || raw.elementType);
  return { owner, element };
}

function normalizeCount(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    const token = raw.trim().toUpperCase();
    if (token.startsWith('NON_')) {
      return {
        type: 'NON_ELEMENT',
        element: normalizeElementName(token.replace(/^NON_/, '')),
        amountPer: 1,
        baseValue: null,
      };
    }
    return {
      type: 'ELEMENT',
      element: normalizeElementName(token),
      amountPer: 1,
      baseValue: null,
    };
  }
  const typeToken = typeof raw.type === 'string' ? raw.type.trim().toUpperCase() : null;
  let type = 'ELEMENT';
  if (typeToken === 'NON_ELEMENT' || typeToken === 'NOT_ELEMENT') {
    type = 'NON_ELEMENT';
  }
  const element = normalizeElementName(raw.element || raw.match || raw.filter);
  const baseRaw = raw.baseValue ?? raw.base ?? raw.start ?? null;
  const perRaw = raw.amountPer ?? raw.per ?? raw.multiplier ?? raw.scale ?? 1;
  const baseValue = baseRaw != null && Number.isFinite(Number(baseRaw)) ? Number(baseRaw) : null;
  const amountPer = Number.isFinite(Number(perRaw)) ? Number(perRaw) : 1;
  return { type, element, amountPer, baseValue };
}

function normalizeConfig(raw) {
  if (!raw) return null;
  if (typeof raw !== 'object') return null;
  const match = normalizeTarget(raw.match || raw.target || { element: raw.element, owner: raw.owner });
  if (!match) return null;
  const countCfg = normalizeCount(raw.count || raw.counter || raw.measure);
  if (!countCfg) return null;
  const baseValue = raw.baseValue ?? raw.base ?? countCfg.baseValue ?? null;
  const per = raw.amountPer ?? raw.per ?? raw.multiplier ?? countCfg.amountPer ?? 1;
  return {
    match,
    count: { ...countCfg, baseValue },
    amountPer: Number.isFinite(Number(per)) ? Number(per) : 1,
    log: typeof raw.log === 'string' ? raw.log : null,
  };
}

function collectConfigs(raw) {
  const result = [];
  for (const entry of toArray(raw)) {
    const cfg = normalizeConfig(entry);
    if (cfg) result.push(cfg);
  }
  return result;
}

function matchTargetUnit(unit, tpl, cfg, attackerOwner) {
  if (!unit || !tpl || !cfg) return false;
  if (cfg.owner === 'ALLY' && unit.owner !== attackerOwner) return false;
  if (cfg.owner === 'ENEMY' && unit.owner === attackerOwner) return false;
  if (cfg.element && normalizeElementName(tpl.element) !== cfg.element) return false;
  return true;
}

function countUnitsByConfig(state, cfg) {
  if (!state?.board) return 0;
  let total = 0;
  for (let r = 0; r < state.board.length; r += 1) {
    const row = state.board[r];
    if (!Array.isArray(row)) continue;
    for (let c = 0; c < row.length; c += 1) {
      const unit = row[c]?.unit;
      if (!unit) continue;
      const tpl = CARDS[unit.tplId];
      if (!tpl) continue;
      const element = normalizeElementName(tpl.element);
      if (cfg.type === 'NON_ELEMENT') {
        if (!cfg.element || element !== cfg.element) total += 1;
      } else if (!cfg.element || element === cfg.element) {
        total += 1;
      }
    }
  }
  return total;
}

function formatLog(template, data) {
  if (!template) return null;
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const lower = key.toLowerCase();
    if (lower === 'amount') return String(data.amount ?? '');
    if (lower === 'count') return String(data.count ?? '');
    if (lower === 'value' || lower === 'target') return String(data.targetValue ?? '');
    if (lower === 'name') return data.name ?? '';
    return match;
  });
}

export function computeTargetCountAttackBonuses(state, attackerInfo, hits, tpl) {
  if (!tpl || !Array.isArray(hits) || !hits.length) return [];
  const configs = collectConfigs(tpl.targetCountAttack);
  if (!configs.length) return [];
  const owner = attackerInfo?.unit?.owner ?? null;
  const baseAtk = Number.isFinite(tpl.atk) ? tpl.atk : 0;
  const results = [];

  for (const cfg of configs) {
    const triggered = hits.some(hit => {
      const unit = state?.board?.[hit.r]?.[hit.c]?.unit;
      if (!unit) return false;
      const targetTpl = CARDS[unit.tplId];
      return matchTargetUnit(unit, targetTpl, cfg.match, owner);
    });
    if (!triggered) continue;
    const count = countUnitsByConfig(state, cfg.count);
    const baseValue = cfg.count.baseValue != null ? Number(cfg.count.baseValue) : baseAtk;
    const targetValue = baseValue + cfg.amountPer * count;
    const amount = targetValue - baseAtk;
    if (amount === 0) continue;
    results.push({
      amount,
      targetValue,
      count,
      log: formatLog(cfg.log, {
        amount,
        count,
        targetValue,
        name: tpl.name || tpl.id || 'Существо',
      }),
    });
  }

  return results;
}

export default { computeTargetCountAttackBonuses };

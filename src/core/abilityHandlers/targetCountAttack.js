// Поддержка эффектов, изменяющих атаку в зависимости от цели и количества существ
// Чистая игровая логика без зависимостей от визуального слоя
import { CARDS } from '../cards.js';
import { normalizeElementName } from '../utils/elements.js';

function normalizeOwnerToken(raw) {
  if (typeof raw !== 'string') return null;
  const token = raw.trim().toUpperCase();
  if (token === 'ALLY' || token === 'ALLIED' || token === 'FRIENDLY' || token === 'SELF') return 'ALLY';
  if (token === 'ENEMY' || token === 'OPPONENT' || token === 'FOE') return 'ENEMY';
  if (token === 'ANY' || token === 'BOTH') return 'ANY';
  return null;
}

function normalizeMatchConfig(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const owner = normalizeOwnerToken(raw.owner || raw.by || raw.side);
  const element = normalizeElementName(raw.element || raw.targetElement);
  const fieldElement = normalizeElementName(raw.fieldElement || raw.field || raw.requireFieldElement);
  return { owner, element, fieldElement };
}

function normalizeCountConfig(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    const token = raw.trim().toUpperCase();
    if (token.startsWith('NON_')) {
      const el = normalizeElementName(token.replace(/^NON_/, ''));
      if (!el) return null;
      return { type: 'NON_ELEMENT', element: el };
    }
    return null;
  }
  if (typeof raw === 'object') {
    const type = (raw.type || raw.mode || '').toString().toUpperCase();
    if (type === 'NON_ELEMENT' || type === 'NON_ELEMENTAL') {
      const element = normalizeElementName(raw.element || raw.reference || raw.exclude);
      if (!element) return null;
      return { type: 'NON_ELEMENT', element };
    }
  }
  return null;
}

function normalizeTargetCountConfig(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const match = normalizeMatchConfig(raw.match || raw.condition || raw.when);
  const count = normalizeCountConfig(raw.count || raw.counter || raw.by || raw.source);
  if (!count) return null;
  const baseValue = Number.isFinite(raw.baseValue)
    ? Number(raw.baseValue)
    : Number.isFinite(raw.base)
      ? Number(raw.base)
      : Number.isFinite(raw.value)
        ? Number(raw.value)
        : 0;
  const amountPer = Number.isFinite(raw.amountPer)
    ? Number(raw.amountPer)
    : Number.isFinite(raw.per)
      ? Number(raw.per)
      : Number.isFinite(raw.factor)
        ? Number(raw.factor)
        : 1;
  const log = typeof raw.log === 'string' ? raw.log : null;
  return { match, count, baseValue, amountPer, log };
}

function targetMatchesCondition(state, targetPos, cfg, attackerOwner) {
  if (!cfg) return true;
  const cell = state?.board?.[targetPos.r]?.[targetPos.c];
  const unit = cell?.unit;
  if (!unit) return false;
  const tpl = CARDS[unit.tplId];
  if (!tpl) return false;
  if (cfg.owner === 'ALLY' && attackerOwner != null && unit.owner !== attackerOwner) return false;
  if (cfg.owner === 'ENEMY' && attackerOwner != null && unit.owner === attackerOwner) return false;
  if (cfg.element) {
    const elem = normalizeElementName(tpl.element);
    if (!elem || elem !== cfg.element) return false;
  }
  if (cfg.fieldElement) {
    const cellElement = normalizeElementName(cell?.element);
    if (!cellElement || cellElement !== cfg.fieldElement) return false;
  }
  return true;
}

function countUnitsByConfig(state, cfg) {
  if (!state?.board || !cfg) return 0;
  if (cfg.type === 'NON_ELEMENT') {
    const element = cfg.element;
    let total = 0;
    for (let r = 0; r < state.board.length; r += 1) {
      const row = state.board[r];
      if (!Array.isArray(row)) continue;
      for (let c = 0; c < row.length; c += 1) {
        const unit = row[c]?.unit;
        if (!unit) continue;
        const tpl = CARDS[unit.tplId];
        if (!tpl) continue;
        const elem = normalizeElementName(tpl.element);
        if (!elem || elem !== element) {
          total += 1;
        }
      }
    }
    return total;
  }
  return 0;
}

function formatLog(template, data) {
  if (!template) return null;
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const lower = key.toLowerCase();
    if (lower === 'count') return String(data.count ?? '');
    if (lower === 'targetvalue' || lower === 'value') return String(data.targetValue ?? '');
    if (lower === 'amount') return String(data.amount ?? '');
    if (lower === 'name') return data.name ?? '';
    return match;
  });
}

export function computeTargetCountAttack(state, attackerPos, targetPos, tpl, opts = {}) {
  if (!tpl?.targetCountAttack) return null;
  const cfg = normalizeTargetCountConfig(tpl.targetCountAttack);
  if (!cfg) return null;
  if (!state || !attackerPos || !targetPos) return null;
  const attackerOwner = opts.attackerUnit?.owner
    ?? state.board?.[attackerPos.r]?.[attackerPos.c]?.unit?.owner
    ?? null;
  if (!targetMatchesCondition(state, targetPos, cfg.match, attackerOwner)) {
    return null;
  }
  const count = countUnitsByConfig(state, cfg.count);
  const targetValue = cfg.baseValue + cfg.amountPer * count;
  if (!Number.isFinite(targetValue)) return null;
  const baseAtk = Number.isFinite(tpl.atk) ? tpl.atk : 0;
  const amount = targetValue - baseAtk;
  const log = formatLog(cfg.log, {
    count,
    targetValue,
    amount,
    name: tpl.name || tpl.id || 'Существо',
  });
  return { targetValue, amount, count, log };
}

export default { computeTargetCountAttack };

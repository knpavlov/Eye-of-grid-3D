// Модуль вычисления динамических бонусов к атаке (чистая логика)
// Здесь нет зависимостей от визуального слоя, чтобы упростить миграцию на Unity
import { CARDS } from '../cards.js';
import { countUnits } from '../board.js';
import { normalizeElementName } from '../utils/elements.js';

function isSamePosition(a, b) {
  return a && b && a.r === b.r && a.c === b.c;
}

function unitMatchesOwner(unit, ownerMode, ownerId) {
  if (!unit) return false;
  if (ownerMode === 'ANY' || ownerMode == null) return true;
  if (ownerId == null) return false;
  if (ownerMode === 'ALLY') return unit.owner === ownerId;
  if (ownerMode === 'ENEMY') return unit.owner !== ownerId;
  return true;
}

function countCreaturesByElement(state, element, opts = {}) {
  if (!state?.board || !element) return 0;
  const includeSelf = !!opts.includeSelf;
  const ownerMode = opts.ownerMode || 'ANY';
  const origin = opts.origin || null;
  let count = 0;
  for (let r = 0; r < state.board.length; r += 1) {
    const row = state.board[r];
    if (!Array.isArray(row)) continue;
    for (let c = 0; c < row.length; c += 1) {
      const cell = row[c];
      const unit = cell?.unit;
      if (!unit) continue;
      if (!includeSelf && origin && isSamePosition(origin, { r, c })) continue;
      if (!unitMatchesOwner(unit, ownerMode, opts.ownerId)) continue;
      const tpl = CARDS[unit.tplId];
      if (!tpl) continue;
      if (normalizeElementName(tpl.element) !== element) continue;
      count += 1;
    }
  }
  return count;
}

function parseElementScope(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    const element = normalizeElementName(raw);
    if (!element) return null;
    return { element, ownerMode: 'ANY', includeSelf: false };
  }
  if (typeof raw === 'object') {
    const element = normalizeElementName(raw.element || raw.type || raw.kind || raw.elementType);
    if (!element) return null;
    const includeSelf = !!raw.includeSelf;
    const owner = String(raw.owner || raw.side || 'ANY').toUpperCase();
    const ownerMode = owner === 'ALLY' || owner === 'ENEMY' ? owner : 'ANY';
    return {
      element,
      includeSelf,
      ownerMode,
    };
  }
  return null;
}

function normalizeConfig(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    if (raw === 'OTHERS_ON_BOARD') {
      return { type: 'OTHERS_ON_BOARD' };
    }
    if (raw.endsWith('_CREATURES')) {
      const code = raw.slice(0, -'_CREATURES'.length);
      const element = normalizeElementName(code);
      if (!element) return null;
      return { type: 'ELEMENT_CREATURES', element, includeSelf: false, ownerMode: 'ANY' };
    }
    const parts = raw.split(':');
    if (parts[0] === 'ELEMENT' && parts[1]) {
      const element = normalizeElementName(parts[1]);
      if (!element) return null;
      return { type: 'ELEMENT_CREATURES', element, includeSelf: parts[2] === 'INCLUDE_SELF', ownerMode: 'ANY' };
    }
    return null;
  }
  if (typeof raw === 'object') {
    const type = String(raw.type || raw.kind || raw.mode || '').toUpperCase();
    if (type === 'OTHERS_ON_BOARD') {
      return { type: 'OTHERS_ON_BOARD' };
    }
    if (type === 'TOTAL_UNITS' || raw.allUnits) {
      return { type: 'OTHERS_ON_BOARD', includeSelf: !!raw.includeSelf };
    }
    if (type === 'ELEMENT_CREATURES' || raw.element) {
      const scope = parseElementScope(raw.scope || raw.element || raw);
      if (!scope) return null;
      return { type: 'ELEMENT_CREATURES', ...scope };
    }
  }
  return null;
}

export function computeDynamicAttackBonus(state, r, c, tpl, opts = {}) {
  if (!tpl) return null;
  const cfg = normalizeConfig(tpl.dynamicAtk);
  if (!cfg) return null;
  if (cfg.type === 'OTHERS_ON_BOARD') {
    const total = Math.max(0, countUnits(state) - (cfg.includeSelf ? 0 : 1));
    if (total <= 0) return null;
    return {
      amount: total,
      reason: { type: 'OTHERS_ON_BOARD' },
    };
  }
  if (cfg.type === 'ELEMENT_CREATURES') {
    const element = cfg.element;
    if (!element) return null;
    const ownerMode = cfg.ownerMode || 'ANY';
    const includeSelf = !!cfg.includeSelf;
    const ownerId = opts.unit?.owner ?? opts.owner ?? null;
    const origin = { r, c };
    const count = countCreaturesByElement(state, element, { ownerMode, includeSelf, ownerId, origin });
    if (count <= 0) return null;
    return {
      amount: count,
      reason: { type: 'ELEMENT_CREATURES', element, ownerMode, includeSelf },
    };
  }
  return null;
}

export default { computeDynamicAttackBonus };

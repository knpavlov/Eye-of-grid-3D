// Модуль для расчёта аур, модифицирующих атаку существ
// Логика отделена от визуальной части для повторного использования при переносе движка
import { CARDS } from '../cards.js';

const BOARD_SIZE = 3;
const ADJACENT_DIRS = [
  { dr: -1, dc: 0 },
  { dr: 1, dc: 0 },
  { dr: 0, dc: -1 },
  { dr: 0, dc: 1 },
];

function inBounds(r, c) {
  return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;
}

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizeElement(value) {
  if (!value) return null;
  return String(value).toUpperCase();
}

function normalizeAmount(value, fallbackSign = 1) {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'object') {
    if (typeof value.amount === 'number') return value.amount;
    if (typeof value.value === 'number') return value.value;
    if (typeof value.plus === 'number') return value.plus;
    if (typeof value.delta === 'number') return value.delta;
  }
  if (value === true) return 1 * fallbackSign;
  if (value === false) return 0;
  return null;
}

function normalizeAttackAuraEffects(tpl) {
  if (!tpl) return [];
  const effects = [];
  const direct = toArray(tpl.attackAuraEffects);
  for (const raw of direct) {
    if (!raw) continue;
    const amount = normalizeAmount(raw.amount ?? raw.plus ?? raw.value ?? raw.delta ?? raw);
    if (!Number.isFinite(amount) || amount === 0) continue;
    const target = (raw.target || raw.scope || raw.apply)?.toString().toUpperCase() || 'UNKNOWN';
    const element = normalizeElement(raw.element || raw.field || raw.elementType);
    const requireSourceElement = normalizeElement(raw.requireSourceElement || raw.sourceElement || raw.onElement);
    const includeSelf = raw.includeSelf === true;
    effects.push({ amount, target, element, requireSourceElement, includeSelf });
  }

  if (tpl.enemyAtkPenaltyOnElement) {
    const cfg = tpl.enemyAtkPenaltyOnElement;
    const amount = normalizeAmount(cfg.amount ?? cfg.value ?? cfg.minus ?? cfg, -1);
    const element = normalizeElement(cfg.element || cfg.field);
    if (Number.isFinite(amount) && amount !== 0 && element) {
      effects.push({
        amount,
        target: 'ALL_ENEMIES_ON_ELEMENT',
        element,
        requireSourceElement: normalizeElement(cfg.requireSourceElement),
        includeSelf: false,
      });
    }
  }

  if (tpl.allyAtkBonusAdjacentOnElement) {
    const cfg = tpl.allyAtkBonusAdjacentOnElement;
    const amount = normalizeAmount(cfg.amount ?? cfg.value ?? cfg.plus ?? cfg);
    if (Number.isFinite(amount) && amount !== 0) {
      effects.push({
        amount,
        target: 'ADJACENT_ALLIES',
        element: normalizeElement(cfg.element || cfg.field),
        requireSourceElement: normalizeElement(cfg.requireSourceElement || cfg.sourceElement || cfg.onElement),
        includeSelf: cfg.includeSelf === true,
      });
    }
  }

  return effects;
}

function providerAlive(unit, tpl) {
  if (!unit || !tpl) return false;
  const hp = typeof unit.currentHP === 'number' ? unit.currentHP : tpl.hp;
  return (hp || 0) > 0;
}

function cellElement(state, r, c) {
  return state?.board?.[r]?.[c]?.element || null;
}

function matchesTarget(effect, state, target, targetTpl, targetOwner, provider) {
  const { target: scope, element, amount } = effect;
  if (!Number.isFinite(amount) || amount === 0) return false;
  const targetCell = state?.board?.[target.r]?.[target.c];
  if (!targetCell) return false;
  const targetUnit = targetCell.unit;
  if (!targetUnit) return false;
  const providerUnit = provider.unit;
  const providerTpl = provider.tpl;
  if (!providerUnit || !providerTpl) return false;
  const providerOwner = providerUnit.owner;
  const sameOwner = providerOwner === targetOwner;

  if (effect.element) {
    const cellEl = cellElement(state, target.r, target.c);
    if (cellEl !== effect.element) return false;
  }

  switch (scope) {
    case 'ADJACENT_ALLIES':
      if (!sameOwner) return false;
      if (!effect.includeSelf && provider.r === target.r && provider.c === target.c) return false;
      for (const dir of ADJACENT_DIRS) {
        if (provider.r + dir.dr === target.r && provider.c + dir.dc === target.c) {
          return true;
        }
      }
      return false;
    case 'ADJACENT_ENEMIES':
      if (sameOwner) return false;
      if (provider.r === target.r && provider.c === target.c) return false;
      for (const dir of ADJACENT_DIRS) {
        if (provider.r + dir.dr === target.r && provider.c + dir.dc === target.c) {
          return true;
        }
      }
      return false;
    case 'ALL_ENEMIES_ON_ELEMENT':
      if (sameOwner) return false;
      return true;
    default:
      return false;
  }
}

function effectActive(effect, providerCellElement) {
  if (!effect.requireSourceElement) return true;
  return providerCellElement === effect.requireSourceElement;
}

export function computeAttackAuraBonus(state, r, c, opts = {}) {
  if (!state?.board) return 0;
  const targetCell = state.board?.[r]?.[c];
  const targetUnit = opts.unit || targetCell?.unit;
  if (!targetUnit) return 0;
  const targetTpl = CARDS[targetUnit.tplId];
  if (!targetTpl) return 0;
  const targetOwner = opts.owner != null ? opts.owner : targetUnit.owner;
  let total = 0;

  for (let rr = 0; rr < BOARD_SIZE; rr++) {
    for (let cc = 0; cc < BOARD_SIZE; cc++) {
      const auraCell = state.board?.[rr]?.[cc];
      const auraUnit = auraCell?.unit;
      if (!auraUnit) continue;
      const auraTpl = CARDS[auraUnit.tplId];
      if (!providerAlive(auraUnit, auraTpl)) continue;
      const effects = normalizeAttackAuraEffects(auraTpl);
      if (!effects.length) continue;
      const providerElement = auraCell?.element || null;
      const providerInfo = { r: rr, c: cc, unit: auraUnit, tpl: auraTpl };
      for (const effect of effects) {
        if (!effectActive(effect, providerElement)) continue;
        if (matchesTarget(effect, state, { r, c }, targetTpl, targetOwner, providerInfo)) {
          total += effect.amount;
        }
      }
    }
  }

  return total;
}

export function hasAttackAura(tpl) {
  if (!tpl) return false;
  if (tpl.attackAuraEffects) return true;
  if (tpl.enemyAtkPenaltyOnElement) return true;
  if (tpl.allyAtkBonusAdjacentOnElement) return true;
  return false;
}

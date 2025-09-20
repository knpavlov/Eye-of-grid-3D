// Ауры, модифицирующие параметры существ (атака, стоимость активации и т.п.)
// Логика вынесена отдельно от визуала для последующей миграции на движок
import { CARDS } from '../cards.js';

const BOARD_SIZE = 3;

function clampNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function upper(value) {
  return typeof value === 'string' && value ? value.toUpperCase() : null;
}

function normalizeScope(raw) {
  const scope = upper(raw) || 'ADJACENT';
  if (scope === 'BOARD' || scope === 'GLOBAL' || scope === 'ALL') return 'BOARD';
  if (scope === 'SELF') return 'SELF';
  return 'ADJACENT';
}

function normalizeTarget(raw) {
  const target = upper(raw) || 'ENEMY';
  if (target === 'ALLY' || target === 'ALLIES' || target === 'FRIENDLY') return 'ALLY';
  if (target === 'ENEMY' || target === 'ENEMIES' || target === 'OPPONENT') return 'ENEMY';
  if (target === 'ALL') return 'ALL';
  if (target === 'SELF') return 'SELF';
  return 'ENEMY';
}

function normalizeStat(raw) {
  const stat = upper(raw);
  if (stat === 'ATK' || stat === 'ATTACK') return 'ATK';
  if (stat === 'ACTIVATION' || stat === 'AP' || stat === 'ACTION') return 'ACTIVATION';
  return null;
}

function normalizeAura(raw) {
  if (!raw) return null;
  if (typeof raw !== 'object') return null;
  const stat = normalizeStat(raw.stat || raw.type || raw.affects);
  if (!stat) return null;
  const amount = clampNumber(raw.amount ?? raw.value ?? raw.delta ?? raw.plus);
  if (!amount) return null;
  const scope = normalizeScope(raw.scope || raw.range || raw.area);
  const target = normalizeTarget(raw.target || raw.affects);
  const sourceOnElement = upper(raw.sourceOnElement || raw.sourceElement || raw.sourceField);
  const targetOnElement = upper(raw.targetOnElement || raw.targetField);
  const targetElement = upper(raw.targetElement || raw.element || raw.matchElement);
  const excludeSelf = !!(raw.excludeSelf || raw.onlyOthers || raw.othersOnly);
  return {
    stat,
    amount,
    scope,
    target,
    sourceOnElement,
    targetOnElement,
    targetElement,
    excludeSelf,
  };
}

function matchesScope(scope, sr, sc, tr, tc) {
  if (scope === 'BOARD') return true;
  if (scope === 'SELF') return sr === tr && sc === tc;
  if (scope === 'ADJACENT') {
    const dist = Math.abs(sr - tr) + Math.abs(sc - tc);
    return dist === 1;
  }
  return false;
}

function matchesRelation(target, ownerSource, ownerTarget, sr, sc, tr, tc) {
  switch (target) {
    case 'ALLY':
      return ownerSource != null && ownerTarget != null && ownerSource === ownerTarget && !(sr === tr && sc === tc);
    case 'ENEMY':
      return ownerSource != null && ownerTarget != null && ownerSource !== ownerTarget;
    case 'SELF':
      return ownerSource != null && ownerTarget != null && ownerSource === ownerTarget && sr === tr && sc === tc;
    case 'ALL':
      return true;
    default:
      return ownerSource != null && ownerTarget != null && ownerSource !== ownerTarget;
  }
}

function getCell(state, r, c) {
  if (!state?.board) return null;
  if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) return null;
  return state.board[r]?.[c] || null;
}

export function computeAuraStatModifier(state, r, c, stat, opts = {}) {
  if (!state?.board) return 0;
  const cell = getCell(state, r, c);
  const unit = opts.unit || cell?.unit;
  if (!unit) return 0;
  const tplTarget = opts.tpl || CARDS[unit.tplId];
  if (!tplTarget) return 0;
  const ownerTarget = opts.owner ?? unit.owner ?? null;
  const elementTargetField = cell?.element || null;
  let total = 0;

  for (let sr = 0; sr < BOARD_SIZE; sr++) {
    for (let sc = 0; sc < BOARD_SIZE; sc++) {
      const sourceCell = getCell(state, sr, sc);
      const sourceUnit = sourceCell?.unit;
      if (!sourceUnit) continue;
      const tplSource = CARDS[sourceUnit.tplId];
      if (!tplSource) continue;
      const auraList = Array.isArray(tplSource.auraModifiers) ? tplSource.auraModifiers : [];
      if (!auraList.length) continue;
      for (const raw of auraList) {
        const aura = normalizeAura(raw);
        if (!aura || aura.stat !== stat) continue;
        if (aura.excludeSelf && sr === r && sc === c) continue;
        if (aura.sourceOnElement && sourceCell?.element !== aura.sourceOnElement) continue;
        if (!matchesScope(aura.scope, sr, sc, r, c)) continue;
        if (!matchesRelation(aura.target, sourceUnit.owner, ownerTarget, sr, sc, r, c)) continue;
        if (aura.targetOnElement && elementTargetField !== aura.targetOnElement) continue;
        if (aura.targetElement && tplTarget?.element !== aura.targetElement) continue;
        total += aura.amount;
      }
    }
  }

  return total;
}

export function computeAuraAttackBonus(state, r, c, opts = {}) {
  return computeAuraStatModifier(state, r, c, 'ATK', opts);
}

export function computeAuraActivationDelta(state, r, c, opts = {}) {
  return computeAuraStatModifier(state, r, c, 'ACTIVATION', opts);
}

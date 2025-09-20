// Универсальный модуль для расчёта статических аур, влияющих на атаку и стоимость активации
// Логика изолирована от визуальной части для упрощения дальнейшей миграции
import { CARDS } from '../cards.js';

const inBounds = (r, c) => r >= 0 && r < 3 && c >= 0 && c < 3;

function toArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizeTarget(value) {
  if (!value) return 'ANY';
  const raw = String(value).toUpperCase();
  if (raw === 'ALLY' || raw === 'ALLIES' || raw === 'ALLIED') return 'ALLY';
  if (raw === 'ENEMY' || raw === 'ENEMIES' || raw === 'FOE' || raw === 'FOES') return 'ENEMY';
  return 'ANY';
}

function normalizeScope(value) {
  if (!value) return 'BOARD';
  const raw = String(value).toUpperCase();
  if (raw === 'ADJACENT' || raw === 'NEARBY') return 'ADJACENT';
  if (raw === 'SELF') return 'SELF';
  return 'BOARD';
}

function normalizeElement(value) {
  if (!value) return null;
  return String(value).toUpperCase();
}

function pickNumber(entry, keys) {
  for (const key of keys) {
    if (entry && typeof entry[key] === 'number' && Number.isFinite(entry[key])) {
      return entry[key];
    }
  }
  return 0;
}

function collectLegacyConfigs(tpl) {
  const list = [];
  if (tpl && tpl.enemyActivationTaxAdjacent != null) {
    const amount = typeof tpl.enemyActivationTaxAdjacent === 'number'
      ? tpl.enemyActivationTaxAdjacent
      : (typeof tpl.enemyActivationTaxAdjacent?.amount === 'number'
        ? tpl.enemyActivationTaxAdjacent.amount
        : 0);
    if (amount) {
      list.push({
        target: 'ENEMY',
        scope: 'ADJACENT',
        attack: 0,
        activation: amount,
        includeSelf: false,
        requireSourceElement: normalizeElement(tpl.enemyActivationTaxAdjacent?.requireSourceElement),
        targetFieldElement: normalizeElement(tpl.enemyActivationTaxAdjacent?.targetFieldElement),
        targetUnitElement: normalizeElement(tpl.enemyActivationTaxAdjacent?.targetUnitElement),
      });
    }
  }
  return list;
}

function normalizeAuraEntries(tpl) {
  const entries = [];
  const rawList = toArray(tpl?.auraStatAdjustments);
  for (const raw of rawList) {
    if (!raw || typeof raw !== 'object') continue;
    const target = normalizeTarget(raw.target || raw.applyTo || raw.affects);
    const scope = normalizeScope(raw.scope || raw.range || raw.area);
    const includeSelf = raw.includeSelf === true || raw.affectSelf === true || raw.allowSelf === true;
    const excludeSelf = raw.excludeSelf === true || raw.onlyOthers === true || raw.otherAllies === true;
    const attack = pickNumber(raw, ['attack', 'atk', 'attackDelta', 'plusAttack', 'addAttack', 'modifyAttack', 'deltaAtk']);
    const activation = pickNumber(raw, [
      'activation', 'activationDelta', 'activationCost', 'cost', 'ap', 'plusActivation', 'addActivation', 'modifyActivation',
    ]);
    const requireSourceElement = normalizeElement(raw.requireSourceElement || raw.sourceElement || raw.onField);
    const targetFieldElement = normalizeElement(raw.targetFieldElement || raw.field || raw.targetField);
    const targetUnitElement = normalizeElement(raw.targetUnitElement || raw.targetElement || raw.targetCreatureElement);
    if (!attack && !activation) continue;
    entries.push({
      target,
      scope,
      includeSelf: includeSelf && !excludeSelf,
      excludeSelf,
      attack,
      activation,
      requireSourceElement,
      targetFieldElement,
      targetUnitElement,
    });
  }
  entries.push(...collectLegacyConfigs(tpl));
  return entries;
}

function collectAuraConfigs(tpl) {
  if (!tpl) return [];
  return normalizeAuraEntries(tpl);
}

function appliesByRelation(target, sourceOwner, targetOwner) {
  if (target === 'ALLY') {
    if (targetOwner == null) return false;
    return sourceOwner === targetOwner;
  }
  if (target === 'ENEMY') {
    if (targetOwner == null) return false;
    return sourceOwner !== targetOwner;
  }
  return true;
}

function inScope(scope, sr, sc, tr, tc) {
  if (scope === 'SELF') {
    return sr === tr && sc === tc;
  }
  if (scope === 'ADJACENT') {
    return Math.abs(sr - tr) + Math.abs(sc - tc) === 1;
  }
  return true;
}

export function computeAuraStatAdjustments(state, r, c, opts = {}) {
  if (!state?.board) return { attack: 0, activation: 0 };
  const targetUnit = opts.unit || state.board?.[r]?.[c]?.unit;
  if (!targetUnit) return { attack: 0, activation: 0 };
  const targetOwner = opts.owner ?? targetUnit.owner ?? null;
  const targetTpl = CARDS[targetUnit.tplId] || null;
  const targetUnitElement = targetTpl?.element ? String(targetTpl.element).toUpperCase() : null;
  const targetFieldElement = state.board?.[r]?.[c]?.element ? String(state.board[r][c].element).toUpperCase() : null;

  let totalAttack = 0;
  let totalActivation = 0;

  for (let sr = 0; sr < state.board.length; sr++) {
    for (let sc = 0; sc < state.board[sr].length; sc++) {
      if (!inBounds(sr, sc)) continue;
      if (sr === undefined || sc === undefined) continue;
      const sourceCell = state.board[sr][sc];
      const auraUnit = sourceCell?.unit;
      if (!auraUnit) continue;
      const tpl = CARDS[auraUnit.tplId];
      if (!tpl) continue;
      const alive = (auraUnit.currentHP ?? tpl.hp ?? 0) > 0;
      if (!alive) continue;
      const configs = collectAuraConfigs(tpl);
      if (!configs.length) continue;
      const sourceFieldElement = sourceCell?.element ? String(sourceCell.element).toUpperCase() : null;
      const sourceOwner = auraUnit.owner ?? null;
      for (const cfg of configs) {
        if (!cfg.includeSelf && !cfg.excludeSelf && sr === r && sc === c) continue;
        if (cfg.excludeSelf && sr === r && sc === c) continue;
        if (cfg.requireSourceElement && cfg.requireSourceElement !== sourceFieldElement) continue;
        if (!appliesByRelation(cfg.target, sourceOwner, targetOwner)) continue;
        if (!inScope(cfg.scope, sr, sc, r, c)) continue;
        if (cfg.targetFieldElement && cfg.targetFieldElement !== targetFieldElement) continue;
        if (cfg.targetUnitElement && cfg.targetUnitElement !== targetUnitElement) continue;
        totalAttack += cfg.attack || 0;
        totalActivation += cfg.activation || 0;
      }
    }
  }

  return { attack: totalAttack, activation: totalActivation };
}

// Модуль для расчёта модификаторов стоимости активации от аур существ
// Держим отдельно от визуала для удобства портирования логики
import { CARDS } from '../cards.js';

const inBounds = (r, c) => r >= 0 && r < 3 && c >= 0 && c < 3;

const ADJACENT_DIRS = [
  { dr: -1, dc: 0 },
  { dr: 1, dc: 0 },
  { dr: 0, dc: -1 },
  { dr: 0, dc: 1 },
];

function normalizeAdjacentTaxes(value, defaultTarget) {
  if (value == null) return [];
  const list = Array.isArray(value) ? value : [value];
  const result = [];
  for (const raw of list) {
    if (raw == null) continue;
    let amount;
    let target = defaultTarget;
    let requireSourceElement = null;
    if (typeof raw === 'number') {
      amount = raw;
    } else if (typeof raw === 'object') {
      amount = raw.amount ?? raw.value ?? raw.plus ?? raw.delta;
      if (raw.target) target = String(raw.target).toUpperCase();
      if (raw.scope) target = String(raw.scope).toUpperCase();
      if (raw.apply) target = String(raw.apply).toUpperCase();
      requireSourceElement = raw.requireSourceElement || raw.sourceElement || raw.onElement || raw.field;
    }
    if (!Number.isFinite(amount) || amount === 0) continue;
    result.push({
      amount,
      target: target ? String(target).toUpperCase() : defaultTarget,
      requireSourceElement: requireSourceElement ? String(requireSourceElement).toUpperCase() : null,
    });
  }
  return result;
}

function normalizeGlobalDiscounts(value, defaultTarget = 'ALLY') {
  if (value == null) return [];
  const list = Array.isArray(value) ? value : [value];
  const res = [];
  for (const raw of list) {
    if (!raw) continue;
    let amount;
    let target = defaultTarget;
    let element = null;
    let excludeSelf = raw?.excludeSelf;
    let requireSourceElement = null;
    if (typeof raw === 'number') {
      amount = raw;
    } else if (typeof raw === 'object') {
      amount = raw.amount ?? raw.value ?? raw.plus ?? raw.delta;
      if (raw.target) target = String(raw.target).toUpperCase();
      if (raw.scope) target = String(raw.scope).toUpperCase();
      if (raw.element) element = String(raw.element).toUpperCase();
      if (raw.field) requireSourceElement = String(raw.field).toUpperCase();
      if (raw.requireSourceElement) requireSourceElement = String(raw.requireSourceElement).toUpperCase();
      if (raw.excludeSelf != null) excludeSelf = !!raw.excludeSelf;
    }
    if (!Number.isFinite(amount) || amount === 0) continue;
    res.push({
      amount,
      target: target ? String(target).toUpperCase() : defaultTarget,
      element: element || null,
      excludeSelf: excludeSelf !== false,
      requireSourceElement,
    });
  }
  return res;
}

export function extraActivationCostFromAuras(state, r, c, opts = {}) {
  if (!state?.board) return 0;
  const attackerUnit = opts.unit || state.board?.[r]?.[c]?.unit || null;
  const owner = opts.owner ?? attackerUnit?.owner ?? null;
  let total = 0;
  for (const { dr, dc } of ADJACENT_DIRS) {
    const nr = r + dr;
    const nc = c + dc;
    if (!inBounds(nr, nc)) continue;
    const auraUnit = state.board?.[nr]?.[nc]?.unit;
    if (!auraUnit) continue;
    const tplAura = CARDS[auraUnit.tplId];
    if (!tplAura) continue;
    const alive = (auraUnit.currentHP ?? tplAura.hp ?? 0) > 0;
    if (!alive) continue;
    const cellElement = state.board?.[nr]?.[nc]?.element || null;
    const configs = [
      ...normalizeAdjacentTaxes(tplAura.enemyActivationTaxAdjacent, 'ENEMY'),
      ...normalizeAdjacentTaxes(tplAura.allyActivationTaxAdjacent, 'ALLY'),
      ...normalizeAdjacentTaxes(tplAura.activationTaxAdjacent, null),
    ];
    if (!configs.length) continue;
    for (const cfg of configs) {
      if (!cfg) continue;
      const amount = cfg.amount;
      if (!Number.isFinite(amount) || amount === 0) continue;
      if (cfg.requireSourceElement && cellElement !== String(cfg.requireSourceElement).toUpperCase()) continue;
      let target = cfg.target;
      if (!target) {
        target = auraUnit.owner === owner ? 'ALLY' : 'ENEMY';
      }
      if (target === 'ALLY') {
        if (auraUnit.owner !== owner) continue;
        if (owner == null) continue;
      } else if (target === 'ENEMY') {
        if (owner != null && auraUnit.owner === owner) continue;
      }
      total += amount;
    }
  }
  return total;
}

export function activationDiscountFromAuras(state, r, c, opts = {}) {
  if (!state?.board) return 0;
  const targetUnit = opts.unit || state.board?.[r]?.[c]?.unit || null;
  if (!targetUnit) return 0;
  const targetTpl = CARDS[targetUnit.tplId];
  if (!targetTpl) return 0;
  const owner = opts.owner ?? targetUnit.owner ?? null;
  const element = targetTpl.element || null;
  let total = 0;
  for (let rr = 0; rr < 3; rr++) {
    for (let cc = 0; cc < 3; cc++) {
      const cell = state.board?.[rr]?.[cc];
      const auraUnit = cell?.unit;
      if (!auraUnit) continue;
      const tplAura = CARDS[auraUnit.tplId];
      if (!tplAura) continue;
      const alive = (auraUnit.currentHP ?? tplAura.hp ?? 0) > 0;
      if (!alive) continue;
      const configs = normalizeGlobalDiscounts(tplAura.globalActivationDiscountAllies || tplAura.activationDiscountAllies);
      if (!configs.length) continue;
      const auraElement = cell?.element || null;
      for (const cfg of configs) {
        if (!cfg) continue;
        const amount = cfg.amount;
        if (!Number.isFinite(amount) || amount <= 0) continue;
        const target = cfg.target || 'ALLY';
        if (target === 'ALLY') {
          if (owner == null) continue;
          if (auraUnit.owner !== owner) continue;
        } else if (target === 'ENEMY') {
          if (owner != null && auraUnit.owner === owner) continue;
        }
        if (cfg.excludeSelf && rr === r && cc === c) continue;
        if (cfg.requireSourceElement && auraElement !== cfg.requireSourceElement) continue;
        if (cfg.element && element !== cfg.element) continue;
        total += amount;
      }
    }
  }
  return total;
}

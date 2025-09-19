// Модуль пересчёта попыток Dodge с учётом аур и условий на поле
import { CARDS } from '../cards.js';
import { inBounds } from '../constants.js';
import { ensureDodgeState, getDodgeConfig } from './dodge.js';

function toArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizeElementSet(raw) {
  const set = new Set();
  for (const value of toArray(raw)) {
    if (typeof value === 'string' && value) {
      set.add(value.toUpperCase());
    }
  }
  return set;
}

function matchesElement(element, ruleSet) {
  if (!element || !(ruleSet instanceof Set)) return false;
  return ruleSet.has(element.toUpperCase());
}

function addContribution(map, r, c, amount) {
  if (!Number.isFinite(amount) || amount <= 0) return;
  const key = `${r},${c}`;
  map.set(key, (map.get(key) || 0) + amount);
}

function applySelfElementBonus(state, contributions, r, c, tpl, cellElement) {
  const raw = tpl?.gainDodgeOnElement;
  if (!raw) return;
  const rules = Array.isArray(raw) ? raw : [raw];
  for (const entry of rules) {
    if (!entry) continue;
    let elements = null;
    let amount = 1;
    if (typeof entry === 'string') {
      elements = normalizeElementSet(entry);
    } else if (typeof entry === 'object') {
      elements = normalizeElementSet(entry.elements || entry.element || entry.field);
      amount = Number(entry.amount ?? entry.attempts ?? entry.bonus ?? 1);
    }
    if (!elements || !elements.size) continue;
    if (!matchesElement(cellElement, elements)) continue;
    addContribution(contributions, r, c, amount);
  }
}

function applyAdjacentEnemyBonus(state, contributions, r, c, unit, tpl) {
  const raw = tpl?.dodgePerAdjacentEnemies || tpl?.dodgeByAdjacentEnemies;
  if (!raw) return;
  const amountPerEnemy = Number(raw.amount ?? raw.perEnemy ?? raw.value ?? raw) || 1;
  let count = 0;
  for (const [dr, dc] of Object.values({ N: [-1,0], S: [1,0], E: [0,1], W: [0,-1] })) {
    const nr = r + dr;
    const nc = c + dc;
    if (!inBounds(nr, nc)) continue;
    const other = state.board?.[nr]?.[nc]?.unit;
    if (other && other.owner !== unit.owner) count += 1;
  }
  if (count > 0) {
    addContribution(contributions, r, c, count * amountPerEnemy);
  }
}

function applyAdjacentAllyAura(state, contributions, r, c, unit, tpl) {
  const raw = tpl?.grantDodgeToAdjacentAllies;
  if (!raw) return;
  const amount = Number(raw.amount ?? raw.value ?? 1);
  if (amount <= 0) return;
  for (const [dr, dc] of Object.values({ N: [-1,0], S: [1,0], E: [0,1], W: [0,-1] })) {
    const nr = r + dr;
    const nc = c + dc;
    if (!inBounds(nr, nc)) continue;
    const ally = state.board?.[nr]?.[nc]?.unit;
    if (!ally || ally.owner !== unit.owner) continue;
    addContribution(contributions, nr, nc, amount);
  }
}

function applyAlliedFieldAura(state, contributions, r, c, unit, tpl) {
  const raw = tpl?.grantDodgeToAlliesOnElement;
  if (!raw) return;
  const elements = normalizeElementSet(raw.elements || raw.element || raw.field);
  if (!elements.size) return;
  const amount = Number(raw.amount ?? raw.value ?? raw.attempts ?? 1);
  if (amount <= 0) return;
  const includeSelf = !!raw.includeSelf || raw.self === true;
  for (let rr = 0; rr < 3; rr++) {
    for (let cc = 0; cc < 3; cc++) {
      const target = state.board?.[rr]?.[cc]?.unit;
      if (!target || target.owner !== unit.owner) continue;
      if (!includeSelf && rr === r && cc === c) continue;
      const cellElement = state.board?.[rr]?.[cc]?.element;
      if (!matchesElement(cellElement, elements)) continue;
      addContribution(contributions, rr, cc, amount);
    }
  }
}

function buildFinalConfig(baseCfg, extra) {
  const bonus = Math.max(0, extra || 0);

  if (baseCfg) {
    if (baseCfg.successes != null) {
      const baseAttempts = Math.max(0, baseCfg.successes || 0);
      const total = baseAttempts + bonus;
      if (total <= 0) {
        // Базовую конфигурацию без попыток возвращаем только если там явно указано ограничение
        return baseAttempts > 0
          ? { chance: baseCfg.chance, successes: baseAttempts, keyword: baseCfg.keyword }
          : null;
      }
      return { chance: baseCfg.chance, successes: total, keyword: baseCfg.keyword };
    }
    // Неограниченный Dodge остаётся как есть, добавочные попытки не требуются
    return { chance: baseCfg.chance, successes: null, keyword: baseCfg.keyword };
  }

  if (bonus > 0) {
    return { chance: 0.5, successes: bonus, keyword: 'DODGE_ATTEMPT' };
  }

  return null;
}

export function rebuildDodgeStates(state) {
  if (!state?.board) return { updated: false };
  const contributions = new Map();

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const cell = state.board?.[r]?.[c];
      const unit = cell?.unit;
      if (!unit) continue;
      const tpl = CARDS[unit.tplId];
      if (!tpl) continue;
      const cellElement = cell.element;
      applySelfElementBonus(state, contributions, r, c, tpl, cellElement);
      applyAdjacentEnemyBonus(state, contributions, r, c, unit, tpl);
      applyAdjacentAllyAura(state, contributions, r, c, unit, tpl);
      applyAlliedFieldAura(state, contributions, r, c, unit, tpl);
    }
  }

  let updated = false;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const cell = state.board?.[r]?.[c];
      const unit = cell?.unit;
      if (!unit) continue;
      const tpl = CARDS[unit.tplId];
      if (!tpl) continue;
      const baseCfg = getDodgeConfig(tpl);
      const extra = contributions.get(`${r},${c}`) || 0;
      const finalCfg = buildFinalConfig(baseCfg, extra);
      if (finalCfg) {
        const prev = unit.dodgeState;
        const stateObj = ensureDodgeState(unit, tpl, finalCfg);
        if (prev !== stateObj) updated = true;
      } else if (unit.dodgeState) {
        delete unit.dodgeState;
        updated = true;
      }
    }
  }

  return { updated };
}

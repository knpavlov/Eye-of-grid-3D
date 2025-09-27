// Выделенный модуль для расчёта получения маны при призыве существ
// Содержит только игровую логику и не зависит от визуального слоя.

import { CARDS } from '../cards.js';
import { normalizeElementName } from '../utils/elements.js';

const BOARD_SIZE = 3;

const capMana = (value) => {
  const num = Number.isFinite(value) ? value : 0;
  return Math.max(0, Math.min(10, Math.floor(num)));
};

const toArray = (value) => {
  if (value == null) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
};

function getCell(state, r, c) {
  if (!state?.board) return null;
  if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) return null;
  return state.board?.[r]?.[c] || null;
}

function normalizeTrigger(raw) {
  const str = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  if (str === 'ENEMY' || str === 'ENEMIES') return 'ENEMY';
  if (str === 'ANY' || str === 'ALL') return 'ANY';
  return 'ALLY';
}

function normalizeAmount(raw) {
  const num = Number(raw);
  if (!Number.isFinite(num)) return 1;
  return Math.max(0, Math.floor(num));
}

function normalizeElementFilter(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    return { element: normalizeElementName(raw) };
  }
  if (typeof raw === 'object') {
    const element = normalizeElementName(raw.element || raw.type || raw.eq || raw.match);
    const notElement = normalizeElementName(raw.not || raw.exclude || raw.notElement);
    return {
      element: element || null,
      notElement: notElement || null,
    };
  }
  return null;
}

function matchesFieldFilter(element, filter) {
  if (!filter) return true;
  const norm = normalizeElementName(element);
  if (filter.element && norm !== filter.element) return false;
  if (filter.notElement && norm === filter.notElement) return false;
  return true;
}

function normalizeConfig(raw) {
  if (!raw) return null;
  const trigger = normalizeTrigger(raw.trigger || raw.type || raw.side);
  const amount = normalizeAmount(raw.amount ?? raw.gain ?? raw.value ?? raw.delta ?? 1);
  const includeSelf = raw.includeSelf === true || raw.self === true;
  const sourceFilter = normalizeElementFilter(raw.sourceField || raw.sourceElement || raw.source);
  const summonFilter = normalizeElementFilter(raw.summonField || raw.field || raw.targetField || raw.summonedElement);
  const requireEnemy = raw.requireEnemy === true;
  const requireAlly = raw.requireAlly === true;
  const customLog = typeof raw.log === 'string' ? raw.log : null;
  return {
    trigger,
    amount,
    includeSelf,
    sourceFilter,
    summonFilter,
    requireEnemy,
    requireAlly,
    customLog,
  };
}

function resolveConfigs(tpl) {
  const raw = tpl?.manaOnSummon;
  if (!raw) return [];
  return toArray(raw).map(normalizeConfig).filter(Boolean);
}

function sameUnit(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.uid != null && b.uid != null) return a.uid === b.uid;
  return false;
}

function shouldTrigger(config, context) {
  const { abilityUnit, summonUnit, abilityCell, summonCell } = context;
  if (!abilityUnit || !summonUnit) return false;
  const isAlly = abilityUnit.owner === summonUnit.owner;
  if (config.requireEnemy && isAlly) return false;
  if (config.requireAlly && !isAlly) return false;
  if (config.trigger === 'ALLY' && !isAlly) return false;
  if (config.trigger === 'ENEMY' && isAlly) return false;
  if (!config.includeSelf && sameUnit(abilityUnit, summonUnit)) return false;

  const sourceElement = abilityCell ? abilityCell.element : null;
  if (!matchesFieldFilter(sourceElement, config.sourceFilter)) return false;

  const summonElement = summonCell ? summonCell.element : null;
  if (!matchesFieldFilter(summonElement, config.summonFilter)) return false;

  return true;
}

function buildLogText(tpl, amount, context, config) {
  if (config.customLog) return config.customLog;
  const name = tpl?.name || 'Существо';
  const value = Math.max(0, amount);
  const suffix = value === 1 ? 'ману' : 'маны';
  return `${name}: приносит ${value} ${suffix}.`;
}

export function applyManaGainOnSummon(state, context = {}) {
  const result = { events: [], logs: [] };
  if (!state?.board || !Array.isArray(state.players)) return result;

  const { r, c } = context;
  const summonCell = getCell(state, r, c);
  const summonUnit = context.unit || summonCell?.unit || null;
  if (!summonUnit) return result;

  for (let rr = 0; rr < BOARD_SIZE; rr += 1) {
    for (let cc = 0; cc < BOARD_SIZE; cc += 1) {
      const abilityCell = getCell(state, rr, cc);
      const abilityUnit = abilityCell?.unit;
      if (!abilityUnit) continue;
      const tpl = CARDS[abilityUnit.tplId];
      if (!tpl) continue;
      const configs = resolveConfigs(tpl);
      if (!configs.length) continue;

      for (const cfg of configs) {
        if (!cfg || cfg.amount <= 0) continue;
        if (!shouldTrigger(cfg, { abilityUnit, summonUnit, abilityCell, summonCell })) continue;
        const owner = abilityUnit.owner;
        if (owner == null || !state.players[owner]) continue;
        const player = state.players[owner];
        const before = Math.max(0, Number(player.mana) || 0);
        const after = capMana(before + cfg.amount);
        if (after === before) continue;
        player.mana = after;
        result.events.push({
          owner,
          before,
          after,
          amount: cfg.amount,
          r: rr,
          c: cc,
          source: { tplId: tpl.id, r: rr, c: cc },
        });
        const logText = buildLogText(tpl, cfg.amount, { abilityUnit, summonUnit }, cfg);
        if (logText) result.logs.push(logText);
      }
    }
  }

  return result;
}

export default { applyManaGainOnSummon };

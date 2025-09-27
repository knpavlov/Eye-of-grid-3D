// Дополнительные бонусы к атаке, зависящие от цели
// Модуль инкапсулирует чистую игровую логику.

import { CARDS } from '../cards.js';
import { normalizeElementName } from '../utils/elements.js';

const BOARD_SIZE = 3;

const toArray = (value) => {
  if (value == null) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
};

function normalizeConfig(raw) {
  if (!raw) return null;
  const targetElement = normalizeElementName(raw.targetElement || raw.element || raw.matchElement);
  if (!targetElement) return null;
  const requireEnemy = raw.requireEnemy === true || raw.enemy === true;
  const amountPer = Number.isFinite(raw.amountPer) ? raw.amountPer : Number(raw.amount ?? raw.per ?? 1) || 1;
  const countNonElement = normalizeElementName(raw.countNonElement || raw.excludeElement || raw.notElement);
  const countElement = normalizeElementName(raw.countElement || raw.includeElement || raw.count);
  const customLog = typeof raw.log === 'string' ? raw.log : null;
  return {
    targetElement,
    requireEnemy,
    amountPer,
    countNonElement,
    countElement,
    customLog,
  };
}

function unitAlive(unit) {
  if (!unit) return false;
  if (typeof unit.currentHP === 'number') return unit.currentHP > 0;
  return true;
}

function countUnitsByElement(state, opts = {}) {
  if (!state?.board) return 0;
  const { countElement, countNonElement } = opts;
  let total = 0;
  for (let r = 0; r < BOARD_SIZE; r += 1) {
    for (let c = 0; c < BOARD_SIZE; c += 1) {
      const unit = state.board?.[r]?.[c]?.unit;
      if (!unitAlive(unit)) continue;
      const tpl = CARDS[unit.tplId];
      if (!tpl) continue;
      const element = normalizeElementName(tpl.element);
      if (countElement && element !== countElement) continue;
      if (countNonElement && element === countNonElement) continue;
      total += 1;
    }
  }
  return total;
}

function buildLog(tpl, amount, info, cfg) {
  if (cfg.customLog) return cfg.customLog;
  const name = tpl?.name || 'Существо';
  if (cfg.countNonElement) {
    return `${name}: +${amount} ATK (небиолитовых существ: ${info.count}).`;
  }
  if (cfg.countElement) {
    return `${name}: +${amount} ATK (существ стихии ${cfg.countElement}: ${info.count}).`;
  }
  return `${name}: +${amount} ATK.`;
}

export function getTargetConditionalAttackBonus(state, tpl, context = {}, target = null) {
  if (!tpl || !target) return null;
  const configs = toArray(tpl.targetConditionalAttack).map(normalizeConfig).filter(Boolean);
  if (!configs.length) return null;
  const targetTpl = CARDS[target.tplId];
  if (!targetTpl) return null;
  const attacker = context.unit;

  for (const cfg of configs) {
    if (!cfg) continue;
    const element = normalizeElementName(targetTpl.element);
    if (cfg.targetElement && cfg.targetElement !== element) continue;
    if (cfg.requireEnemy && attacker && target.owner === attacker.owner) continue;

    const count = countUnitsByElement(state, {
      countElement: cfg.countElement,
      countNonElement: cfg.countNonElement,
    });
    if (count <= 0) continue;
    const amount = cfg.amountPer * count;
    if (!Number.isFinite(amount) || amount === 0) continue;
    return {
      amount,
      count,
      targetElement: cfg.targetElement,
      log: buildLog(tpl, amount, { count }, cfg),
    };
  }
  return null;
}

export default { getTargetConditionalAttackBonus };

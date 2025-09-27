// Модуль для переопределения базовой атаки существ при выполнении условий
// Логика изолирована для упрощения переноса на другой движок.

import { CARDS } from '../cards.js';
import { normalizeElementName } from '../utils/elements.js';

const BOARD_SIZE = 3;

const toArray = (value) => {
  if (value == null) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
};

function countAlliedElement(state, owner, element, opts = {}) {
  if (!state?.board) return 0;
  let total = 0;
  for (let r = 0; r < BOARD_SIZE; r += 1) {
    for (let c = 0; c < BOARD_SIZE; c += 1) {
      if (!opts.includeSelf && opts.exclude && r === opts.exclude.r && c === opts.exclude.c) {
        continue;
      }
      const unit = state.board?.[r]?.[c]?.unit;
      if (!unit || unit.owner !== owner) continue;
      const tpl = CARDS[unit.tplId];
      if (!tpl) continue;
      const tplElement = normalizeElementName(tpl.element);
      if (tplElement === element) total += 1;
    }
  }
  return total;
}

function resolveField(element) {
  return normalizeElementName(element);
}

function normalizeOverride(raw) {
  if (!raw) return null;
  const field = resolveField(raw.field || raw.onField || raw.fieldElement);
  const type = (raw.type || raw.mode || 'ALLY_ELEMENT_COUNT').toUpperCase();
  if (type === 'ALLY_ELEMENT_COUNT') {
    const countElement = normalizeElementName(raw.countElement || raw.element || raw.allyElement);
    if (!countElement) return null;
    const base = Number.isFinite(raw.base) ? raw.base : Number(raw.baseValue ?? raw.start ?? raw.initial ?? 0) || 0;
    const amountPer = Number.isFinite(raw.amountPer) ? raw.amountPer : Number(raw.per ?? raw.amount ?? 1) || 1;
    const includeSelf = raw.includeSelf === true;
    return {
      field,
      type: 'ALLY_ELEMENT_COUNT',
      countElement,
      base,
      amountPer,
      includeSelf,
    };
  }
  return null;
}

export function resolveAttackOverride(state, r, c, tpl) {
  if (!tpl) return null;
  const configs = toArray(tpl.overrideAtkOnField).map(normalizeOverride).filter(Boolean);
  if (!configs.length) return null;
  const cell = state?.board?.[r]?.[c];
  if (!cell) return null;
  const unit = cell.unit;
  if (!unit) return null;
  const fieldElement = normalizeElementName(cell.element);
  const owner = unit.owner;

  for (const cfg of configs) {
    if (!cfg) continue;
    if (cfg.field && cfg.field !== fieldElement) continue;
    if (cfg.type === 'ALLY_ELEMENT_COUNT') {
      if (owner == null) continue;
      const count = countAlliedElement(state, owner, cfg.countElement, {
        includeSelf: cfg.includeSelf,
        exclude: { r, c },
      });
      const atk = cfg.base + cfg.amountPer * count;
      if (!Number.isFinite(atk)) continue;
      return {
        atk,
        type: cfg.type,
        element: cfg.countElement,
        count,
        base: cfg.base,
        includeSelf: cfg.includeSelf,
      };
    }
  }

  return null;
}

export default { resolveAttackOverride };

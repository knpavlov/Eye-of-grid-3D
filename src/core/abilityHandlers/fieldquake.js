// Логика полевых сдвигов (fieldquake) без привязки к визуальному слою
// Модуль предоставляет функции для вычисления доступности и применения fieldquake.
import { computeFieldquakeLockedCells } from '../fieldLocks.js';
import { computeCellBuff } from '../fieldEffects.js';
import { CARDS } from '../cards.js';
import { normalizeElementName } from '../utils/elements.js';

const FIELDQUAKE_MAP = {
  FIRE: 'WATER',
  WATER: 'FIRE',
  EARTH: 'FOREST',
  FOREST: 'EARTH',
};

function normalizeElement(element) {
  const norm = normalizeElementName(element);
  return norm || null;
}

export function resolveFieldquakeTarget(element) {
  const normalized = normalizeElement(element);
  if (!normalized) return null;
  return FIELDQUAKE_MAP[normalized] || normalized;
}

export function buildFieldquakeLockSet(state) {
  const locked = new Set();
  const cells = computeFieldquakeLockedCells(state) || [];
  for (const cell of cells) {
    if (!cell) continue;
    locked.add(`${cell.r},${cell.c}`);
  }
  return locked;
}

export function applyFieldquakeToCell(state, r, c, opts = {}) {
  if (!state?.board || typeof r !== 'number' || typeof c !== 'number') {
    return { ok: false, reason: 'INVALID_COORDS' };
  }
  const cell = state.board?.[r]?.[c];
  if (!cell) return { ok: false, reason: 'INVALID_CELL' };
  const prevElement = normalizeElement(cell.element);
  if (!prevElement) return { ok: false, reason: 'NO_ELEMENT' };
  if (prevElement === 'BIOLITH' && !opts?.allowBiolith) {
    return { ok: false, reason: 'BIOLITH' };
  }
  const lockSet = opts.lockedSet || buildFieldquakeLockSet(state);
  const key = `${r},${c}`;
  if (!opts.ignoreLocks && lockSet.has(key)) {
    return { ok: false, reason: 'LOCKED', locked: true };
  }
  const nextElement = resolveFieldquakeTarget(prevElement);
  if (!nextElement || nextElement === prevElement) {
    return { ok: false, reason: 'NO_CHANGE' };
  }

  cell.element = nextElement;

  const result = {
    ok: true,
    r,
    c,
    prevElement,
    nextElement,
    locked: false,
    unitAffected: false,
    hpDelta: 0,
    hpAfter: null,
  };

  const unit = cell.unit;
  if (unit) {
    const tpl = CARDS[unit.tplId];
    const prevBuff = computeCellBuff(prevElement, tpl?.element);
    const nextBuff = computeCellBuff(nextElement, tpl?.element);
    const delta = (nextBuff.hp || 0) - (prevBuff.hp || 0);
    const before = (typeof unit.currentHP === 'number')
      ? unit.currentHP
      : (tpl?.hp || 0) + (prevBuff.hp || 0);
    const after = Math.max(0, before + delta);
    unit.currentHP = after;
    result.unitAffected = true;
    result.hpDelta = delta;
    result.hpAfter = after;
  }

  return result;
}

export default {
  resolveFieldquakeTarget,
  buildFieldquakeLockSet,
  applyFieldquakeToCell,
};

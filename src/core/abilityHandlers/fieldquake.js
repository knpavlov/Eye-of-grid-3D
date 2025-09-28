// Обработка эффектов fieldquake без привязки к визуальному слою
import { computeFieldquakeLockedCells } from '../fieldLocks.js';
import { CARDS } from '../cards.js';
import { getOppositeElement, applyFieldTransitionToUnit } from '../fieldEffects.js';
import { applyFieldFatalityCheck } from './fieldHazards.js';
import { createDeathEntry } from './deathRecords.js';

const BOARD_SIZE = 3;

function inBounds(r, c) {
  return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;
}

function buildLockedSet(state) {
  const locked = computeFieldquakeLockedCells(state);
  const set = new Set();
  for (const cell of locked) {
    if (!cell) continue;
    const key = `${cell.r},${cell.c}`;
    set.add(key);
  }
  return set;
}

export function canFieldquakeCell(state, r, c, opts = {}) {
  if (!state?.board) return { ok: false, reason: 'NO_BOARD' };
  if (!inBounds(r, c)) return { ok: false, reason: 'OUT_OF_BOUNDS' };
  const cell = state.board?.[r]?.[c];
  if (!cell) return { ok: false, reason: 'NO_CELL' };
  const prevElement = cell.element || null;
  if (!prevElement) return { ok: false, reason: 'NO_ELEMENT', prevElement };
  if (prevElement === 'BIOLITH') {
    return { ok: false, reason: 'BIOLITH', prevElement };
  }
  const respectLocks = opts.respectLocks !== false;
  if (respectLocks) {
    const lockedSet = Array.isArray(opts.locked)
      ? new Set(opts.locked.map(p => `${p.r},${p.c}`))
      : (opts.lockedSet instanceof Set ? opts.lockedSet : buildLockedSet(state));
    const key = `${r},${c}`;
    if (lockedSet.has(key)) {
      return { ok: false, reason: 'LOCKED', prevElement };
    }
  }
  const nextElement = getOppositeElement(prevElement);
  if (!nextElement || nextElement === prevElement) {
    return { ok: false, reason: 'NO_CHANGE', prevElement };
  }
  return { ok: true, prevElement, nextElement };
}

export function applyFieldquakeToCell(state, r, c, opts = {}) {
  if (!state?.board) return null;
  if (!inBounds(r, c)) return null;
  const lockedSet = opts.lockedSet instanceof Set ? opts.lockedSet : null;
  const check = canFieldquakeCell(state, r, c, {
    respectLocks: opts.respectLocks !== false,
    lockedSet,
  });
  if (!check.ok) {
    return { changed: false, reason: check.reason, prevElement: check.prevElement ?? null };
  }
  const cell = state.board[r][c];
  const prevElement = check.prevElement;
  const nextElement = check.nextElement;
  cell.element = nextElement;

  const unit = cell.unit || null;
  const tpl = unit ? CARDS[unit.tplId] : null;
  const wasDeadBefore = unit && tpl
    ? ((typeof unit.currentHP === 'number' ? unit.currentHP : tpl.hp || 0) <= 0)
    : false;
  let hpShift = null;
  let fatality = null;
  if (unit && tpl && !wasDeadBefore) {
    hpShift = applyFieldTransitionToUnit(unit, tpl, prevElement, nextElement);
    fatality = applyFieldFatalityCheck(unit, tpl, nextElement);
  }

  const unitDied = !!(unit && ((unit.currentHP ?? tpl?.hp ?? 0) <= 0));

  return {
    changed: true,
    r,
    c,
    prevElement,
    nextElement,
    unit,
    tpl,
    hpShift,
    fatality,
    unitDied,
  };
}

export function collectFieldquakeDeaths(state, outcomes, opts = {}) {
  if (!state?.board) return [];
  const list = Array.isArray(outcomes) ? outcomes : [outcomes];
  const deaths = [];
  const seen = new Set();
  for (const res of list) {
    if (!res?.unitDied) continue;
    const rr = Number(res.r);
    const cc = Number(res.c);
    if (!Number.isInteger(rr) || !Number.isInteger(cc)) continue;
    const key = `${rr},${cc}`;
    if (seen.has(key)) continue;
    const cell = state.board?.[rr]?.[cc];
    const unit = cell?.unit;
    if (!unit) continue;
    const entry = createDeathEntry(state, unit, rr, cc) || {
      r: rr,
      c: cc,
      owner: unit.owner,
      tplId: unit.tplId,
      uid: unit.uid ?? null,
      element: cell?.element || null,
    };
    deaths.push(entry);
    seen.add(key);
    if (opts?.keepUnits !== true && cell) {
      cell.unit = null;
    }
  }
  return deaths;
}

export function normalizeFieldquakeOnSummonConfig(raw) {
  if (!raw) return null;
  if (raw === true) {
    return { pattern: 'ADJACENT', respectLocks: true };
  }
  if (typeof raw === 'string') {
    return { pattern: raw.toUpperCase(), respectLocks: true };
  }
  if (typeof raw === 'object') {
    const cfg = {
      pattern: typeof raw.pattern === 'string' ? raw.pattern.toUpperCase() : 'ADJACENT',
      respectLocks: raw.respectLocks !== false,
    };
    if (raw.cells && Array.isArray(raw.cells)) {
      cfg.cells = raw.cells
        .map(pos => ({ r: Number(pos.r), c: Number(pos.c) }))
        .filter(pos => Number.isInteger(pos.r) && Number.isInteger(pos.c));
    }
    return cfg;
  }
  return null;
}

export function normalizeFieldquakeOnDamageConfig(raw) {
  if (!raw) return null;
  if (raw === true) {
    return {
      respectLocks: true,
      preventRetaliation: true,
    };
  }
  if (typeof raw === 'object') {
    const cfg = {
      respectLocks: raw.respectLocks !== false,
      preventRetaliation: raw.preventRetaliation !== false,
    };
    if (raw.requireAttackerNotElement) {
      cfg.requireAttackerNotElement = String(raw.requireAttackerNotElement).toUpperCase();
    }
    if (raw.requireAttackerElement) {
      cfg.requireAttackerElement = String(raw.requireAttackerElement).toUpperCase();
    }
    return cfg;
  }
  if (typeof raw === 'string') {
    return {
      respectLocks: true,
      preventRetaliation: true,
      requireAttackerNotElement: raw.toUpperCase(),
    };
  }
  return null;
}

export default {
  canFieldquakeCell,
  applyFieldquakeToCell,
  normalizeFieldquakeOnSummonConfig,
  normalizeFieldquakeOnDamageConfig,
  collectFieldquakeDeaths,
};

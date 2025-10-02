// Логика массовых fieldquake-эффектов для заклинаний
// Модуль не зависит от визуальной части и возвращает детальное описание изменений

import { computeFieldquakeLockedCells } from '../fieldLocks.js';
import { CARDS } from '../cards.js';
import {
  applyFieldquakeToCell,
  collectFieldquakeDeaths,
} from '../abilityHandlers/fieldquake.js';
import { describeFieldFatality } from '../abilityHandlers/fieldHazards.js';

const BOARD_SIZE = 3;

function inBounds(r, c) {
  return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;
}

function normalizePositions(value) {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  const seen = new Set();
  const result = [];
  for (const entry of list) {
    const r = Number(entry?.r);
    const c = Number(entry?.c);
    if (!Number.isInteger(r) || !Number.isInteger(c)) continue;
    if (!inBounds(r, c)) continue;
    const key = `${r},${c}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ r, c });
  }
  return result;
}

function ensureLockedSet(state, opts = {}) {
  if (opts.respectLocks === false) return null;
  if (opts.lockedSet instanceof Set) return opts.lockedSet;
  const locked = Array.isArray(opts.locked)
    ? opts.locked
    : computeFieldquakeLockedCells(state);
  const set = new Set();
  for (const cell of locked || []) {
    if (!cell) continue;
    const key = `${cell.r},${cell.c}`;
    set.add(key);
  }
  return set;
}

function describeFieldChange(change, opts = {}) {
  if (!change?.changed) return null;
  const prev = change.prevElement || 'UNKNOWN';
  const next = change.nextElement || prev;
  const prefix = opts.sourceName ? `${opts.sourceName}: ` : '';
  return `${prefix}Поле (${change.r},${change.c}) меняет стихию ${prev}→${next}.`;
}

function describeBuffShift(change, opts = {}) {
  if (!change?.hpShift || !change.tpl) return null;
  const { deltaHp, beforeHp, afterHp, nextElement } = change.hpShift;
  if (!deltaHp) return null;
  const name = change.tpl.name || 'Существо';
  const prefix = opts.sourceName ? `${opts.sourceName}: ` : '';
  const fieldLabel = nextElement ? `поле ${nextElement}` : 'новое поле';
  if (deltaHp > 0) {
    return `${prefix}${name} усиливается на ${fieldLabel}: HP ${beforeHp}→${afterHp}.`;
  }
  return `${prefix}${name} теряет силу на ${fieldLabel}: HP ${beforeHp}→${afterHp}.`;
}

function describeFatality(change, opts = {}) {
  if (!change?.fatality?.dies || !change.tpl) return null;
  const verdict = describeFieldFatality(change.tpl, change.fatality, { name: change.tpl.name });
  if (!verdict) return null;
  const prefix = opts.sourceName ? `${opts.sourceName}: ` : '';
  return `${prefix}${verdict}`;
}

function collectHpChanges(changes) {
  const list = [];
  for (const change of changes || []) {
    if (!change?.hpShift || !change.unit) continue;
    const delta = change.hpShift.deltaHp;
    if (!delta) continue;
    list.push({
      r: change.r,
      c: change.c,
      delta,
      before: change.hpShift.beforeHp,
      after: change.hpShift.afterHp,
      unitTplId: change.unit.tplId,
      owner: change.unit.owner,
    });
  }
  return list;
}

function pushDeathsToGraveyard(state, deaths = []) {
  if (!state?.players) return;
  for (const entry of deaths) {
    if (!entry) continue;
    const owner = entry.owner;
    if (owner == null) continue;
    const tpl = CARDS[entry.tplId];
    if (!tpl) continue;
    const player = state.players[owner];
    if (!player || !Array.isArray(player.graveyard)) continue;
    player.graveyard.push(tpl);
  }
}

export function fieldquakeSpecificCells(state, positions, opts = {}) {
  if (!state?.board) {
    return { ok: false, reason: 'NO_BOARD', fieldquakes: [], changes: [], hpChanges: [], deaths: [], logs: [] };
  }
  const targets = normalizePositions(positions);
  if (!targets.length) {
    return { ok: false, reason: 'NO_TARGETS', fieldquakes: [], changes: [], hpChanges: [], deaths: [], logs: [] };
  }
  const lockedSet = ensureLockedSet(state, opts);
  const logs = [];
  const changes = [];
  const skipped = [];

  for (const pos of targets) {
    const res = applyFieldquakeToCell(state, pos.r, pos.c, {
      respectLocks: opts.respectLocks !== false,
      lockedSet,
    });
    if (!res?.changed) {
      skipped.push({ r: pos.r, c: pos.c, reason: res?.reason || 'UNKNOWN' });
      if (res?.reason === 'LOCKED') {
        const prefix = opts.sourceName ? `${opts.sourceName}: ` : '';
        logs.push(`${prefix}Поле (${pos.r},${pos.c}) защищено от fieldquake.`);
      } else if (res?.reason === 'BIOLITH') {
        const prefix = opts.sourceName ? `${opts.sourceName}: ` : '';
        logs.push(`${prefix}Поле (${pos.r},${pos.c}) из биолита остаётся неизменным.`);
      }
      continue;
    }
    changes.push(res);
    const changeLog = describeFieldChange(res, opts);
    if (changeLog) logs.push(changeLog);
    const buffLog = describeBuffShift(res, opts);
    if (buffLog) logs.push(buffLog);
    const fatalLog = describeFatality(res, opts);
    if (fatalLog) logs.push(fatalLog);
  }

  if (!changes.length) {
    return {
      ok: false,
      reason: 'NO_CHANGES',
      fieldquakes: [],
      changes: [],
      hpChanges: [],
      deaths: [],
      logs,
      skipped,
    };
  }

  const deaths = collectFieldquakeDeaths(state, changes);
  if (deaths.length) {
    pushDeathsToGraveyard(state, deaths);
  }

  const hpChanges = collectHpChanges(changes);

  const fieldquakes = changes.map(change => ({
    r: change.r,
    c: change.c,
    prevElement: change.prevElement,
    nextElement: change.nextElement,
  }));

  return {
    ok: true,
    fieldquakes,
    changes,
    hpChanges,
    deaths,
    logs,
    skipped,
  };
}

export function fieldquakeAll(state, opts = {}) {
  if (!state?.board) {
    return { ok: false, reason: 'NO_BOARD', fieldquakes: [], changes: [], hpChanges: [], deaths: [], logs: [] };
  }
  const allCells = [];
  for (let r = 0; r < BOARD_SIZE; r += 1) {
    for (let c = 0; c < BOARD_SIZE; c += 1) {
      allCells.push({ r, c });
    }
  }
  return fieldquakeSpecificCells(state, allCells, opts);
}

export function fieldquakeByElement(state, element, opts = {}) {
  if (!state?.board) {
    return { ok: false, reason: 'NO_BOARD', fieldquakes: [], changes: [], hpChanges: [], deaths: [], logs: [] };
  }
  if (!element) {
    return { ok: false, reason: 'NO_ELEMENT', fieldquakes: [], changes: [], hpChanges: [], deaths: [], logs: [] };
  }
  const token = String(element).toUpperCase();
  const positions = [];
  for (let r = 0; r < BOARD_SIZE; r += 1) {
    for (let c = 0; c < BOARD_SIZE; c += 1) {
      if (state.board?.[r]?.[c]?.element === token) {
        positions.push({ r, c });
      }
    }
  }
  if (!positions.length) {
    return {
      ok: false,
      reason: 'NO_MATCHING_FIELDS',
      fieldquakes: [],
      changes: [],
      hpChanges: [],
      deaths: [],
      logs: [],
    };
  }
  return fieldquakeSpecificCells(state, positions, opts);
}

export default {
  fieldquakeSpecificCells,
  fieldquakeAll,
  fieldquakeByElement,
};

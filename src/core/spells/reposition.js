// Логика перемещения и обмена позициями существ для заклинаний
// Без зависимостей от визуального слоя — только чистая игровая логика

import { inBounds } from '../constants.js';
import { CARDS } from '../cards.js';
import { applyFieldTransitionToUnit } from '../fieldEffects.js';
import { applyFieldFatalityCheck, describeFieldFatality } from '../abilityHandlers/fieldHazards.js';
import { createDeathEntry } from '../abilityHandlers/deathRecords.js';

function ensureCell(state, r, c) {
  if (!state?.board) return null;
  if (!inBounds(r, c)) return null;
  return state.board[r]?.[c] || null;
}

function pushToGraveyard(state, death) {
  const owner = death?.owner;
  if (owner == null) return;
  const tpl = CARDS[death.tplId];
  if (!tpl) return;
  const player = state?.players?.[owner];
  if (!player || !Array.isArray(player.graveyard)) return;
  player.graveyard.push(tpl);
}

function makeHpLog(prefix, name, shift) {
  if (!shift || !name) return null;
  const fieldLabel = shift.nextElement ? `поле ${shift.nextElement}` : 'новое поле';
  if (shift.deltaHp > 0) {
    return `${prefix}${name} усиливается на ${fieldLabel}: HP ${shift.beforeHp}→${shift.afterHp}.`;
  }
  return `${prefix}${name} теряет силу на ${fieldLabel}: HP ${shift.beforeHp}→${shift.afterHp}.`;
}

function resolveFatalLog(prefix, tpl, fatality) {
  if (!fatality?.dies || !tpl) return null;
  const text = describeFieldFatality(tpl, fatality, { name: tpl.name });
  return text ? `${prefix}${text}` : null;
}

function collectHpChange(r, c, unit, shift) {
  if (!shift || !unit) return null;
  return {
    r,
    c,
    delta: shift.deltaHp,
    before: shift.beforeHp,
    after: shift.afterHp,
    unitTplId: unit.tplId,
    owner: unit.owner,
  };
}

function finalizeDeath(state, unit, r, c) {
  if (!state || !unit) return null;
  const entry = createDeathEntry(state, unit, r, c);
  if (!entry) return null;
  const cell = ensureCell(state, r, c);
  if (cell && cell.unit === unit) {
    cell.unit = null;
  }
  pushToGraveyard(state, entry);
  return entry;
}

export function swapUnits(state, a, b, opts = {}) {
  if (!state?.board) {
    return { ok: false, reason: 'NO_BOARD', logs: [], hpChanges: [], deaths: [] };
  }
  const cellA = ensureCell(state, a?.r, a?.c);
  const cellB = ensureCell(state, b?.r, b?.c);
  if (!cellA || !cellB) {
    return { ok: false, reason: 'OUT_OF_BOUNDS', logs: [], hpChanges: [], deaths: [] };
  }
  const unitA = cellA.unit;
  const unitB = cellB.unit;
  if (!unitA || !unitB) {
    return { ok: false, reason: 'MISSING_UNIT', logs: [], hpChanges: [], deaths: [] };
  }
  if (opts.requireSameOwner && unitA.owner !== unitB.owner) {
    return { ok: false, reason: 'OWNER_MISMATCH', logs: [], hpChanges: [], deaths: [] };
  }

  const tplA = CARDS[unitA.tplId];
  const tplB = CARDS[unitB.tplId];
  const nameA = tplA?.name || 'Существо A';
  const nameB = tplB?.name || 'Существо B';
  const prefix = opts.sourceName ? `${opts.sourceName}: ` : '';

  const elementA = cellA.element || null;
  const elementB = cellB.element || null;

  cellA.unit = unitB;
  cellB.unit = unitA;

  const logs = [`${prefix}${nameA} и ${nameB} меняются местами.`];
  const hpChanges = [];
  const deaths = [];

  const shiftA = applyFieldTransitionToUnit(unitA, tplA, elementA, elementB);
  const fatalA = applyFieldFatalityCheck(unitA, tplA, elementB);
  const changeA = collectHpChange(b.r, b.c, unitA, shiftA);
  if (changeA) hpChanges.push(changeA);
  const hpLogA = makeHpLog(prefix, nameA, shiftA);
  if (hpLogA) logs.push(hpLogA);
  const fatalLogA = resolveFatalLog(prefix, tplA, fatalA);
  if (fatalLogA) logs.push(fatalLogA);
  if ((unitA.currentHP ?? tplA?.hp ?? 0) <= 0 || fatalA?.dies) {
    const death = finalizeDeath(state, unitA, b.r, b.c);
    if (death) deaths.push(death);
  }

  const shiftB = applyFieldTransitionToUnit(unitB, tplB, elementB, elementA);
  const fatalB = applyFieldFatalityCheck(unitB, tplB, elementA);
  const changeB = collectHpChange(a.r, a.c, unitB, shiftB);
  if (changeB) hpChanges.push(changeB);
  const hpLogB = makeHpLog(prefix, nameB, shiftB);
  if (hpLogB) logs.push(hpLogB);
  const fatalLogB = resolveFatalLog(prefix, tplB, fatalB);
  if (fatalLogB) logs.push(fatalLogB);
  if ((unitB.currentHP ?? tplB?.hp ?? 0) <= 0 || fatalB?.dies) {
    const death = finalizeDeath(state, unitB, a.r, a.c);
    if (death) deaths.push(death);
  }

  return {
    ok: true,
    logs,
    hpChanges,
    deaths,
    swap: [
      { from: { ...a }, to: { ...b }, tplId: unitA.tplId, owner: unitA.owner },
      { from: { ...b }, to: { ...a }, tplId: unitB.tplId, owner: unitB.owner },
    ],
  };
}

export function moveUnitToCell(state, from, to, opts = {}) {
  if (!state?.board) {
    return { ok: false, reason: 'NO_BOARD', logs: [], hpChanges: [], deaths: [] };
  }
  const cellFrom = ensureCell(state, from?.r, from?.c);
  const cellTo = ensureCell(state, to?.r, to?.c);
  if (!cellFrom || !cellTo) {
    return { ok: false, reason: 'OUT_OF_BOUNDS', logs: [], hpChanges: [], deaths: [] };
  }
  if (cellTo.unit) {
    return { ok: false, reason: 'DEST_OCCUPIED', logs: [], hpChanges: [], deaths: [] };
  }
  const unit = cellFrom.unit;
  if (!unit) {
    return { ok: false, reason: 'MISSING_UNIT', logs: [], hpChanges: [], deaths: [] };
  }
  if (typeof opts.requireOwner === 'number' && unit.owner !== opts.requireOwner) {
    return { ok: false, reason: 'OWNER_MISMATCH', logs: [], hpChanges: [], deaths: [] };
  }

  const tpl = CARDS[unit.tplId];
  const name = tpl?.name || 'Существо';
  const prefix = opts.sourceName ? `${opts.sourceName}: ` : '';

  const elementFrom = cellFrom.element || null;
  const elementTo = cellTo.element || null;

  cellFrom.unit = null;
  cellTo.unit = unit;

  const logs = [`${prefix}${name} перемещён на (${to.r},${to.c}).`];
  const hpChanges = [];
  const deaths = [];

  const shift = applyFieldTransitionToUnit(unit, tpl, elementFrom, elementTo);
  const fatal = applyFieldFatalityCheck(unit, tpl, elementTo);
  const change = collectHpChange(to.r, to.c, unit, shift);
  if (change) hpChanges.push(change);
  const hpLog = makeHpLog(prefix, name, shift);
  if (hpLog) logs.push(hpLog);
  const fatalLog = resolveFatalLog(prefix, tpl, fatal);
  if (fatalLog) logs.push(fatalLog);
  if ((unit.currentHP ?? tpl?.hp ?? 0) <= 0 || fatal?.dies) {
    const death = finalizeDeath(state, unit, to.r, to.c);
    if (death) deaths.push(death);
  }

  return {
    ok: true,
    logs,
    hpChanges,
    deaths,
    move: { from: { ...from }, to: { ...to }, tplId: unit.tplId, owner: unit.owner },
  };
}

export default {
  swapUnits,
  moveUnitToCell,
};

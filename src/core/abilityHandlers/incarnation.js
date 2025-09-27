// Модуль обработки механики "Инкарнация"
import { CARDS } from '../cards.js';
import { buildDeathRecord } from '../utils/deaths.js';

function getTemplate(tplOrId) {
  if (!tplOrId) return null;
  if (typeof tplOrId === 'string') {
    return CARDS[tplOrId] || null;
  }
  if (tplOrId.id && CARDS[tplOrId.id]) {
    return CARDS[tplOrId.id];
  }
  if (tplOrId.tplId && CARDS[tplOrId.tplId]) {
    return CARDS[tplOrId.tplId];
  }
  return tplOrId || null;
}

function cloneSacrificeInfo(unit, tpl, position) {
  if (!unit) return null;
  return {
    uid: unit.uid ?? null,
    tplId: unit.tplId ?? null,
    owner: unit.owner,
    position: position ? { r: position.r, c: position.c } : null,
    tplName: tpl?.name || null,
    tplCost: tpl?.cost ?? null,
  };
}

export function isIncarnationCard(tpl) {
  return !!(tpl && tpl.incarnation);
}

export function evaluateIncarnationSummon(state, context = {}) {
  const { r, c, tpl, owner } = context;
  const template = getTemplate(tpl);
  if (!template || !template.incarnation) {
    return { ok: false, reason: 'NOT_INCARNATION' };
  }
  const board = state?.board;
  if (!board || typeof r !== 'number' || typeof c !== 'number') {
    return { ok: false, reason: 'INVALID_POSITION' };
  }
  const cell = board?.[r]?.[c];
  const hostUnit = cell?.unit;
  if (!hostUnit) {
    return { ok: false, reason: 'NO_HOST' };
  }
  const controller = hostUnit.owner;
  if (typeof owner === 'number' && controller !== owner) {
    return { ok: false, reason: 'NOT_ALLY' };
  }
  const hostTpl = getTemplate(hostUnit.tplId);
  const hostCost = hostTpl?.cost ?? 0;
  const newCost = template.cost ?? 0;
  const diff = Math.max(0, newCost - hostCost);
  return {
    ok: true,
    cost: diff,
    sacrifice: cloneSacrificeInfo(hostUnit, hostTpl, { r, c }),
  };
}

export function applyIncarnationSummon(state, context = {}) {
  const { r, c, tpl, owner } = context;
  const check = evaluateIncarnationSummon(state, { r, c, tpl, owner });
  if (!check.ok) return { ok: false, reason: check.reason };
  const board = state?.board;
  const cell = board?.[r]?.[c];
  const removedUnit = cell?.unit || null;
  const removedTpl = getTemplate(removedUnit?.tplId);
  const deathInfo = removedUnit
    ? [buildDeathRecord(state, r, c, removedUnit)].filter(Boolean)
    : null;
  if (cell) cell.unit = null;
  return {
    ok: true,
    cost: check.cost,
    sacrifice: cloneSacrificeInfo(removedUnit, removedTpl, { r, c }),
    death: deathInfo,
  };
}

// Логика применения fieldquake-эффектов от способностей существ
// Модуль содержит только игровую логику и не зависит от визуального слоя,
// что позволит переиспользовать его при миграции на Unity.

import { CARDS } from '../cards.js';
import { computeFieldquakeLockedCells } from '../fieldLocks.js';
import { applyFieldTransitionToUnit } from '../fieldEffects.js';
import { applyFieldFatalityCheck, describeFieldFatality } from './fieldHazards.js';
import { buildDeathRecord } from '../utils/deaths.js';
import { applyDeathDiscardEffects } from './discard.js';
import { refreshContinuousPossessions } from './possession.js';

const BOARD_SIZE = 3;
const inBounds = (r, c) => r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;

const OPPOSITE = {
  FIRE: 'WATER',
  WATER: 'FIRE',
  EARTH: 'FOREST',
  FOREST: 'EARTH',
};

function resolveNextElement(prev) {
  if (!prev) return prev || null;
  const normalized = String(prev).toUpperCase();
  return OPPOSITE[normalized] || normalized;
}

function resolveSourceInfo(opts = {}) {
  const raw = opts.source || {};
  const tplId = raw.tplId || null;
  const tpl = tplId ? CARDS[tplId] : null;
  const name = raw.name || tpl?.name || null;
  const owner = raw.owner != null ? raw.owner : null;
  return { tplId, name, owner };
}

function pushUnique(target = [], items = []) {
  if (!Array.isArray(target) || !Array.isArray(items)) return target;
  return target.concat(items.filter(Boolean));
}

export function applyFieldquakeAt(state, r, c, opts = {}) {
  const result = {
    success: false,
    reason: null,
    r,
    c,
    prevElement: null,
    nextElement: null,
    hpShift: null,
    logs: [],
    manaSteals: [],
    manaGains: [],
    possessions: [],
    releases: [],
    repositions: [],
    deaths: [],
  };

  if (!state?.board || !inBounds(r, c)) {
    result.reason = 'OUT_OF_BOUNDS';
    return result;
  }

  const cell = state.board?.[r]?.[c];
  if (!cell) {
    result.reason = 'NO_CELL';
    return result;
  }

  const prevElement = cell.element || null;
  result.prevElement = prevElement;
  if (!prevElement) {
    result.reason = 'NO_ELEMENT';
    return result;
  }
  if (prevElement === 'BIOLITH') {
    result.reason = 'IMMUNE';
    return result;
  }

  const locked = Array.isArray(opts.lockedCells)
    ? opts.lockedCells
    : computeFieldquakeLockedCells(state);
  if (locked.some(pos => pos?.r === r && pos?.c === c)) {
    result.reason = 'LOCKED';
    return result;
  }

  const nextElement = resolveNextElement(prevElement);
  if (!nextElement || nextElement === prevElement) {
    result.reason = 'NO_CHANGE';
    return result;
  }

  cell.element = nextElement;
  result.nextElement = nextElement;
  result.success = true;

  const source = resolveSourceInfo(opts);
  if (source.name) {
    result.logs.push(`${source.name}: fieldquake (${r + 1},${c + 1}) ${prevElement}→${nextElement}.`);
  }

  const unit = cell.unit || null;
  if (unit) {
    const tpl = CARDS[unit.tplId];
    const shift = applyFieldTransitionToUnit(unit, tpl, prevElement, nextElement);
    if (shift) {
      result.hpShift = {
        tplId: tpl?.id || unit.tplId,
        owner: unit.owner ?? null,
        before: shift.beforeHp,
        after: shift.afterHp,
        delta: shift.deltaHp,
      };
    }
    const hazard = applyFieldFatalityCheck(unit, tpl, nextElement);
    if (hazard?.dies) {
      const fatalLog = describeFieldFatality(tpl, hazard, { name: tpl?.name });
      if (fatalLog) result.logs.push(fatalLog);
    }
    const alive = (unit.currentHP ?? tpl?.hp ?? 0) > 0;
    if (!alive) {
      const death = buildDeathRecord(state, r, c, unit);
      if (death) {
        result.deaths.push(death);
      }
      cell.unit = null;
      if (!opts.skipManaGain) {
        const owner = death?.owner ?? unit.owner;
        if (owner != null && state.players?.[owner]) {
          const pl = state.players[owner];
          const before = Number.isFinite(pl.mana) ? pl.mana : 0;
          const after = Math.min(10, before + 1);
          pl.mana = after;
          result.manaGains.push({ owner, before, after, r, c });
        }
      }
    }
  }

  if (result.deaths.length) {
    const discardEffects = applyDeathDiscardEffects(state, result.deaths, {
      cause: opts.cause || 'FIELDQUAKE',
    });
    if (Array.isArray(discardEffects?.logs) && discardEffects.logs.length) {
      result.logs.push(...discardEffects.logs);
    }
    if (Array.isArray(discardEffects?.manaSteals) && discardEffects.manaSteals.length) {
      result.manaSteals = pushUnique(result.manaSteals, discardEffects.manaSteals);
    }
    if (Array.isArray(discardEffects?.repositions) && discardEffects.repositions.length) {
      result.repositions = pushUnique(result.repositions, discardEffects.repositions);
    }
  }

  const continuous = refreshContinuousPossessions(state);
  if (Array.isArray(continuous?.possessions) && continuous.possessions.length) {
    result.possessions = pushUnique(result.possessions, continuous.possessions);
  }
  if (Array.isArray(continuous?.releases) && continuous.releases.length) {
    result.releases = pushUnique(result.releases, continuous.releases);
  }

  return result;
}

export default {
  applyFieldquakeAt,
};

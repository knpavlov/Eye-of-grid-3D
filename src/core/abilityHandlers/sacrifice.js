// Модуль обработки способности "жертвоприношение" для кубов и похожих карт
import { CARDS } from '../cards.js';
import { computeCellBuff } from '../fieldEffects.js';
import { applyFieldFatalityCheck as applyFieldFatalityCheckInternal } from './fieldHazards.js';
import { applyDeathDiscardEffects } from './discard.js';

const FACING_ORDER = ['N', 'E', 'S', 'W'];

function isValidFacing(facing) {
  return FACING_ORDER.includes(facing);
}

function isCubicTemplate(tpl) {
  if (!tpl) return false;
  const id = typeof tpl.id === 'string' ? tpl.id : (tpl.tplId || '');
  const name = typeof tpl.name === 'string' ? tpl.name : '';
  const idUpper = id.toUpperCase();
  const nameUpper = name.toUpperCase();
  return idUpper.includes('CUBIC') || nameUpper.includes('CUBIC');
}

function normalizeElements(entry, tpl) {
  const raw = entry?.elements || entry?.element;
  if (!raw && tpl?.element) {
    return new Set([String(tpl.element).toUpperCase()]);
  }
  const values = Array.isArray(raw) ? raw : [raw];
  const set = new Set();
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) {
      set.add(v.trim().toUpperCase());
    }
  }
  return set;
}

function normalizeSacrificeEntry(entry, tpl) {
  if (!entry) return null;
  const allowAnyElement = entry.allowAnyElement === true;
  const elements = allowAnyElement ? null : normalizeElements(entry, tpl);
  if (!allowAnyElement && (!elements || !elements.size)) return null;
  return {
    key: 'SACRIFICE_TRANSFORM',
    label: entry.label || 'Sacrifice',
    prompt: entry.prompt || 'Select a unit card in hand for the sacrifice',
    elements,
    allowAnyElement,
    requireNonCubic: entry.requireNonCubic !== false,
  };
}

function collectCandidates(hand, config) {
  if (!Array.isArray(hand)) return [];
  const result = [];
  const allowAnyElement = config.allowAnyElement || !config.elements || config.elements.size === 0;
  for (let i = 0; i < hand.length; i += 1) {
    const card = hand[i];
    if (!card || card.type !== 'UNIT') continue;
    const tpl = CARDS[card.id] || card;
    if (!tpl) continue;
    if (config.requireNonCubic && isCubicTemplate(tpl)) continue;
    if (!allowAnyElement) {
      const el = String(tpl.element || '').toUpperCase();
      if (!config.elements.has(el)) continue;
    }
    result.push({ handIdx: i, tplId: tpl.id, name: tpl.name || tpl.id });
  }
  return result;
}

export function collectSacrificeActions(state, context = {}) {
  const { unit, tpl, r, c } = context;
  const actions = [];
  if (!state || !unit || !tpl) return actions;
  const entries = Array.isArray(tpl.unitActions) ? tpl.unitActions : [];
  for (const entry of entries) {
    if (!entry) continue;
    const key = entry.key || entry.type;
    if (key !== 'SACRIFICE_TRANSFORM') continue;
    const config = normalizeSacrificeEntry(entry, tpl);
    if (!config) continue;
    const owner = unit.owner;
    const player = state.players?.[owner];
    const candidates = collectCandidates(player?.hand, config);
    actions.push({
      type: 'SACRIFICE_TRANSFORM',
      label: config.label,
      prompt: config.prompt,
      requiresHandSelection: true,
      requiresOrientation: true,
      available: candidates.length > 0,
      unavailableReason: candidates.length === 0 ? 'No matching unit in hand' : null,
      candidates,
      config,
      owner,
      r,
      c,
      unitUid: unit.uid ?? null,
    });
  }
  return actions;
}

function ensureCollection(arr) {
  return Array.isArray(arr) ? arr : [];
}

function getTemplateRef(raw) {
  if (!raw) return null;
  if (raw.id && CARDS[raw.id]) return CARDS[raw.id];
  if (raw.tplId && CARDS[raw.tplId]) return CARDS[raw.tplId];
  if (raw.id && !CARDS[raw.id]) return raw;
  return raw;
}

export function executeSacrificeAction(state, action = {}, payload = {}) {
  if (!state || !state.board) {
    return { ok: false, reason: 'NO_STATE' };
  }
  if (!action || action.type !== 'SACRIFICE_TRANSFORM') {
    return { ok: false, reason: 'INVALID_ACTION' };
  }
  const { r, c, owner, config } = action;
  if (typeof r !== 'number' || typeof c !== 'number') {
    return { ok: false, reason: 'INVALID_POSITION' };
  }
  const cell = state.board?.[r]?.[c];
  if (!cell || !cell.unit) {
    return { ok: false, reason: 'NO_UNIT' };
  }
  const unit = cell.unit;
  if (typeof owner === 'number' && unit.owner !== owner) {
    return { ok: false, reason: 'UNIT_OWNER_CHANGED' };
  }
  const player = state.players?.[unit.owner];
  if (!player) {
    return { ok: false, reason: 'NO_PLAYER' };
  }
  const handIdx = payload.handIdx;
  if (typeof handIdx !== 'number' || handIdx < 0 || handIdx >= ensureCollection(player.hand).length) {
    return { ok: false, reason: 'INVALID_HAND_INDEX' };
  }
  const facing = payload.facing;
  if (!isValidFacing(facing)) {
    return { ok: false, reason: 'INVALID_FACING' };
  }
  const uidFn = typeof payload.uidFn === 'function'
    ? payload.uidFn
    : (() => Math.random().toString(36).slice(2, 9));

  const rawCard = player.hand[handIdx];
  const summonTpl = getTemplateRef(rawCard);
  if (!summonTpl || summonTpl.type !== 'UNIT') {
    return { ok: false, reason: 'INVALID_CARD' };
  }
  if (config && config.requireNonCubic && isCubicTemplate(summonTpl)) {
    return { ok: false, reason: 'TARGET_IS_CUBIC' };
  }
  if (config && !config.allowAnyElement) {
    const el = String(summonTpl.element || '').toUpperCase();
    if (!config.elements.has(el)) {
      return { ok: false, reason: 'INVALID_ELEMENT' };
    }
  }

  const currentUnit = cell?.unit || null;
  const sacrificeTpl = getTemplateRef(currentUnit);
  const graveyard = Array.isArray(player.graveyard) ? player.graveyard : (player.graveyard = []);
  if (sacrificeTpl) {
    graveyard.push(sacrificeTpl);
  }

  // Удаляем существо с клетки до появления нового
  const sacrificeDeath = currentUnit
    ? [{ r, c, owner: currentUnit.owner, tplId: currentUnit.tplId, uid: currentUnit.uid ?? null, element: cell?.element || null }]
    : null;
  cell.unit = null;

  let discardEvents = null;
  if (sacrificeDeath) {
    discardEvents = applyDeathDiscardEffects(state, sacrificeDeath, { cause: 'SACRIFICE' });
  }

  // Удаляем карту из руки и переносим в сброс
  const discard = Array.isArray(player.discard) ? player.discard : (player.discard = []);
  discard.push(summonTpl);
  player.hand.splice(handIdx, 1);

  // Создаём нового юнита на поле
  const newUnit = {
    uid: uidFn(),
    owner: unit.owner,
    tplId: summonTpl.id,
    currentHP: summonTpl.hp,
    facing,
    lastAttackTurn: state.turn ?? 0,
  };
  cell.unit = newUnit;

  const result = {
    ok: true,
    type: 'SACRIFICE_TRANSFORM',
    owner: unit.owner,
    r,
    c,
    unitUid: newUnit.uid,
    sacrifice: {
      tplId: sacrificeTpl?.id ?? unit.tplId ?? null,
      tplName: sacrificeTpl?.name || null,
    },
    replacement: {
      tplId: summonTpl.id,
      tplName: summonTpl.name || summonTpl.id,
      facing,
      alive: true,
    },
    removedHandIdx: handIdx,
    events: {},
  };

  if (discardEvents && Array.isArray(discardEvents.logs) && discardEvents.logs.length) {
    result.events.discardLogs = discardEvents.logs.slice();
  }

  const cellElement = cell.element || null;
  const buff = computeCellBuff(cellElement, summonTpl.element);
  if (buff.hp !== 0) {
    const before = newUnit.currentHP;
    newUnit.currentHP = Math.max(0, before + buff.hp);
    result.replacement.buff = {
      element: cellElement,
      amount: buff.hp,
      before,
      after: newUnit.currentHP,
    };
  }

  let alive = newUnit.currentHP > 0;
  let deathReason = null;
  let deathInfo = null;
  if (alive) {
    const hazard = applyFieldFatalityCheckInternal(newUnit, summonTpl, cellElement);
    if (hazard.dies) {
      alive = false;
      deathReason = hazard.reason;
      deathInfo = hazard;
    }
  }

  if (!alive) {
    result.replacement.alive = false;
    result.replacement.deathReason = deathReason;
    if (deathInfo) {
      result.replacement.deathInfo = deathInfo;
    }
    const tplDeath = getTemplateRef(summonTpl);
    graveyard.push(tplDeath);
    cell.unit = null;
    const replacementDeath = [{ r, c, owner: newUnit.owner, tplId: summonTpl.id, uid: newUnit.uid ?? null, element: cell?.element || null }];

    if (summonTpl.onDeathAddHPAll) {
      const amount = summonTpl.onDeathAddHPAll;
      for (let rr = 0; rr < 3; rr += 1) {
        for (let cc = 0; cc < 3; cc += 1) {
          if (rr === r && cc === c) continue;
          const ally = state.board?.[rr]?.[cc]?.unit;
          if (!ally || ally.owner !== newUnit.owner) continue;
          const allyTpl = getTemplateRef(ally);
          if (!allyTpl) continue;
          const allyCellElement = state.board?.[rr]?.[cc]?.element || null;
          const allyBuff = computeCellBuff(allyCellElement, allyTpl.element);
          ally.bonusHP = (ally.bonusHP || 0) + amount;
          const maxHp = (allyTpl.hp || 0) + allyBuff.hp + (ally.bonusHP || 0);
          const beforeHp = typeof ally.currentHP === 'number' ? ally.currentHP : allyTpl.hp || 0;
          ally.currentHP = Math.min(maxHp, beforeHp + amount);
        }
      }
      result.events.oracleBuff = { owner: newUnit.owner, amount };
    }

    const discardReplacement = applyDeathDiscardEffects(state, replacementDeath, { cause: 'SACRIFICE_REPLACEMENT' });
    if (discardReplacement && Array.isArray(discardReplacement.logs) && discardReplacement.logs.length) {
      result.events.discardLogs = (result.events.discardLogs || []).concat(discardReplacement.logs);
    }
  }

  return result;
}

export default { collectSacrificeActions, executeSacrificeAction };

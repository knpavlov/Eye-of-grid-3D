// Модуль обработки перемещений существ после атаки
// Логика вынесена отдельно, чтобы облегчить переиспользование при миграции
// и не смешивать механику с визуализацией.

import { CARDS } from '../cards.js';
import { applyFieldTransitionToUnit } from '../fieldEffects.js';
import { inBounds } from '../constants.js';

function toArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizeElements(value) {
  const set = new Set();
  for (const raw of toArray(value)) {
    if (typeof raw === 'string' && raw) {
      set.add(raw.toUpperCase());
    }
  }
  return set;
}

function normalizeSwapConfig(tpl) {
  if (!tpl) return null;
  if (tpl.swapWithTargetOnElement) {
    const elements = normalizeElements(tpl.swapWithTargetOnElement);
    if (elements.size) {
      return { type: 'ELEMENT', elements };
    }
    return null;
  }
  if (tpl.swapOnDamageElements) {
    const elements = normalizeElements(tpl.swapOnDamageElements);
    if (elements.size) {
      return { type: 'ELEMENT', elements };
    }
    return null;
  }
  const swapOnDamage = tpl.swapOnDamage;
  if (swapOnDamage === true) {
    return { type: 'ANY' };
  }
  if (typeof swapOnDamage === 'string') {
    if (swapOnDamage.toUpperCase() === 'ANY') {
      return { type: 'ANY' };
    }
    const elements = normalizeElements(swapOnDamage);
    if (elements.size) return { type: 'ELEMENT', elements };
  }
  if (Array.isArray(swapOnDamage)) {
    const elements = normalizeElements(swapOnDamage);
    if (elements.size) return { type: 'ELEMENT', elements };
  }
  if (tpl.switchOnDamage) {
    if (tpl.switchOnDamage === true) {
      const elements = normalizeElements(tpl.element);
      if (elements.size) {
        return { type: 'ELEMENT', elements };
      }
    } else if (typeof tpl.switchOnDamage === 'string') {
      if (tpl.switchOnDamage.toUpperCase() === 'ANY') {
        return { type: 'ANY' };
      }
      const elements = normalizeElements(tpl.switchOnDamage);
      if (elements.size) return { type: 'ELEMENT', elements };
    }
  }
  return null;
}

function shouldSwap(config, cellElement) {
  if (!config) return false;
  if (config.type === 'ANY') return true;
  if (config.type === 'ELEMENT') {
    const el = typeof cellElement === 'string' ? cellElement.toUpperCase() : '';
    return config.elements.has(el);
  }
  return false;
}

function normalizePushConfig(tpl) {
  if (!tpl?.pushTargetOnDamage) return null;
  const raw = tpl.pushTargetOnDamage;
  if (raw === false) return null;
  if (raw === true) return { distance: 1, requireEmpty: true };
  if (typeof raw === 'number') {
    return { distance: Math.max(1, Math.floor(raw)), requireEmpty: true };
  }
  if (typeof raw === 'object') {
    const distance = raw.distance != null ? Math.max(1, Math.floor(raw.distance)) : 1;
    const requireEmpty = raw.requireEmpty !== false;
    return { distance, requireEmpty };
  }
  return null;
}

function computeStep(attackerPos, targetPos) {
  if (!attackerPos || !targetPos) return null;
  const drRaw = (targetPos.r ?? 0) - (attackerPos.r ?? 0);
  const dcRaw = (targetPos.c ?? 0) - (attackerPos.c ?? 0);
  const dr = Math.sign(drRaw);
  const dc = Math.sign(dcRaw);
  if ((dr !== 0 && dc !== 0) || (dr === 0 && dc === 0)) return null;
  return { dr, dc };
}

function computePushDestination(state, attackerPos, targetCell, cfg) {
  const step = computeStep(attackerPos, targetCell);
  if (!step) return null;
  const distance = cfg.distance || 1;
  const destR = targetCell.r + step.dr * distance;
  const destC = targetCell.c + step.dc * distance;
  if (!inBounds(destR, destC)) return null;
  const destCell = state.board?.[destR]?.[destC];
  if (!destCell) return null;
  if (cfg.requireEmpty !== false && destCell.unit) return null;
  return { r: destR, c: destC };
}

function describeFieldShift(shift, name) {
  if (!shift) return null;
  const fieldLabel = shift.nextElement ? `поле ${shift.nextElement}` : 'нейтральное поле';
  const prev = shift.beforeHp;
  const next = shift.afterHp;
  if (shift.deltaHp > 0) {
    return `${name} усиливается на ${fieldLabel}: HP ${prev}→${next}.`;
  }
  if (shift.deltaHp < 0) {
    return `${name} теряет силу на ${fieldLabel}: HP ${prev}→${next}.`;
  }
  return null;
}

function directionLabel(fromR, fromC, toR, toC) {
  const dr = (toR ?? 0) - (fromR ?? 0);
  const dc = (toC ?? 0) - (fromC ?? 0);
  if (dr === -1 && dc === 0) return 'на север';
  if (dr === 1 && dc === 0) return 'на юг';
  if (dr === 0 && dc === 1) return 'на восток';
  if (dr === 0 && dc === -1) return 'на запад';
  return '';
}

export function getUnitUid(unit) {
  return (unit && unit.uid != null) ? unit.uid : null;
}

export function findUnitRef(state, ref = {}) {
  if (!state?.board) return { unit: null, r: null, c: null };
  const { uid, r, c } = ref || {};
  if (uid != null) {
    for (let rr = 0; rr < 3; rr++) {
      for (let cc = 0; cc < 3; cc++) {
        const unit = state.board?.[rr]?.[cc]?.unit;
        if (unit && getUnitUid(unit) === uid) {
          return { unit, r: rr, c: cc };
        }
      }
    }
  }
  if (typeof r === 'number' && typeof c === 'number') {
    const unit = state.board?.[r]?.[c]?.unit || null;
    return { unit, r, c };
  }
  return { unit: null, r: null, c: null };
}

export function evaluateSwapOnDamage(options = {}) {
  const { tpl, attackerRef, targetUnit, targetTpl, targetCell, alreadySwapped } = options;
  if (!tpl || !targetUnit || !targetTpl || !targetCell || alreadySwapped) {
    return { event: null, triggered: false };
  }
  const cfg = normalizeSwapConfig(tpl);
  if (!cfg) return { event: null, triggered: false };
  if (!shouldSwap(cfg, targetCell.element)) {
    return { event: null, triggered: false };
  }
  const event = {
    type: 'SWAP_POSITIONS',
    attacker: attackerRef ? { ...attackerRef } : null,
    target: {
      uid: getUnitUid(targetUnit),
      r: targetCell.r,
      c: targetCell.c,
      tplId: targetTpl?.id ?? targetUnit.tplId ?? null,
    },
  };
  return { event, triggered: true };
}

export function evaluatePushOnDamage(options = {}) {
  const { state, tpl, attackerPos, attackerRef, targetUnit, targetTpl, targetCell } = options;
  if (!state || !tpl || !attackerPos || !targetUnit || !targetTpl || !targetCell) return null;
  const cfg = normalizePushConfig(tpl);
  if (!cfg) return null;
  const dest = computePushDestination(state, attackerPos, targetCell, cfg);
  if (!dest) return null;
  return {
    type: 'PUSH_TARGET',
    attacker: attackerRef ? { ...attackerRef } : null,
    target: {
      uid: getUnitUid(targetUnit),
      r: targetCell.r,
      c: targetCell.c,
      tplId: targetTpl?.id ?? targetUnit.tplId ?? null,
    },
    dest,
    requireEmpty: cfg.requireEmpty !== false,
  };
}

function resolveSwap(state, event) {
  const logs = [];
  const attacker = findUnitRef(state, event.attacker);
  const target = findUnitRef(state, event.target);
  if (!attacker.unit || !target.unit) return { logLines: logs };
  const tplAttacker = CARDS[attacker.unit.tplId];
  const tplTarget = CARDS[target.unit.tplId];
  const aliveAttacker = (attacker.unit.currentHP ?? tplAttacker?.hp ?? 0) > 0;
  const aliveTarget = (target.unit.currentHP ?? tplTarget?.hp ?? 0) > 0;
  if (!aliveAttacker || !aliveTarget) return { logLines: logs };
  const attackerCell = state.board?.[attacker.r]?.[attacker.c];
  const targetCell = state.board?.[target.r]?.[target.c];
  if (!attackerCell || !targetCell) return { logLines: logs };
  const attackerPrevElement = attackerCell.element || null;
  const targetPrevElement = targetCell.element || null;
  const attackerUnit = attacker.unit;
  const targetUnit = target.unit;
  attackerCell.unit = targetUnit;
  targetCell.unit = attackerUnit;
  const attackerName = tplAttacker?.name || 'Атакующий';
  const targetName = tplTarget?.name || 'Цель';
  logs.push(`${attackerName} меняется местами с ${targetName}.`);
  const shiftAttacker = applyFieldTransitionToUnit(
    attackerUnit,
    tplAttacker,
    attackerPrevElement,
    targetPrevElement,
  );
  const shiftTarget = applyFieldTransitionToUnit(
    targetUnit,
    tplTarget,
    targetPrevElement,
    attackerPrevElement,
  );
  const attackerLog = describeFieldShift(shiftAttacker, attackerName);
  if (attackerLog) logs.push(attackerLog);
  const targetLog = describeFieldShift(shiftTarget, targetName);
  if (targetLog) logs.push(targetLog);
  return { attackerPosUpdate: { r: target.r, c: target.c }, logLines: logs };
}

function resolvePush(state, event) {
  const logs = [];
  const target = findUnitRef(state, event.target);
  if (!target.unit) return { logLines: logs };
  const tplTarget = CARDS[target.unit.tplId];
  const aliveTarget = (target.unit.currentHP ?? tplTarget?.hp ?? 0) > 0;
  if (!aliveTarget) return { logLines: logs };
  const dest = event.dest;
  if (!dest || !inBounds(dest.r, dest.c)) return { logLines: logs };
  const fromCell = state.board?.[target.r]?.[target.c];
  const destCell = state.board?.[dest.r]?.[dest.c];
  if (!fromCell || !destCell) return { logLines: logs };
  if (destCell.unit) return { logLines: logs };
  const attacker = event.attacker ? findUnitRef(state, event.attacker) : { unit: null };
  const tplAttacker = attacker.unit ? CARDS[attacker.unit.tplId] : null;
  const attackerName = tplAttacker?.name || 'Атакующий';
  const targetName = tplTarget?.name || 'Цель';
  const dirText = directionLabel(target.r, target.c, dest.r, dest.c);
  fromCell.unit = null;
  destCell.unit = target.unit;
  logs.push(`${attackerName} отбрасывает ${targetName}${dirText ? ` ${dirText}` : ''}.`);
  const shiftTarget = applyFieldTransitionToUnit(
    target.unit,
    tplTarget,
    fromCell.element || null,
    destCell.element || null,
  );
  const shiftLog = describeFieldShift(shiftTarget, targetName);
  if (shiftLog) logs.push(shiftLog);
  return { logLines: logs };
}

export function applyRepositionEvent(state, event) {
  if (!event || !state) return null;
  if (event.type === 'SWAP_POSITIONS') {
    return resolveSwap(state, event);
  }
  if (event.type === 'PUSH_TARGET') {
    return resolvePush(state, event);
  }
  return null;
}

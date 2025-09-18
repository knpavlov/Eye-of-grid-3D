// Логика позиционных эффектов при нанесении урона: обмен местами, поворот и отбрасывание
// Модуль не зависит от визуализации и может использоваться в чистой логике игры

import { applyFieldTransitionToUnit } from '../fieldEffects.js';

const DIR_OFFSETS = {
  N: { dr: -1, dc: 0 },
  E: { dr: 0, dc: 1 },
  S: { dr: 1, dc: 0 },
  W: { dr: 0, dc: -1 },
};

function inBounds(r, c) {
  return r >= 0 && r < 3 && c >= 0 && c < 3;
}

function computeLinearDirection(from, to) {
  if (!from || !to) return null;
  const dr = (to.r ?? 0) - (from.r ?? 0);
  const dc = (to.c ?? 0) - (from.c ?? 0);
  if (dr < 0 && dc === 0) return 'N';
  if (dr > 0 && dc === 0) return 'S';
  if (dr === 0 && dc > 0) return 'E';
  if (dr === 0 && dc < 0) return 'W';
  return null;
}

function normalizeSwapConfig(tpl, helpers = {}) {
  if (!tpl) return null;
  const { normalizeElements = () => new Set() } = helpers;
  const elements = normalizeElements(
    tpl.swapWithTargetOnElement || (tpl.switchOnDamage ? tpl.element : null)
  );
  if (tpl.swapWithTargetOnDamage) {
    return { mode: 'ALWAYS' };
  }
  if (elements.size) {
    return { mode: 'ELEMENTS', elements };
  }
  return null;
}

function normalizePushConfig(value) {
  if (!value) return null;
  if (value === true) {
    return { distance: 1, requireEmpty: true };
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const dist = Math.max(1, Math.floor(Math.abs(value)));
    return { distance: dist, requireEmpty: true };
  }
  if (typeof value === 'object') {
    const distRaw = Number(value.distance ?? value.steps ?? 1);
    const dist = Math.max(1, Math.floor(Math.abs(distRaw)));
    const requireEmpty = value.requireEmpty !== false;
    return { distance: dist, requireEmpty };
  }
  return null;
}

export function collectDamagePositioningEffects(state, context = {}, helpers = {}) {
  const result = { events: [], preventRetaliation: new Set() };
  if (!state?.board) return result;
  const {
    hits = [],
    tpl,
    attackerRef,
    attackerPos,
    attackerUnit,
  } = context;
  if (!tpl || !attackerUnit || !Array.isArray(hits) || !hits.length) return result;

  const {
    normalizeElements = () => new Set(),
    getUnitTemplate = () => null,
    getUnitUid = () => null,
  } = helpers;

  const swapCfg = normalizeSwapConfig(tpl, { normalizeElements });
  const pushCfg = normalizePushConfig(tpl.pushTargetOnDamage);
  const rotateEnabled = !!tpl.rotateTargetOnDamage;

  let swapHandled = false;

  for (const h of hits) {
    if (!h) continue;
    const key = `${h.r},${h.c}`;
    const dealt = h.dealt ?? h.dmg ?? 0;
    if (dealt <= 0) continue;
    const cell = state.board?.[h.r]?.[h.c];
    const target = cell?.unit;
    if (!target) continue;
    const tplTarget = getUnitTemplate(target);
    const alive = (target.currentHP ?? tplTarget?.hp ?? 0) > 0;
    if (!alive) continue;

    if (swapCfg && !swapHandled) {
      let allowSwap = false;
      if (swapCfg.mode === 'ALWAYS') {
        allowSwap = true;
      } else if (swapCfg.mode === 'ELEMENTS' && cell?.element) {
        allowSwap = swapCfg.elements.has(cell.element);
      }
      if (allowSwap) {
        result.events.push({
          type: 'SWAP_POSITIONS',
          attacker: attackerRef,
          target: { uid: getUnitUid(target), r: h.r, c: h.c, tplId: tplTarget?.id },
        });
        result.preventRetaliation.add(key);
        swapHandled = true;
      }
    }

    if (rotateEnabled) {
      result.events.push({
        type: 'ROTATE_TARGET',
        target: { uid: getUnitUid(target), r: h.r, c: h.c, tplId: tplTarget?.id },
        faceAwayFrom: attackerRef,
      });
      result.preventRetaliation.add(key);
    }

    if (pushCfg) {
      const direction = computeLinearDirection(attackerPos, { r: h.r, c: h.c });
      if (!direction) continue;
      const offset = DIR_OFFSETS[direction];
      if (!offset) continue;
      const destR = h.r + offset.dr * pushCfg.distance;
      const destC = h.c + offset.dc * pushCfg.distance;
      if (!inBounds(destR, destC)) continue;
      const destCell = state.board?.[destR]?.[destC];
      if (pushCfg.requireEmpty && destCell?.unit) continue;
      result.events.push({
        type: 'PUSH_TARGET',
        attacker: attackerRef,
        target: { uid: getUnitUid(target), r: h.r, c: h.c, tplId: tplTarget?.id },
        to: { r: destR, c: destC },
        direction,
      });
      result.preventRetaliation.add(key);
    }
  }

  return result;
}

function describeFieldShift(shift, name) {
  if (!shift) return null;
  const fieldLabel = shift.nextElement ? `поле ${shift.nextElement}` : 'нейтральное поле';
  const { beforeHp: prev, afterHp: next } = shift;
  if (shift.deltaHp > 0) {
    return `${name} усиливается на ${fieldLabel}: HP ${prev}→${next}.`;
  }
  if (shift.deltaHp < 0) {
    return `${name} теряет силу на ${fieldLabel}: HP ${prev}→${next}.`;
  }
  return null;
}

function directionLabel(dir) {
  switch (dir) {
    case 'N': return 'на север';
    case 'S': return 'на юг';
    case 'E': return 'на восток';
    case 'W': return 'на запад';
    default: return 'в сторону';
  }
}

export function applyPositioningEvents(state, events = [], helpers = {}) {
  if (!state?.board || !Array.isArray(events) || !events.length) {
    return { attackerPosUpdate: null, logLines: [] };
  }

  const {
    findUnitRef = () => ({ unit: null, r: null, c: null }),
    getUnitTemplate = () => null,
    computeFacingAway = () => null,
  } = helpers;

  const logs = [];
  let attackerPosUpdate = null;

  for (const ev of events) {
    if (!ev || !ev.type) continue;
    if (ev.type === 'SWAP_POSITIONS') {
      const attacker = findUnitRef(ev.attacker);
      const target = findUnitRef(ev.target);
      if (!attacker.unit || !target.unit) continue;
      const tplAttacker = getUnitTemplate(attacker.unit);
      const tplTarget = getUnitTemplate(target.unit);
      const aliveAttacker = (attacker.unit.currentHP ?? tplAttacker?.hp ?? 0) > 0;
      const aliveTarget = (target.unit.currentHP ?? tplTarget?.hp ?? 0) > 0;
      if (!aliveAttacker || !aliveTarget) continue;
      const attackerPrevElement = state.board?.[attacker.r]?.[attacker.c]?.element || null;
      const targetPrevElement = state.board?.[target.r]?.[target.c]?.element || null;
      state.board[attacker.r][attacker.c].unit = target.unit;
      state.board[target.r][target.c].unit = attacker.unit;
      attackerPosUpdate = { r: target.r, c: target.c };
      const attackerName = tplAttacker?.name || 'Атакующий';
      const targetName = tplTarget?.name || 'Цель';
      logs.push(`${attackerName} меняется местами с ${targetName}.`);
      const shiftAttacker = applyFieldTransitionToUnit(
        attacker.unit,
        tplAttacker,
        attackerPrevElement,
        targetPrevElement,
      );
      const shiftTarget = applyFieldTransitionToUnit(
        target.unit,
        tplTarget,
        targetPrevElement,
        attackerPrevElement,
      );
      const attackerLog = describeFieldShift(shiftAttacker, attackerName);
      if (attackerLog) logs.push(attackerLog);
      const targetLog = describeFieldShift(shiftTarget, targetName);
      if (targetLog) logs.push(targetLog);
    } else if (ev.type === 'ROTATE_TARGET') {
      const target = findUnitRef(ev.target);
      if (!target.unit) continue;
      const tplTarget = getUnitTemplate(target.unit);
      const aliveTarget = (target.unit.currentHP ?? tplTarget?.hp ?? 0) > 0;
      if (!aliveTarget) continue;
      const attacker = findUnitRef(ev.faceAwayFrom);
      const facing = computeFacingAway(target, attacker);
      if (facing) {
        target.unit.facing = facing;
        const name = tplTarget?.name || 'Цель';
        logs.push(`${name} поворачивается спиной к атакующему.`);
      }
    } else if (ev.type === 'PUSH_TARGET') {
      const target = findUnitRef(ev.target);
      if (!target.unit) continue;
      const tplTarget = getUnitTemplate(target.unit);
      const aliveTarget = (target.unit.currentHP ?? tplTarget?.hp ?? 0) > 0;
      if (!aliveTarget) continue;
      const dest = ev.to || {};
      const destR = dest.r;
      const destC = dest.c;
      if (!inBounds(destR, destC)) continue;
      const destCell = state.board?.[destR]?.[destC];
      if (!destCell || destCell.unit) continue;
      const srcCell = state.board[target.r][target.c];
      const prevElement = srcCell?.element || null;
      const nextElement = destCell.element || null;
      state.board[target.r][target.c].unit = null;
      state.board[destR][destC].unit = target.unit;
      const targetName = tplTarget?.name || 'Цель';
      const dirLabel = directionLabel(ev.direction);
      logs.push(`${targetName} отбрасывается ${dirLabel}.`);
      const shift = applyFieldTransitionToUnit(
        target.unit,
        tplTarget,
        prevElement,
        nextElement,
      );
      const shiftLog = describeFieldShift(shift, targetName);
      if (shiftLog) logs.push(shiftLog);
    }
  }

  return { attackerPosUpdate, logLines: logs };
}

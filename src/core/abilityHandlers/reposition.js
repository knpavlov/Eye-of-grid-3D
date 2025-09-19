// Модуль, отвечающий за перемещения после нанесения урона (обмен местами, отталкивание)
// Держим здесь чистую логику без привязки к визуализации для дальнейшей миграции на другие движки.
import { CARDS } from '../cards.js';
import { applyFieldTransitionToUnit } from '../fieldEffects.js';

const BOARD_SIZE = 3;
const inBounds = (r, c) => r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;

function toElementSet(raw) {
  const set = new Set();
  if (!raw) return set;
  const list = Array.isArray(raw) ? raw : [raw];
  for (const val of list) {
    if (typeof val === 'string' && val.trim()) {
      set.add(val.trim().toUpperCase());
    }
  }
  return set;
}

function lookupUnit(state, ref = {}) {
  if (!state?.board) return { unit: null, r: null, c: null };
  const { uid, r, c } = ref || {};
  if (uid != null) {
    for (let rr = 0; rr < BOARD_SIZE; rr++) {
      for (let cc = 0; cc < BOARD_SIZE; cc++) {
        const unit = state.board?.[rr]?.[cc]?.unit;
        if (unit && unit.uid != null && unit.uid === uid) {
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

function describeFieldShift(shift, name) {
  if (!shift) return null;
  const fieldLabel = shift.nextElement ? `поле ${shift.nextElement}` : 'нейтральном поле';
  const prev = shift.beforeHp;
  const next = shift.afterHp;
  if (shift.deltaHp > 0) {
    return `${name} усиливается на ${fieldLabel}: HP ${prev}→${next}.`;
  }
  return `${name} теряет силу на ${fieldLabel}: HP ${prev}→${next}.`;
}

function normalizeSwapFlags(raw) {
  if (raw && typeof raw === 'object') {
    return {
      allowMultiple: !!raw.allowMultiple,
      preventRetaliation: raw.preventRetaliation !== false,
    };
  }
  return { allowMultiple: false, preventRetaliation: true };
}

export function normalizeSwapConfig(tpl) {
  if (!tpl) return null;
  if (tpl.swapWithTargetOnDamage) {
    const flags = normalizeSwapFlags(tpl.swapWithTargetOnDamage);
    return { type: 'ANY', ...flags };
  }
  const rawList = tpl.swapWithTargetOnElement || (tpl.switchOnDamage ? tpl.element : null);
  const elements = toElementSet(rawList);
  if (!elements.size) return null;
  const flags = normalizeSwapFlags({
    allowMultiple: !!tpl.swapWithTargetAllowMultiple,
    preventRetaliation: tpl.swapWithTargetPreventRetaliation !== false,
  });
  return { type: 'ELEMENT', elements, ...flags };
}

function normalizePushFlags(raw) {
  if (raw && typeof raw === 'object') {
    return {
      distance: Math.max(1, raw.distance || raw.steps || 1),
      preventRetaliation: raw.preventRetaliation !== false,
    };
  }
  if (typeof raw === 'number') {
    return { distance: Math.max(1, raw), preventRetaliation: true };
  }
  if (raw) {
    return { distance: 1, preventRetaliation: true };
  }
  return null;
}

export function normalizePushConfig(tpl) {
  if (!tpl || !tpl.pushTargetOnDamage) return null;
  return normalizePushFlags(tpl.pushTargetOnDamage);
}

export function planSwapOnDamage(state, context = {}) {
  const { attackerRef, targetUnit, targetPos, swapConfig } = context;
  if (!swapConfig || !state || !targetUnit || !targetPos) return null;
  const tplTarget = CARDS[targetUnit.tplId];
  const alive = (targetUnit.currentHP ?? tplTarget?.hp ?? 0) > 0;
  if (!alive) return null;
  if (swapConfig.type === 'ELEMENT') {
    const cellEl = state.board?.[targetPos.r]?.[targetPos.c]?.element;
    if (!cellEl || !swapConfig.elements?.has(cellEl)) return null;
  }
  const evt = {
    type: 'SWAP_POSITIONS',
    attacker: attackerRef,
    target: {
      uid: targetUnit.uid ?? null,
      r: targetPos.r,
      c: targetPos.c,
      tplId: targetUnit.tplId,
    },
  };
  return {
    event: evt,
    preventRetaliation: swapConfig.preventRetaliation !== false,
    consume: !swapConfig.allowMultiple,
  };
}

function computePushDestination(attackerPos, targetPos, distance = 1) {
  if (!attackerPos || !targetPos) return null;
  const drRaw = targetPos.r - attackerPos.r;
  const dcRaw = targetPos.c - attackerPos.c;
  const stepR = Math.sign(drRaw);
  const stepC = Math.sign(dcRaw);
  if (stepR === 0 && stepC === 0) return null;
  let destR = targetPos.r;
  let destC = targetPos.c;
  for (let i = 0; i < distance; i++) {
    destR += stepR;
    destC += stepC;
  }
  return { r: destR, c: destC };
}

export function planPushOnDamage(state, context = {}) {
  const { attackerRef, attackerPos, targetUnit, targetPos, pushConfig } = context;
  if (!pushConfig || !state || !attackerPos || !targetUnit || !targetPos) return null;
  const tplTarget = CARDS[targetUnit.tplId];
  const alive = (targetUnit.currentHP ?? tplTarget?.hp ?? 0) > 0;
  if (!alive) {
    return null;
  }
  const dest = computePushDestination(attackerPos, targetPos, pushConfig.distance || 1);
  const preventRetaliation = pushConfig.preventRetaliation !== false;
  if (!dest || !inBounds(dest.r, dest.c)) {
    return { event: null, preventRetaliation };
  }
  const cell = state.board?.[dest.r]?.[dest.c];
  if (!cell) {
    return { event: null, preventRetaliation };
  }
  const occupant = cell.unit;
  if (occupant) {
    const tplOcc = CARDS[occupant.tplId];
    const occAlive = (occupant.currentHP ?? tplOcc?.hp ?? 0) > 0;
    if (occAlive) {
      return { event: null, preventRetaliation };
    }
  }
  const evt = {
    type: 'PUSH_TARGET',
    attacker: attackerRef,
    target: {
      uid: targetUnit.uid ?? null,
      tplId: targetUnit.tplId,
    },
    from: { r: targetPos.r, c: targetPos.c },
    to: dest,
  };
  return { event: evt, preventRetaliation };
}

export function applyRepositionEvent(state, event) {
  if (!event || !state) return null;
  const logs = [];
  let attackerPosUpdate = null;
  if (event.type === 'SWAP_POSITIONS') {
    const attackerRef = lookupUnit(state, event.attacker);
    const targetRef = lookupUnit(state, event.target);
    if (!attackerRef.unit || !targetRef.unit) {
      return { attackerPosUpdate: null, logLines: [] };
    }
    const tplAttacker = CARDS[attackerRef.unit.tplId];
    const tplTarget = CARDS[targetRef.unit.tplId];
    const aliveAtt = (attackerRef.unit.currentHP ?? tplAttacker?.hp ?? 0) > 0;
    const aliveTarget = (targetRef.unit.currentHP ?? tplTarget?.hp ?? 0) > 0;
    if (!aliveAtt || !aliveTarget) {
      return { attackerPosUpdate: null, logLines: [] };
    }
    const attackerPrevElement = state.board?.[attackerRef.r]?.[attackerRef.c]?.element || null;
    const targetPrevElement = state.board?.[targetRef.r]?.[targetRef.c]?.element || null;
    state.board[attackerRef.r][attackerRef.c].unit = targetRef.unit;
    state.board[targetRef.r][targetRef.c].unit = attackerRef.unit;
    attackerPosUpdate = { r: targetRef.r, c: targetRef.c };
    const attackerName = tplAttacker?.name || 'Атакующий';
    const targetName = tplTarget?.name || 'Цель';
    logs.push(`${attackerName} меняется местами с ${targetName}.`);
    const shiftAttacker = applyFieldTransitionToUnit(
      attackerRef.unit,
      tplAttacker,
      attackerPrevElement,
      targetPrevElement,
    );
    const shiftTarget = applyFieldTransitionToUnit(
      targetRef.unit,
      tplTarget,
      targetPrevElement,
      attackerPrevElement,
    );
    const attackerLog = describeFieldShift(shiftAttacker, attackerName);
    if (attackerLog) logs.push(attackerLog);
    const targetLog = describeFieldShift(shiftTarget, targetName);
    if (targetLog) logs.push(targetLog);
    return { attackerPosUpdate, logLines: logs };
  }
  if (event.type === 'PUSH_TARGET') {
    const targetRef = lookupUnit(state, event.target);
    if (!targetRef.unit) {
      return { attackerPosUpdate: null, logLines: [] };
    }
    const tplTarget = CARDS[targetRef.unit.tplId];
    const aliveTarget = (targetRef.unit.currentHP ?? tplTarget?.hp ?? 0) > 0;
    if (!aliveTarget) {
      return { attackerPosUpdate: null, logLines: [] };
    }
    const fromCell = state.board?.[event.from?.r]?.[event.from?.c];
    const toCell = state.board?.[event.to?.r]?.[event.to?.c];
    if (!fromCell || !toCell) {
      return { attackerPosUpdate: null, logLines: [] };
    }
    if (fromCell.unit !== targetRef.unit) {
      return { attackerPosUpdate: null, logLines: [] };
    }
    const destOcc = toCell.unit;
    if (destOcc) {
      const tplOcc = CARDS[destOcc.tplId];
      const occAlive = (destOcc.currentHP ?? tplOcc?.hp ?? 0) > 0;
      if (occAlive) {
        return { attackerPosUpdate: null, logLines: [] };
      }
      toCell.unit = null;
    }
    const attackerRef = lookupUnit(state, event.attacker);
    const attackerName = attackerRef.unit ? (CARDS[attackerRef.unit.tplId]?.name || 'Атакующий') : 'Атакующий';
    const targetName = tplTarget?.name || 'Цель';
    toCell.unit = targetRef.unit;
    fromCell.unit = null;
    logs.push(`${attackerName} отталкивает ${targetName}.`);
    const shiftTarget = applyFieldTransitionToUnit(
      targetRef.unit,
      tplTarget,
      fromCell.element || null,
      toCell.element || null,
    );
    const targetLog = describeFieldShift(shiftTarget, targetName);
    if (targetLog) logs.push(targetLog);
    return { attackerPosUpdate: null, logLines: logs };
  }
  return null;
}

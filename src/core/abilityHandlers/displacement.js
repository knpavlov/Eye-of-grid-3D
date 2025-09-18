// Обработчики перемещений целей после нанесения урона
import { CARDS } from '../cards.js';
import { applyFieldTransitionToUnit } from '../fieldEffects.js';

const DIR_VECTORS = {
  N: { dr: -1, dc: 0 },
  E: { dr: 0, dc: 1 },
  S: { dr: 1, dc: 0 },
  W: { dr: 0, dc: -1 },
};

const OPPOSITE_DIR = { N: 'S', S: 'N', E: 'W', W: 'E' };

const inBounds = (r, c) => r >= 0 && r < 3 && c >= 0 && c < 3;

function toArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
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

export function getUnitUid(unit) {
  return unit && unit.uid != null ? unit.uid : null;
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

export function directionBetween(from, to) {
  if (!from || !to) return null;
  const dr = (to.r ?? 0) - (from.r ?? 0);
  const dc = (to.c ?? 0) - (from.c ?? 0);
  if (dc === 0 && dr < 0) return 'N';
  if (dc === 0 && dr > 0) return 'S';
  if (dr === 0 && dc > 0) return 'E';
  if (dr === 0 && dc < 0) return 'W';
  return null;
}

export function computeFacingAway(targetRef, attackerRef) {
  const dirToAttacker = directionBetween(targetRef, attackerRef);
  if (!dirToAttacker) return null;
  return OPPOSITE_DIR[dirToAttacker] || null;
}

function describeShift(shift, name) {
  if (!shift) return null;
  const fieldLabel = shift.nextElement ? `поле ${shift.nextElement}` : 'нейтральном поле';
  const prev = shift.beforeHp;
  const next = shift.afterHp;
  if (shift.deltaHp > 0) {
    return `${name} усиливается на ${fieldLabel}: HP ${prev}→${next}.`;
  }
  return `${name} теряет силу на ${fieldLabel}: HP ${prev}→${next}.`;
}

function resolveSwapConfig(tpl) {
  const config = { enabled: false, always: false, elements: new Set(), used: false };
  if (!tpl) return config;
  let always = Boolean(tpl.swapWithTargetOnDamage);
  const elements = normalizeElements(
    tpl.swapWithTargetOnElement || (tpl.switchOnDamage ? tpl.element : null)
  );
  if (elements.has('ANY')) {
    always = true;
    elements.delete('ANY');
  }
  config.enabled = always || elements.size > 0;
  config.always = always;
  config.elements = elements;
  return config;
}

function resolvePushConfig(tpl) {
  if (!tpl) return { enabled: false, distance: 0 };
  const raw = tpl.pushTargetOnDamage;
  if (!raw) return { enabled: false, distance: 0 };
  const distance = typeof raw === 'number' && Number.isFinite(raw) ? Math.max(1, Math.floor(raw)) : 1;
  return { enabled: distance > 0, distance };
}

export function evaluateDisplacementOnDamage(state, context = {}) {
  const result = { events: [], preventRetaliation: new Set() };
  const { attackerPos, attackerUnit, tpl, hits } = context;
  if (!state?.board || !tpl || !attackerUnit || !Array.isArray(hits) || !hits.length) {
    return result;
  }

  const swapCfg = resolveSwapConfig(tpl);
  const pushCfg = resolvePushConfig(tpl);
  if (!swapCfg.enabled && !pushCfg.enabled) {
    return result;
  }

  const attackerRef = {
    uid: getUnitUid(attackerUnit),
    tplId: tpl.id,
    r: attackerPos?.r,
    c: attackerPos?.c,
  };

  for (const h of hits) {
    if (!h) continue;
    const key = `${h.r},${h.c}`;
    const cell = state.board?.[h.r]?.[h.c];
    const target = cell?.unit;
    if (!target) continue;
    const tplTarget = CARDS[target.tplId];
    const alive = (target.currentHP ?? tplTarget?.hp ?? 0) > 0;
    if (!alive) continue;

    if (swapCfg.enabled && !swapCfg.used) {
      const fieldElement = cell?.element || null;
      if (swapCfg.always || (fieldElement && swapCfg.elements.has(fieldElement))) {
        result.events.push({
          type: 'SWAP_POSITIONS',
          attacker: attackerRef,
          target: { uid: getUnitUid(target), r: h.r, c: h.c, tplId: tplTarget?.id },
        });
        swapCfg.used = true;
        result.preventRetaliation.add(key);
      }
    }

    if (pushCfg.enabled) {
      const dir = attackerPos ? directionBetween(attackerPos, { r: h.r, c: h.c }) : null;
      if (dir && DIR_VECTORS[dir]) {
        let destR = h.r;
        let destC = h.c;
        let blocked = false;
        for (let step = 0; step < pushCfg.distance; step++) {
          destR += DIR_VECTORS[dir].dr;
          destC += DIR_VECTORS[dir].dc;
          if (!inBounds(destR, destC)) { blocked = true; break; }
          const destCell = state.board?.[destR]?.[destC];
          if (!destCell || destCell.unit) { blocked = true; break; }
        }
        if (!blocked) {
          result.events.push({
            type: 'PUSH_TARGET',
            attacker: attackerRef,
            target: { uid: getUnitUid(target), r: h.r, c: h.c, tplId: tplTarget?.id },
            from: { r: h.r, c: h.c },
            destination: { r: destR, c: destC },
            direction: dir,
          });
        }
      }
      result.preventRetaliation.add(key);
    }
  }

  return result;
}

export function applyDisplacementEvents(state, events = []) {
  if (!Array.isArray(events) || !events.length) {
    return { attackerPosUpdate: null, logLines: [], remainingEvents: [] };
  }

  const logs = [];
  let attackerPosUpdate = null;
  const remaining = [];

  for (const ev of events) {
    if (ev?.type === 'SWAP_POSITIONS') {
      const attacker = findUnitRef(state, ev.attacker);
      const target = findUnitRef(state, ev.target);
      if (!attacker.unit || !target.unit) continue;
      const aliveAttacker = (attacker.unit.currentHP ?? CARDS[attacker.unit.tplId]?.hp ?? 0) > 0;
      const aliveTarget = (target.unit.currentHP ?? CARDS[target.unit.tplId]?.hp ?? 0) > 0;
      if (!aliveAttacker || !aliveTarget) continue;

      const attackerUnit = attacker.unit;
      const targetUnit = target.unit;
      const tplAttacker = CARDS[attackerUnit.tplId];
      const tplTarget = CARDS[targetUnit.tplId];
      const attackerPrevElement = state.board?.[attacker.r]?.[attacker.c]?.element || null;
      const targetPrevElement = state.board?.[target.r]?.[target.c]?.element || null;

      state.board[attacker.r][attacker.c].unit = targetUnit;
      state.board[target.r][target.c].unit = attackerUnit;
      attackerPosUpdate = { r: target.r, c: target.c };

      const attackerName = tplAttacker?.name || 'Атакующий';
      const targetName = tplTarget?.name || 'Цель';
      logs.push(`${attackerName} меняется местами с ${targetName}.`);

      const shiftAttacker = applyFieldTransitionToUnit(attackerUnit, tplAttacker, attackerPrevElement, targetPrevElement);
      const shiftTarget = applyFieldTransitionToUnit(targetUnit, tplTarget, targetPrevElement, attackerPrevElement);
      const attackerLog = describeShift(shiftAttacker, attackerName);
      if (attackerLog) logs.push(attackerLog);
      const targetLog = describeShift(shiftTarget, targetName);
      if (targetLog) logs.push(targetLog);
    } else if (ev?.type === 'PUSH_TARGET') {
      const target = findUnitRef(state, ev.target);
      if (!target.unit) continue;
      const aliveTarget = (target.unit.currentHP ?? CARDS[target.unit.tplId]?.hp ?? 0) > 0;
      if (!aliveTarget) continue;
      const destR = ev.destination?.r;
      const destC = ev.destination?.c;
      if (typeof destR !== 'number' || typeof destC !== 'number') continue;
      if (!inBounds(destR, destC)) continue;
      const destCell = state.board?.[destR]?.[destC];
      if (!destCell || destCell.unit) continue;

      const fromElement = state.board[target.r][target.c]?.element || null;
      const toElement = destCell.element || null;

      state.board[destR][destC].unit = target.unit;
      state.board[target.r][target.c].unit = null;

      const tplTarget = CARDS[target.unit.tplId];
      const shift = applyFieldTransitionToUnit(target.unit, tplTarget, fromElement, toElement);

      const attacker = findUnitRef(state, ev.attacker);
      const attackerName = attacker.unit ? (CARDS[attacker.unit.tplId]?.name || 'Атакующий') : 'Атакующий';
      const targetName = tplTarget?.name || 'Цель';
      logs.push(`${attackerName} отбрасывает ${targetName}.`);
      const shiftLog = describeShift(shift, targetName);
      if (shiftLog) logs.push(shiftLog);
    } else {
      remaining.push(ev);
    }
  }

  return { attackerPosUpdate, logLines: logs, remainingEvents: remaining };
}

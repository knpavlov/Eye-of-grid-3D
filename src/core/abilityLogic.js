// Логика обработки уникальных способностей существ (чистая логика без визуала)
import { CARDS } from './cards.js';
import { countUnits } from './board.js';
import { resolveActiveAttackProfile } from './attackProfiles.js';

function countFieldsByElement(state, element) {
  let total = 0;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if (state.board?.[r]?.[c]?.element === element) total += 1;
    }
  }
  return total;
}

function ensurePossessionStruct(target, possessor, cellPos) {
  if (!target) return null;
  if (!possessor || !possessor.uid) return null;
  const original = target.possession?.originalOwner ?? target.owner;
  target.possession = {
    by: possessor.uid,
    controller: possessor.owner,
    originalOwner: original,
    source: { uid: possessor.uid, r: cellPos.r, c: cellPos.c },
    sinceTurn: null,
  };
  return target.possession;
}

function applyPossession(state, possessorUnit, possessorPos, targetPos) {
  const target = state.board?.[targetPos.r]?.[targetPos.c]?.unit;
  if (!target) return null;
  if (target.owner === possessorUnit.owner) return null;
  if (target.possession && target.possession.by === possessorUnit.uid) return null;
  if (target.possession && target.possession.by !== possessorUnit.uid) {
    // Не перекрываем чужое владение, чтобы избежать конфликтов
    return null;
  }
  const prevOwner = target.owner;
  ensurePossessionStruct(target, possessorUnit, possessorPos);
  if (!target.possession) return null;
  target.possession.sinceTurn = state.turn;
  target.owner = possessorUnit.owner;
  target.lastAttackTurn = state.turn;
  return { row: targetPos.r, col: targetPos.c, previousOwner: prevOwner, targetUid: target.uid };
}

export function applyOnSummonAbilities(state, ctx) {
  const { unit, tpl, row, col } = ctx;
  const logs = [];
  const events = { possessions: [] };
  const cellElement = state.board?.[row]?.[col]?.element;
  if (!unit || !tpl) return { logs, events };

  const possessCfg = tpl.onSummonPossessEnemiesOnElement;
  if (possessCfg) {
    const requiredNot = possessCfg.requireNotOnElement;
    const trigger = requiredNot ? cellElement !== requiredNot : true;
    if (trigger) {
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          if (r === row && c === col) continue;
          const cell = state.board?.[r]?.[c];
          if (!cell || cell.element !== possessCfg.targetFieldElement) continue;
          const target = cell.unit;
          if (!target || target.owner === unit.owner) continue;
          const applied = applyPossession(state, unit, { r: row, c: col }, { r, c });
          if (applied) events.possessions.push(applied);
        }
      }
      if (events.possessions.length) {
        logs.push(`${tpl.name}: владение ${events.possessions.length > 1 ? 'несколькими существами' : 'существом'} на полях ${possessCfg.targetFieldElement}.`);
      }
    }
  }

  return { logs, events };
}

export function releasePossessionsBy(state, possessorUid) {
  if (!possessorUid) return [];
  const released = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const unit = state.board?.[r]?.[c]?.unit;
      if (!unit || !unit.possession) continue;
      if (unit.possession.by !== possessorUid) continue;
      const originalOwner = unit.possession.originalOwner;
      unit.owner = originalOwner;
      unit.possession = null;
      unit.lastAttackTurn = state.turn;
      released.push({ row: r, col: c, owner: originalOwner, uid: unit.uid });
    }
  }
  return released;
}

export function handleUnitDeathCleanup(state, deaths) {
  if (!Array.isArray(deaths) || !deaths.length) return;
  for (const d of deaths) {
    if (d && d.uid) {
      releasePossessionsBy(state, d.uid);
    }
  }
}

export function computeAttackModifiers(state, ctx) {
  const {
    attacker,
    tpl,
    profile,
    hits,
    baseAtk,
  } = ctx;
  let atk = baseAtk;
  const logs = [];

  if (profile && profile.setAttackToFieldCount) {
    const count = countFieldsByElement(state, profile.setAttackToFieldCount);
    atk = count;
    logs.push(`${tpl.name}: сила атаки равна числу полей ${profile.setAttackToFieldCount} (${count}).`);
  }

  if (tpl.dynamicAtk === 'OTHERS_ON_BOARD') {
    const others = countUnits(state) - 1;
    atk += others;
    logs.push(`${tpl.name}: атака увеличена на ${others} (прочие существа).`);
  }
  if (tpl.dynamicAtk === 'FIRE_CREATURES') {
    let cnt = 0;
    for (let rr = 0; rr < 3; rr++) {
      for (let cc = 0; cc < 3; cc++) {
        const u = state.board?.[rr]?.[cc]?.unit;
        if (!u || (attacker && u.uid === attacker.uid)) continue;
        const tplU = CARDS[u.tplId];
        if (tplU?.element === 'FIRE') cnt += 1;
      }
    }
    atk += cnt;
    logs.push(`${tpl.name}: атака увеличена на ${cnt} (существа огня).`);
  }

  const plusCfg = tpl.plusAtkIfTargetOnElement || (tpl.plus1IfTargetOnElement ? { element: tpl.plus1IfTargetOnElement, amount: 1 } : null);
  if (plusCfg && Array.isArray(hits) && hits.length) {
    const has = hits.some(h => state.board?.[h.r]?.[h.c]?.element === plusCfg.element);
    if (has) {
      atk += plusCfg.amount;
      logs.push(`${tpl.name}: +${plusCfg.amount} ATK по целям на поле ${plusCfg.element}.`);
    }
  }

  const plusCreature = tpl.plusAtkIfTargetCreatureElement;
  if (plusCreature && Array.isArray(hits) && hits.length) {
    const matched = hits.some(h => {
      const unit = state.board?.[h.r]?.[h.c]?.unit;
      if (!unit) return false;
      const tplTarget = CARDS[unit.tplId];
      return tplTarget?.element === plusCreature.element;
    });
    if (matched) {
      atk += plusCreature.amount;
      logs.push(`${tpl.name}: +${plusCreature.amount} ATK по существам стихии ${plusCreature.element}.`);
    }
  }

  if (tpl.randomPlus2 && Math.random() < 0.5) {
    atk += 2;
    logs.push(`${tpl.name}: случайный бонус +2 ATK.`);
  }

  if (tpl.penaltyByTargets && Array.isArray(hits)) {
    const penalty = tpl.penaltyByTargets[String(hits.length)] || 0;
    if (penalty !== 0) {
      atk += penalty;
      logs.push(`${tpl.name}: модификатор атаки ${penalty} из-за количества целей.`);
    }
  }

  const finalAtk = Math.max(0, atk);
  return { attack: finalAtk, delta: finalAtk - baseAtk, logs };
}

export function resolveProfile(state, r, c) {
  return resolveActiveAttackProfile(state, r, c);
}

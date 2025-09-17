// Общие функции для обработки особых свойств карт
import { CARDS } from './cards.js';

// локальная функция ограничения маны (без импорта во избежание циклов)
const capMana = (m) => Math.min(10, m);
const inBounds = (r, c) => r >= 0 && r < 3 && c >= 0 && c < 3;

function getUnitTemplate(unit) {
  if (!unit) return null;
  return CARDS[unit.tplId] || null;
}

function getUnitUid(unit) {
  return (unit && unit.uid != null) ? unit.uid : null;
}

function normalizeElementConfig(value, defaults = {}) {
  if (!value) return null;
  if (typeof value === 'string') {
    return { ...defaults, element: value };
  }
  if (typeof value === 'object') {
    return { ...defaults, ...value };
  }
  return null;
}

function sameSource(possessionSource, deathInfo) {
  if (!possessionSource || !deathInfo) return false;
  if (possessionSource.uid != null && deathInfo.uid != null) {
    if (possessionSource.uid === deathInfo.uid) return true;
  }
  if (possessionSource.position && deathInfo.position) {
    if (possessionSource.position.r === deathInfo.position.r &&
        possessionSource.position.c === deathInfo.position.c) {
      return true;
    }
  }
  if (possessionSource.tplId && deathInfo.tplId) {
    if (possessionSource.tplId === deathInfo.tplId &&
        possessionSource.owner === deathInfo.owner) {
      return true;
    }
  }
  return false;
}

function buildSourceDescriptor(state, r, c, unit, tpl) {
  return {
    uid: getUnitUid(unit),
    tplId: tpl?.id || unit?.tplId || null,
    owner: unit?.owner,
    position: { r, c },
    turn: state?.turn ?? 0,
  };
}

function ensureUniqueCells(cells) {
  const seen = new Set();
  const res = [];
  for (const cell of cells) {
    if (!cell) continue;
    const key = `${cell.r},${cell.c}`;
    if (seen.has(key)) continue;
    seen.add(key);
    res.push({ r: cell.r, c: cell.c });
  }
  return res;
}

function unitTribes(tpl) {
  if (!tpl) return [];
  if (Array.isArray(tpl.tribes)) return tpl.tribes;
  return [];
}

function hasAllyWithTribe(state, owner, tribe, excludeUid = null) {
  if (!state || !state.board || tribe == null) return false;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const unit = state.board?.[r]?.[c]?.unit;
      if (!unit || unit.owner !== owner) continue;
      if (excludeUid != null && unit.uid === excludeUid) continue;
      const tpl = getUnitTemplate(unit);
      if (unitTribes(tpl).includes(tribe)) return true;
    }
  }
  return false;
}

function findUnitByUid(state, uid) {
  if (!state || uid == null) return null;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const unit = state.board?.[r]?.[c]?.unit;
      if (unit && unit.uid === uid) {
        return { r, c, unit };
      }
    }
  }
  return null;
}

function directionFromTo(sr, sc, tr, tc) {
  const dr = tr - sr;
  const dc = tc - sc;
  if (dr < 0 && dc === 0) return 'N';
  if (dr > 0 && dc === 0) return 'S';
  if (dc > 0 && dr === 0) return 'E';
  if (dc < 0 && dr === 0) return 'W';
  return null;
}

function oppositeDirection(dir) {
  const map = { N: 'S', S: 'N', E: 'W', W: 'E' };
  return map[dir] || null;
}

function clonePos(pos) {
  if (!pos) return null;
  return { r: pos.r, c: pos.c };
}

export function hasPerfectDodge(state, r, c, unitOverride = null) {
  const unit = unitOverride || state?.board?.[r]?.[c]?.unit;
  if (!unit) return false;
  const tpl = getUnitTemplate(unit);
  if (!tpl) return false;
  if (tpl.perfectDodge) return true;
  const cellElement = state?.board?.[r]?.[c]?.element;
  const cond = tpl.perfectDodgeOnElement;
  if (typeof cond === 'string') {
    return cellElement === cond;
  }
  if (Array.isArray(cond)) {
    return cond.includes(cellElement);
  }
  return false;
}

export function hasInvisibility(state, r, c, unitOverride = null) {
  const unit = unitOverride || state?.board?.[r]?.[c]?.unit;
  if (!unit) return false;
  if (unit.invisible) return true; // резерв под возможные временные эффекты
  const tpl = getUnitTemplate(unit);
  if (!tpl) return false;
  const uid = getUnitUid(unit);
  const owner = unit.owner;

  const cfg = tpl.invisibilityWithTribe;
  if (typeof cfg === 'string') {
    if (hasAllyWithTribe(state, owner, cfg, uid)) return true;
  } else if (Array.isArray(cfg)) {
    for (const tribe of cfg) {
      if (hasAllyWithTribe(state, owner, tribe, uid)) return true;
    }
  }
  return false;
}

export function applyOnDamageAbilities({
  state,
  attackerPos,
  attackerTpl,
  attackerUnit,
  damages,
}) {
  if (!state || !attackerTpl || !Array.isArray(damages) || !damages.length) {
    return { attackerPos: clonePos(attackerPos), blockedRetaliation: [], retaliationPositions: [], logLines: [] };
  }

  const logs = [];
  const blocked = [];
  const retaliationPos = [];
  let currentPos = clonePos(attackerPos);
  const attackerUid = getUnitUid(attackerUnit);
  const attackerOwner = attackerUnit?.owner ?? null;
  const handledTargets = new Set();

  const requireAlive = (unit) => {
    if (!unit) return false;
    const tpl = getUnitTemplate(unit);
    if (!tpl) return false;
    const hp = unit.currentHP != null ? unit.currentHP : tpl.hp;
    return hp > 0;
  };

  const markBlocked = (pos) => {
    if (!pos) return;
    blocked.push({ r: pos.r, c: pos.c });
  };

  const rememberRetPos = (index, pos) => {
    if (!pos) return;
    retaliationPos.push({ index, r: pos.r, c: pos.c });
  };

  for (let i = 0; i < damages.length; i++) {
    const dmg = damages[i];
    if (!dmg || dmg.dealt <= 0) continue;
    const tgtUid = dmg.targetUid;
    if (tgtUid == null) continue;
    if (handledTargets.has(tgtUid)) continue;

    let targetInfo = findUnitByUid(state, tgtUid);
    if (!targetInfo || !requireAlive(targetInfo.unit)) continue;

    const swapElement = attackerTpl.swapOnDamageIfTargetOnElement;
    if (swapElement && dmg.targetElement === swapElement) {
      if (attackerOwner != null && dmg.targetOwner === attackerOwner) {
        // союзников не трогаем для таких навыков
      } else {
        const attackerInfo = findUnitByUid(state, attackerUid);
        if (attackerInfo && attackerInfo.unit && targetInfo.unit) {
          const attackerCell = state.board?.[attackerInfo.r]?.[attackerInfo.c];
          const targetCell = state.board?.[targetInfo.r]?.[targetInfo.c];
          if (attackerCell && targetCell) {
            const attackerRef = attackerCell.unit;
            const targetRef = targetCell.unit;
            attackerCell.unit = targetRef;
            targetCell.unit = attackerRef;
            const newAttackerPos = { r: targetInfo.r, c: targetInfo.c };
            const newTargetPos = { r: attackerInfo.r, c: attackerInfo.c };
            currentPos = newAttackerPos;
            logs.push(`${attackerTpl.name} меняется местами с ${CARDS[targetRef.tplId]?.name || 'целью'} на поле ${swapElement}.`);
            markBlocked(newTargetPos);
            rememberRetPos(i, newTargetPos);
            // после обмена найдём цель по uid заново, чтобы обработать дальнейшие эффекты
            targetInfo = { r: newTargetPos.r, c: newTargetPos.c, unit: targetRef };
          }
        }
      }
    }

    // актуальные позиции после обменов
    const attackerInfoAfter = findUnitByUid(state, attackerUid);
    const targetInfoAfter = findUnitByUid(state, tgtUid);
    if (!attackerInfoAfter || !targetInfoAfter || !requireAlive(targetInfoAfter.unit)) {
      handledTargets.add(tgtUid);
      continue;
    }

    if (attackerTpl.rotateTargetOnDamage) {
      const dirToAttacker = directionFromTo(targetInfoAfter.r, targetInfoAfter.c, attackerInfoAfter.r, attackerInfoAfter.c);
      if (dirToAttacker) {
        const newFacing = oppositeDirection(dirToAttacker) || targetInfoAfter.unit.facing;
        targetInfoAfter.unit.facing = newFacing;
        logs.push(`${attackerTpl.name} разворачивает ${CARDS[targetInfoAfter.unit.tplId]?.name || 'цель'} спиной к себе.`);
      }
      markBlocked({ r: targetInfoAfter.r, c: targetInfoAfter.c });
      rememberRetPos(i, { r: targetInfoAfter.r, c: targetInfoAfter.c });
    }

    handledTargets.add(tgtUid);
  }

  return { attackerPos: currentPos, blockedRetaliation: blocked, retaliationPositions: retaliationPos, logLines: logs };
}

// базовая стоимость активации без каких‑либо скидок
function baseActivationCost(tpl) {
  return tpl && tpl.activation != null
    ? tpl.activation
    : Math.max(0, (tpl && tpl.cost ? tpl.cost - 1 : 0));
}

// фактическая стоимость атаки с учётом скидок (например, "активация на X меньше")
export function activationCost(tpl, fieldElement) {
  let cost = baseActivationCost(tpl);
  if (tpl && tpl.activationReduction) {
    cost = Math.max(0, cost - tpl.activationReduction);
  }
  const onElem = tpl && tpl.activationReductionOnElement;
  if (onElem && fieldElement === onElem.element) {
    cost = Math.max(0, cost - onElem.reduction);
  }
  return cost;
}

// стоимость поворота/обычной активации — без скидок
export const rotateCost = (tpl) => baseActivationCost(tpl);

// Проверка наличия способности "быстрота"
export const hasFirstStrike = (tpl) => !!(tpl && tpl.firstStrike);

// Проверка способности "двойная атака"
export const hasDoubleAttack = (tpl) => !!(tpl && tpl.doubleAttack);

// Может ли существо атаковать (крепости не могут)
export const canAttack = (tpl) => !(tpl && tpl.fortress);

// Реализация ауры Фридонийского Странника при призыве союзников
// Возвращает количество полученных единиц маны
export function applyFreedonianAura(state, owner) {
  let gained = 0;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const cell = state.board?.[r]?.[c];
      const unit = cell?.unit;
      if (!unit) continue;
      const tpl = CARDS[unit.tplId];
      if (tpl?.auraGainManaOnSummon && unit.owner === owner && cell.element !== 'FIRE') {
        const pl = state.players[owner];
        pl.mana = capMana((pl.mana || 0) + 1);
        gained += 1;
      }
    }
  }
  return gained;
}

export function applySummonAbilities(state, r, c) {
  const events = { possessions: [] };
  const cell = state?.board?.[r]?.[c];
  const unit = cell?.unit;
  if (!cell || !unit) return events;
  const tpl = getUnitTemplate(unit);
  if (!tpl) return events;

  const possessionCfg = normalizeElementConfig(
    tpl.gainPossessionEnemiesOnElement,
    { requireDifferentField: true }
  );
  if (possessionCfg && possessionCfg.element) {
    const cellElement = cell.element;
    const requireDiff = possessionCfg.requireDifferentField !== false;
    const shouldTrigger = !requireDiff || cellElement !== possessionCfg.element;
    if (shouldTrigger) {
      for (let rr = 0; rr < 3; rr++) {
        for (let cc = 0; cc < 3; cc++) {
          const targetCell = state?.board?.[rr]?.[cc];
          const targetUnit = targetCell?.unit;
          if (!targetUnit) continue;
          if (targetUnit.owner === unit.owner) continue;
          if (targetCell.element !== possessionCfg.element) continue;
          const originalOwner = targetUnit.possessed?.originalOwner ?? targetUnit.owner;
          const tplTarget = getUnitTemplate(targetUnit);
          targetUnit.owner = unit.owner;
          targetUnit.possessed = {
            by: unit.owner,
            originalOwner,
            source: buildSourceDescriptor(state, r, c, unit, tpl),
            sinceTurn: state?.turn ?? 0,
            targetTplId: tplTarget?.id ?? targetUnit.tplId,
          };
          targetUnit.lastAttackTurn = state?.turn ?? 0;
          events.possessions.push({
            r: rr,
            c: cc,
            originalOwner,
            newOwner: unit.owner,
            targetTplId: tplTarget?.id ?? targetUnit.tplId,
          });
        }
      }
    }
  }
  return events;
}

export function releasePossessionsAfterDeaths(state, deaths = []) {
  const events = { releases: [] };
  if (!state?.board || !Array.isArray(deaths) || !deaths.length) return events;
  const sources = deaths.map(d => ({
    uid: d?.uid ?? null,
    tplId: d?.tplId ?? null,
    owner: d?.owner,
    position: { r: d?.r, c: d?.c },
  }));

  for (let rr = 0; rr < 3; rr++) {
    for (let cc = 0; cc < 3; cc++) {
      const unit = state.board?.[rr]?.[cc]?.unit;
      if (!unit?.possessed) continue;
      const src = unit.possessed.source;
      const match = sources.some(s => sameSource(src, s));
      if (!match) continue;
      const originalOwner = unit.possessed.originalOwner;
      unit.owner = originalOwner;
      delete unit.possessed;
      events.releases.push({ r: rr, c: cc, owner: originalOwner });
    }
  }
  return events;
}

export function isUnitPossessed(unit) {
  return !!(unit && unit.possessed);
}

export function shouldUseMagicAttack(state, r, c, tplOverride = null) {
  const cell = state?.board?.[r]?.[c];
  const unit = cell?.unit;
  const tpl = tplOverride || getUnitTemplate(unit);
  if (!cell || !unit || !tpl) return false;
  const requiredElement = tpl.mustUseMagicOnElement;
  if (!requiredElement) return false;
  return cell.element === requiredElement;
}

export function computeMagicAreaCells(tpl, tr, tc) {
  const cells = [ { r: tr, c: tc } ];
  if (!tpl) return cells;
  const area = tpl.magicAttackArea;
  if (!area) return cells;
  const type = typeof area === 'string' ? area : 'CROSS';
  if (type === true) {
    // поддержка старого формата, если true
    const dirs = [ [-1,0], [1,0], [0,-1], [0,1] ];
    for (const [dr, dc] of dirs) {
      const rr = tr + dr;
      const cc = tc + dc;
      if (inBounds(rr, cc)) cells.push({ r: rr, c: cc });
    }
  } else if (type === 'CROSS') {
    const dirs = [ [-1,0], [1,0], [0,-1], [0,1] ];
    for (const [dr, dc] of dirs) {
      const rr = tr + dr;
      const cc = tc + dc;
      if (inBounds(rr, cc)) cells.push({ r: rr, c: cc });
    }
  }
  return ensureUniqueCells(cells);
}

export function computeDynamicMagicAttack(state, tpl) {
  if (!tpl) return null;
  if (tpl.dynamicMagicAtk === 'FIRE_FIELDS') {
    let cnt = 0;
    for (let rr = 0; rr < 3; rr++) {
      for (let cc = 0; cc < 3; cc++) {
        if (state?.board?.[rr]?.[cc]?.element === 'FIRE') cnt += 1;
      }
    }
    return { amount: cnt, reason: 'FIRE_FIELDS' };
  }
  return null;
}

export function getTargetElementBonus(tpl, state, hits) {
  if (!tpl || !Array.isArray(hits) || !hits.length) return null;
  const cfg = normalizeElementConfig(tpl.plusAtkVsElement);
  if (!cfg?.element) return null;
  const amount = typeof cfg.amount === 'number' ? cfg.amount : 1;
  const has = hits.some(h => {
    const unit = state?.board?.[h.r]?.[h.c]?.unit;
    if (!unit) return false;
    const tTpl = getUnitTemplate(unit);
    return tTpl?.element === cfg.element;
  });
  if (!has) return null;
  return { amount, element: cfg.element };
}

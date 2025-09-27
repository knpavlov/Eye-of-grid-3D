// Общие функции для обработки особых свойств карт
import { CARDS } from './cards.js';
import { applyFieldTransitionToUnit } from './fieldEffects.js';
import {
  isIncarnationCard,
  evaluateIncarnationSummon as evaluateIncarnationSummonInternal,
  applyIncarnationSummon as applyIncarnationSummonInternal,
} from './abilityHandlers/incarnation.js';
import { collectMagicTargets as collectMagicTargetsInternal } from './abilityHandlers/magicTargeting.js';
import {
  collectSacrificeActions,
  executeSacrificeAction,
} from './abilityHandlers/sacrifice.js';
import {
  ensureDodgeState,
  attemptDodge as attemptDodgeInternal,
} from './abilityHandlers/dodge.js';
import { refreshBoardDodgeStates } from './abilityHandlers/dodgeEffects.js';
import {
  computeTargetCostBonus as computeTargetCostBonusInternal,
  computeTargetHpBonus as computeTargetHpBonusInternal,
} from './abilityHandlers/attackModifiers.js';
import { collectRepositionOnDamage } from './abilityHandlers/reposition.js';
import { extraActivationCostFromAuras } from './abilityHandlers/costModifiers.js';
import {
  applyElementalPossession,
  refreshContinuousPossessions as refreshContinuousPossessionsInternal,
} from './abilityHandlers/possession.js';
import { applySummonDraw, applyAdjacentSummonDraws } from './abilityHandlers/draw.js';
import { transformAttackProfile } from './abilityHandlers/attackTransforms.js';
import { cloneAttackEntry } from './utils/attacks.js';
import {
  computeAuraAttackBonus as computeAuraAttackBonusInternal,
  computeAuraActivationDelta as computeAuraActivationDeltaInternal,
} from './abilityHandlers/auraModifiers.js';
import { hasAuraInvisibility } from './abilityHandlers/invisibilityAura.js';
import { applyEnemySummonReactions } from './abilityHandlers/summonReactions.js';
import { applySummonStatBuffs } from './abilityHandlers/summonBuffs.js';
import { applyTurnStartManaEffects as applyTurnStartManaEffectsInternal } from './abilityHandlers/startPhase.js';
import {
  computeUnitProtection as computeUnitProtectionInternal,
  computeAuraProtection as computeAuraProtectionInternal,
} from './abilityHandlers/protection.js';
import { normalizeElementName } from './utils/elements.js';
import {
  applyFieldFatalityCheck as applyFieldFatalityCheckInternal,
  describeFieldFatality as describeFieldFatalityInternal,
  evaluateFieldFatality as evaluateFieldFatalityInternal,
} from './abilityHandlers/fieldHazards.js';
import { applySummonManaSteal } from './abilityHandlers/manaSteal.js';
import { applyFieldquakeAt } from './abilityHandlers/fieldquake.js';
import { applyManaGainOnSummon } from './abilityHandlers/manaGainOnSummon.js';

const inBounds = (r, c) => r >= 0 && r < 3 && c >= 0 && c < 3;
const DIR_VECTORS = { N: [-1, 0], E: [0, 1], S: [1, 0], W: [0, -1] };

function getUnitTemplate(unit) {
  if (!unit) return null;
  return CARDS[unit.tplId] || null;
}

function getUnitUid(unit) {
  return (unit && unit.uid != null) ? unit.uid : null;
}

function toArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
}

function normalizeTplIdList(value) {
  const result = new Set();
  for (const raw of toArray(value)) {
    if (!raw || typeof raw !== 'string') continue;
    const direct = CARDS[raw];
    if (direct?.id) { result.add(direct.id); continue; }
    const byId = Object.values(CARDS).find(card => card?.id === raw);
    if (byId?.id) { result.add(byId.id); continue; }
    const byName = Object.values(CARDS).find(card => card?.name === raw);
    if (byName?.id) { result.add(byName.id); continue; }
    result.add(raw);
  }
  return Array.from(result);
}

function normalizeElements(value) {
  const set = new Set();
  for (const raw of toArray(value)) {
    const el = normalizeElementName(raw);
    if (el) set.add(el);
  }
  return set;
}

function buildSchemeMap(tpl) {
  const list = Array.isArray(tpl?.attackSchemes) ? tpl.attackSchemes : [];
  const map = new Map();
  list.forEach((scheme, idx) => {
    if (!scheme) return;
    const key = scheme.key || scheme.id || scheme.code || `SCHEME_${idx}`;
    map.set(key, {
      key,
      attackType: scheme.attackType || tpl.attackType,
      attacks: Array.isArray(scheme.attacks) ? scheme.attacks.map(cloneAttackEntry) : [],
      chooseDir: scheme.chooseDir != null ? !!scheme.chooseDir : undefined,
      magicAttackArea: scheme.magicArea || scheme.magicAttackArea || tpl.magicAttackArea,
    });
  });
  return map;
}

function normalizeSchemeRequirements(raw) {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  const result = [];
  for (const item of list) {
    if (!item) continue;
    if (typeof item === 'string') {
      result.push({ element: item.toUpperCase(), scheme: 'ALT' });
      continue;
    }
    if (typeof item === 'object') {
      const element = item.element || item.field || item.type;
      const scheme = item.scheme || item.key || item.use;
      if (!element) continue;
      result.push({ element: String(element).toUpperCase(), scheme: scheme ? String(scheme) : 'ALT' });
    }
  }
  return result;
}

export function resolveAttackProfile(state, r, c, tpl, opts = {}) {
  if (!tpl) {
    return {
      attackType: 'STANDARD',
      attacks: [],
      chooseDir: false,
      magicAttackArea: null,
      schemeKey: null,
    };
  }
  const cellElement = state?.board?.[r]?.[c]?.element || null;
  const schemeMap = buildSchemeMap(tpl);
  const defaultKey = tpl.defaultAttackScheme || 'BASE';
  const defaultScheme = schemeMap.get(defaultKey) || (schemeMap.size ? schemeMap.values().next().value : null);

  const requirements = normalizeSchemeRequirements(tpl.mustUseSchemeOnElement);
  let active = null;
  if (requirements.length && cellElement) {
    for (const req of requirements) {
      if (req.element === cellElement) {
        if (req.scheme && schemeMap.has(req.scheme)) {
          active = schemeMap.get(req.scheme);
          break;
        }
      }
    }
  }
  if (!active && tpl.mustUseMagicOnElement && cellElement === tpl.mustUseMagicOnElement) {
    const scheme = tpl.forceMagicSchemeKey && schemeMap.get(tpl.forceMagicSchemeKey);
    active = scheme || null;
    if (!active) {
      active = {
        key: 'FORCED_MAGIC',
        attackType: 'MAGIC',
        attacks: [],
        chooseDir: false,
        magicAttackArea: tpl.magicAttackArea,
      };
    }
  }
  if (!active) {
    active = defaultScheme || {
      key: null,
      attackType: tpl.attackType,
      attacks: Array.isArray(tpl.attacks) ? tpl.attacks.map(cloneAttackEntry) : [],
      chooseDir: tpl.chooseDir,
      magicAttackArea: tpl.magicAttackArea,
    };
  }

  const attackType = active.attackType || tpl.attackType || 'STANDARD';
  const attacks = Array.isArray(active.attacks) && active.attacks.length
    ? active.attacks.map(cloneAttackEntry)
    : (Array.isArray(tpl.attacks) ? tpl.attacks.map(cloneAttackEntry) : []);
  const chooseDir = active.chooseDir != null ? !!active.chooseDir : !!tpl.chooseDir;
  const magicAttackArea = active.magicAttackArea != null ? active.magicAttackArea : tpl.magicAttackArea;

  const profile = {
    attackType,
    attacks,
    chooseDir,
    magicAttackArea,
    schemeKey: active.key || null,
  };

  return transformAttackProfile(state, r, c, tpl, profile);
}

function collectInvisibilitySources(tpl) {
  const sources = new Set();
  for (const id of normalizeTplIdList(tpl?.invisibilityAllies)) sources.add(id);
  for (const id of normalizeTplIdList(tpl?.invisibilityWithAlly)) sources.add(id);
  for (const id of normalizeTplIdList(tpl?.invisibilityWithAllyName)) sources.add(id);
  if (tpl?.invisibilityWithSpider) sources.add('EARTH_SPIDER_NINJA');
  if (tpl?.invisibilityWithWolf) sources.add('WATER_WOLF_NINJA');
  return Array.from(sources);
}

export function hasPerfectDodge(state, r, c, opts = {}) {
  const cell = state?.board?.[r]?.[c];
  const unit = opts.unit || cell?.unit;
  if (!unit) return false;
  const tpl = opts.tpl || getUnitTemplate(unit);
  if (!tpl) return false;
  if (tpl.perfectDodge) return true;
  const cellElement = cell?.element;
  if (!cellElement) return false;
  const elements = normalizeElements(
    tpl.gainPerfectDodgeOnElement || tpl.perfectDodgeOnElement
  );
  if (tpl.perfectDodgeOnFire) elements.add('FIRE');
  return elements.has(cellElement);
}

export function hasInvisibility(state, r, c, opts = {}) {
  const cell = state?.board?.[r]?.[c];
  const unit = opts.unit || cell?.unit;
  if (!unit) return false;
  const tpl = opts.tpl || getUnitTemplate(unit);
  if (!tpl) return false;
  if (tpl.invisibility) return true;
  const byElement = normalizeElements(tpl.invisibilityOnElement);
  if (byElement.size && cell?.element && byElement.has(cell.element)) {
    return true;
  }
  if (hasAuraInvisibility(state, r, c, { unit, tpl })) {
    return true;
  }
  const sources = collectInvisibilitySources(tpl);
  if (!sources.length) return false;
  for (let rr = 0; rr < 3; rr++) {
    for (let cc = 0; cc < 3; cc++) {
      if (rr === r && cc === c) continue;
      const ally = state?.board?.[rr]?.[cc]?.unit;
      if (!ally || ally.owner !== unit.owner) continue;
      if (sources.includes(ally.tplId)) return true;
      const tplAlly = getUnitTemplate(ally);
      if (tplAlly?.id && sources.includes(tplAlly.id)) return true;
      if (tplAlly?.name && sources.includes(tplAlly.name)) return true;
    }
  }
  return false;
}

const OPPOSITE_DIR = { N: 'S', S: 'N', E: 'W', W: 'E' };

function directionBetween(from, to) {
  if (!from || !to) return null;
  const dr = (to.r ?? 0) - (from.r ?? 0);
  const dc = (to.c ?? 0) - (from.c ?? 0);
  if (dr < 0 && dc === 0) return 'N';
  if (dr > 0 && dc === 0) return 'S';
  if (dr === 0 && dc > 0) return 'E';
  if (dr === 0 && dc < 0) return 'W';
  return null;
}

function computeFacingAway(targetRef, attackerRef) {
  const dirToAttacker = directionBetween(targetRef, attackerRef);
  if (!dirToAttacker) return null;
  return OPPOSITE_DIR[dirToAttacker] || null;
}

function resolveRotationFacing(state, targetRef, event = {}) {
  const mode = typeof event.mode === 'string' ? event.mode.toUpperCase() : 'FACE_AWAY';
  if (mode === 'OPPOSITE') {
    const current = targetRef?.unit?.facing;
    if (current && OPPOSITE_DIR[current]) {
      return OPPOSITE_DIR[current];
    }
    const tpl = targetRef?.unit ? getUnitTemplate(targetRef.unit) : null;
    const fallback = tpl?.facing || tpl?.defaultFacing;
    if (fallback && OPPOSITE_DIR[fallback]) {
      return OPPOSITE_DIR[fallback];
    }
    return null;
  }
  const attacker = findUnitRef(state, event.faceAwayFrom);
  return computeFacingAway(targetRef, attacker);
}

// Проверяем, нужно ли активировать эффекты "при нанесении урона" даже при нулевом уроне
function shouldProcessZeroDamageInteractions(tpl, dealt) {
  if ((dealt ?? 0) > 0) return true;
  if (!tpl) return false;
  if (tpl.swapOnDamage && tpl.swapOnDamageAllowZero) return true;
  if (tpl.enableDamageEffectsOnZero) return true;
  return false;
}

function findUnitRef(state, ref = {}) {
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

export function collectDamageInteractions(state, context = {}) {
  const result = { preventRetaliation: new Set(), events: [] };
  if (!state?.board) return result;
  const { attackerPos, attackerUnit, tpl, hits } = context;
  if (!tpl || !attackerUnit || !Array.isArray(hits) || !hits.length) return result;

  const processed = [];
  for (const h of hits) {
    if (!h) continue;
    const dealt = h.dealt ?? h.dmg ?? 0;
    if (!shouldProcessZeroDamageInteractions(tpl, dealt)) continue;
    const cell = state.board?.[h.r]?.[h.c];
    const target = cell?.unit;
    if (!target) continue;
    const tplTarget = getUnitTemplate(target);
    const alive = (target.currentHP ?? tplTarget?.hp ?? 0) > 0;
    if (!alive) continue;
    const key = `${h.r},${h.c}`;
    processed.push({
      r: h.r,
      c: h.c,
      dealt,
      target,
      tplTarget,
      cellElement: cell?.element ?? null,
      key,
    });
    if (tpl.backAttack) {
      result.preventRetaliation.add(key);
    }
    if (tpl.preventRetaliationOnDamage) {
      result.preventRetaliation.add(key);
    }
  }

  if (!processed.length) {
    return result;
  }

  const attackerRef = {
    uid: getUnitUid(attackerUnit),
    r: attackerPos?.r,
    c: attackerPos?.c,
    tplId: tpl.id,
  };

  const reposition = collectRepositionOnDamage(state, {
    attackerRef,
    attackerPos: attackerPos || { r: attackerRef.r, c: attackerRef.c },
    tpl,
    hits: processed,
  });

  if (reposition) {
    if (Array.isArray(reposition.events) && reposition.events.length) {
      result.events.push(...reposition.events);
    }
    let preventList = [];
    if (reposition.preventRetaliation instanceof Set) {
      preventList = Array.from(reposition.preventRetaliation);
    } else if (Array.isArray(reposition.preventRetaliation)) {
      preventList = reposition.preventRetaliation;
    }
    for (const key of preventList) {
      if (key) result.preventRetaliation.add(key);
    }
  }

  const damageFieldquakeCfg = tpl.fieldquakeOnDamage || null;
  if (damageFieldquakeCfg) {
    const cellElement = (attackerPos && typeof attackerPos.r === 'number' && typeof attackerPos.c === 'number')
      ? state?.board?.[attackerPos.r]?.[attackerPos.c]?.element || null
      : null;
    const requireElement = damageFieldquakeCfg.requireFieldElement
      ? normalizeElementName(damageFieldquakeCfg.requireFieldElement)
      : null;
    const forbidElement = damageFieldquakeCfg.requireFieldNot
      ? normalizeElementName(damageFieldquakeCfg.requireFieldNot)
      : null;
    let allowed = true;
    if (requireElement && cellElement !== requireElement) allowed = false;
    if (forbidElement && cellElement === forbidElement) allowed = false;
    if (allowed) {
      const touched = new Set();
      for (const hit of processed) {
        if (!hit) continue;
        const dealt = hit.dealt ?? 0;
        if (dealt <= 0) continue;
        if (touched.has(hit.key)) continue;
        touched.add(hit.key);
        result.events.push({
          type: 'FIELDQUAKE',
          target: { r: hit.r, c: hit.c },
          source: { tplId: tpl.id, owner: attackerUnit.owner, name: tpl.name },
          cause: 'DAMAGE',
        });
        const preventRetaliation = damageFieldquakeCfg.preventRetaliation !== false;
        if (preventRetaliation && hit.key) {
          result.preventRetaliation.add(hit.key);
        }
      }
    }
  }

  return result;
}

export function applyDamageInteractionResults(state, effects = {}) {
  const logs = [];
  let attackerPosUpdate = null;
  const events = Array.isArray(effects?.events) ? effects.events : [];
  const manaSteals = [];
  const possessions = [];
  const releases = [];
  const fieldquakes = [];
  const deaths = [];

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
      const describeShift = (shift, name) => {
        if (!shift) return null;
        const fieldLabel = shift.nextElement ? `поле ${shift.nextElement}` : 'нейтральном поле';
        const prev = shift.beforeHp;
        const next = shift.afterHp;
        if (shift.deltaHp > 0) {
          return `${name} усиливается на ${fieldLabel}: HP ${prev}→${next}.`;
        }
        return `${name} теряет силу на ${fieldLabel}: HP ${prev}→${next}.`;
      };
      const attackerLog = describeShift(shiftAttacker, attackerName);
      if (attackerLog) logs.push(attackerLog);
      const targetLog = describeShift(shiftTarget, targetName);
      if (targetLog) logs.push(targetLog);
      const attackerHazard = applyFieldFatalityCheckInternal(attackerUnit, tplAttacker, targetPrevElement);
      const targetHazard = applyFieldFatalityCheckInternal(targetUnit, tplTarget, attackerPrevElement);
      const attackerFatalLog = describeFieldFatalityInternal(tplAttacker, attackerHazard, { name: attackerName });
      if (attackerFatalLog) logs.push(attackerFatalLog);
      const targetFatalLog = describeFieldFatalityInternal(tplTarget, targetHazard, { name: targetName });
      if (targetFatalLog) logs.push(targetFatalLog);
    } else if (ev?.type === 'ROTATE_TARGET') {
      const target = findUnitRef(state, ev.target);
      if (!target.unit) continue;
      const aliveTarget = (target.unit.currentHP ?? CARDS[target.unit.tplId]?.hp ?? 0) > 0;
      if (!aliveTarget) continue;
      const facing = resolveRotationFacing(state, target, ev);
      if (!facing) continue;
      target.unit.facing = facing;
      const name = CARDS[target.unit.tplId]?.name || 'Цель';
      const mode = typeof ev.mode === 'string' ? ev.mode.toUpperCase() : 'FACE_AWAY';
      const message = mode === 'OPPOSITE'
        ? `${name} разворачивается на 180°.`
        : `${name} поворачивается спиной к атакующему.`;
      logs.push(message);
    } else if (ev?.type === 'PUSH_TARGET') {
      const target = findUnitRef(state, ev.target);
      if (!target.unit) continue;
      const tplTarget = CARDS[target.unit.tplId];
      const aliveTarget = (target.unit.currentHP ?? tplTarget?.hp ?? 0) > 0;
      if (!aliveTarget) continue;
      const to = ev.to || {};
      if (!inBounds(to.r, to.c)) continue;
      const destCell = state.board?.[to.r]?.[to.c];
      if (destCell?.unit) {
        const destUnit = destCell.unit;
        const tplDest = CARDS[destUnit.tplId];
        const aliveDest = (destUnit.currentHP ?? tplDest?.hp ?? 0) > 0;
        if (aliveDest) continue;
      }
      const fromElement = state.board?.[target.r]?.[target.c]?.element ?? null;
      const toElement = state.board?.[to.r]?.[to.c]?.element ?? null;
      state.board[target.r][target.c].unit = null;
      state.board[to.r][to.c].unit = target.unit;
      const attackerName = ev.source?.tplId ? (CARDS[ev.source.tplId]?.name || 'Атакующий') : 'Атакующий';
      const targetName = CARDS[target.unit.tplId]?.name || 'Цель';
      logs.push(`${attackerName} отталкивает ${targetName} назад.`);
      const shiftTarget = applyFieldTransitionToUnit(
        target.unit,
        tplTarget,
        fromElement,
        toElement,
      );
      if (shiftTarget) {
        const fieldLabel = shiftTarget.nextElement ? `поле ${shiftTarget.nextElement}` : 'нейтральное поле';
        const prev = shiftTarget.beforeHp;
        const next = shiftTarget.afterHp;
        if (shiftTarget.deltaHp > 0) {
          logs.push(`${targetName} усиливается на ${fieldLabel}: HP ${prev}→${next}.`);
        } else if (shiftTarget.deltaHp < 0) {
          logs.push(`${targetName} теряет силу на ${fieldLabel}: HP ${prev}→${next}.`);
        }
      }
      const hazard = applyFieldFatalityCheckInternal(state.board[to.r][to.c]?.unit, tplTarget, toElement);
      const fatalLog = describeFieldFatalityInternal(tplTarget, hazard, { name: targetName });
      if (fatalLog) logs.push(fatalLog);
    } else if (ev?.type === 'FIELDQUAKE') {
      const target = ev.target || {};
      if (typeof target.r !== 'number' || typeof target.c !== 'number') continue;
      const fqRes = applyFieldquakeAt(state, target.r, target.c, {
        source: ev.source,
        cause: ev.cause || 'DAMAGE',
        skipManaGain: true,
      });
      if (!fqRes?.success) continue;
      fieldquakes.push({
        r: fqRes.r,
        c: fqRes.c,
        prevElement: fqRes.prevElement,
        nextElement: fqRes.nextElement,
        hpShift: fqRes.hpShift,
        deaths: fqRes.deaths,
      });
      if (Array.isArray(fqRes.logs) && fqRes.logs.length) {
        logs.push(...fqRes.logs);
      }
      if (Array.isArray(fqRes.manaSteals) && fqRes.manaSteals.length) {
        manaSteals.push(...fqRes.manaSteals);
      }
      if (Array.isArray(fqRes.possessions) && fqRes.possessions.length) {
        possessions.push(...fqRes.possessions);
      }
      if (Array.isArray(fqRes.releases) && fqRes.releases.length) {
        releases.push(...fqRes.releases);
      }
      if (Array.isArray(fqRes.deaths) && fqRes.deaths.length) {
        deaths.push(...fqRes.deaths);
      }
    }
  }

  return {
    attackerPosUpdate,
    logLines: logs,
    manaSteals,
    possessions,
    releases,
    fieldquakes,
    deaths,
  };
}

function normalizeElementConfig(value, defaults = {}) {
  if (!value) return null;
  if (typeof value === 'string') {
    const element = normalizeElementName(value);
    if (!element) return null;
    return { ...defaults, element };
  }
  if (typeof value === 'object') {
    const result = { ...defaults, ...value };
    if (value.element != null) {
      const element = normalizeElementName(value.element);
      if (element) {
        result.element = element;
      }
    }
    return result;
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

// базовая стоимость активации без каких‑либо скидок
function baseActivationCost(tpl) {
  return tpl && tpl.activation != null
    ? tpl.activation
    : Math.max(0, (tpl && tpl.cost ? tpl.cost - 1 : 0));
}

// фактическая стоимость атаки с учётом скидок (например, "активация на X меньше")
export function activationCost(tpl, fieldElement, ctx = {}) {
  let cost = baseActivationCost(tpl);
  if (tpl && tpl.activationReduction) {
    cost = Math.max(0, cost - tpl.activationReduction);
  }
  const onElem = tpl && tpl.activationReductionOnElement;
  if (onElem && fieldElement === onElem.element) {
    cost = Math.max(0, cost - onElem.reduction);
  }
  if (ctx && ctx.state && typeof ctx.r === 'number' && typeof ctx.c === 'number') {
    const extra = extraActivationCostFromAuras(ctx.state, ctx.r, ctx.c, {
      unit: ctx.unit,
      owner: ctx.owner,
    });
    if (extra) {
      cost += extra;
    }
    const auraDelta = getAuraActivationModifier(ctx.state, ctx.r, ctx.c, {
      unit: ctx.unit,
      tpl,
      owner: ctx.owner,
    });
    if (auraDelta) {
      cost += auraDelta;
    }
  }
  return Math.max(0, cost);
}

// стоимость поворота/обычной активации — базовая + штрафы аур
export function rotateCost(tpl, fieldElement, ctx = {}) {
  let cost = baseActivationCost(tpl);
  if (ctx && ctx.state && typeof ctx.r === 'number' && typeof ctx.c === 'number') {
    const extra = extraActivationCostFromAuras(ctx.state, ctx.r, ctx.c, {
      unit: ctx.unit,
      owner: ctx.owner,
    });
    if (extra) {
      cost += extra;
    }
    const auraDelta = getAuraActivationModifier(ctx.state, ctx.r, ctx.c, {
      unit: ctx.unit,
      tpl,
      owner: ctx.owner,
    });
    if (auraDelta) {
      cost += auraDelta;
    }
  }
  return Math.max(0, cost);
}

// Проверка наличия способности "быстрота"
export const hasFirstStrike = (tpl) => !!(tpl && tpl.firstStrike);

// Проверка способности "двойная атака"
export const hasDoubleAttack = (tpl) => !!(tpl && tpl.doubleAttack);

// Может ли существо атаковать (крепости не могут)
export const canAttack = (tpl) => !(tpl && tpl.fortress);

function normalizeFieldquakeSummonConfig(raw) {
  if (!raw) return null;
  if (raw === true) return { pattern: 'ADJACENT' };
  if (typeof raw === 'string') {
    return { pattern: raw.trim().toUpperCase() };
  }
  if (typeof raw === 'object') {
    const pattern = String(raw.pattern || raw.type || raw.mode || 'ADJACENT').toUpperCase();
    return { ...raw, pattern };
  }
  return null;
}

function collectFieldquakeSummonTargets(r, c, cfg) {
  const result = [];
  if (!cfg) return result;
  if (cfg.pattern === 'SELF') {
    result.push({ r, c });
  }
  if (cfg.pattern === 'ADJACENT') {
    for (const vec of Object.values(DIR_VECTORS)) {
      const nr = r + vec[0];
      const nc = c + vec[1];
      if (inBounds(nr, nc)) {
        result.push({ r: nr, c: nc });
      }
    }
  }
  if (Array.isArray(cfg.extra)) {
    for (const entry of cfg.extra) {
      if (!entry) continue;
      const nr = Number.isInteger(entry.r) ? entry.r : null;
      const nc = Number.isInteger(entry.c) ? entry.c : null;
      if (nr != null && nc != null && inBounds(nr, nc)) {
        result.push({ r: nr, c: nc });
      }
    }
  }
  return result;
}

export function applySummonAbilities(state, r, c) {
  const events = { possessions: [] };
  const cell = state?.board?.[r]?.[c];
  const unit = cell?.unit;
  if (!cell || !unit) return events;
  const tpl = getUnitTemplate(unit);
  if (!tpl) return events;

  const summonBuffs = applySummonStatBuffs(state, r, c);
  if (Array.isArray(summonBuffs?.logs) && summonBuffs.logs.length) {
    events.logs = [...(events.logs || []), ...summonBuffs.logs];
  }
  if (Array.isArray(summonBuffs?.statBuffs) && summonBuffs.statBuffs.length) {
    events.statBuffs = [...(events.statBuffs || []), ...summonBuffs.statBuffs];
  }

  const drawRes = applySummonDraw(state, r, c, unit, tpl);
  if (Array.isArray(drawRes?.events) && drawRes.events.length) {
    events.draws = [...drawRes.events];
    if (!events.draw) {
      events.draw = drawRes.events[0];
    }
  }

  const extraDraws = applyAdjacentSummonDraws(state, { r, c, unit, tpl, cell });
  if (Array.isArray(extraDraws) && extraDraws.length) {
    events.draws = [...(events.draws || []), ...extraDraws];
    if (!events.draw) {
      events.draw = extraDraws[0];
    }
  }

  const manaSteals = applySummonManaSteal(state, { r, c, unit, tpl, cell });
  if (Array.isArray(manaSteals) && manaSteals.length) {
    events.manaSteals = [...manaSteals];
    for (const steal of manaSteals) {
      if (steal?.log) {
        events.logs = [...(events.logs || []), steal.log];
      }
    }
  }

  const fieldquakeCfg = normalizeFieldquakeSummonConfig(tpl.fieldquakeOnSummon);
  if (fieldquakeCfg) {
    const targets = collectFieldquakeSummonTargets(r, c, fieldquakeCfg);
    if (targets.length) {
      for (const target of targets) {
        if (!target) continue;
        const fqRes = applyFieldquakeAt(state, target.r, target.c, {
          source: { tplId: tpl.id, owner: unit.owner, name: tpl.name },
          cause: 'SUMMON',
        });
        if (!fqRes?.success) continue;
        const entry = {
          r: fqRes.r,
          c: fqRes.c,
          prevElement: fqRes.prevElement,
          nextElement: fqRes.nextElement,
          hpShift: fqRes.hpShift,
          deaths: fqRes.deaths,
          manaGains: fqRes.manaGains,
        };
        events.fieldquakes = [...(events.fieldquakes || []), entry];
        if (Array.isArray(fqRes.logs) && fqRes.logs.length) {
          events.logs = [...(events.logs || []), ...fqRes.logs];
        }
        if (Array.isArray(fqRes.manaSteals) && fqRes.manaSteals.length) {
          events.manaSteals = [...(events.manaSteals || []), ...fqRes.manaSteals];
        }
        if (Array.isArray(fqRes.manaGains) && fqRes.manaGains.length) {
          events.manaGains = [...(events.manaGains || []), ...fqRes.manaGains];
        }
        if (Array.isArray(fqRes.possessions) && fqRes.possessions.length) {
          events.possessions.push(...fqRes.possessions);
        }
        if (Array.isArray(fqRes.releases) && fqRes.releases.length) {
          events.releases = [...(events.releases || []), ...fqRes.releases];
        }
        if (Array.isArray(fqRes.repositions) && fqRes.repositions.length) {
          events.repositions = [...(events.repositions || []), ...fqRes.repositions];
        }
        if (Array.isArray(fqRes.deaths) && fqRes.deaths.length) {
          events.deaths = [...(events.deaths || []), ...fqRes.deaths];
          for (const death of fqRes.deaths) {
            const owner = death?.owner;
            try {
              if (owner != null && state.players?.[owner]?.graveyard) {
                state.players[owner].graveyard.push(CARDS[death.tplId]);
              }
            } catch {}
          }
        }
      }
    }
  }

  const possessionCfg = normalizeElementConfig(
    tpl.gainPossessionEnemiesOnElement,
    { requireDifferentField: true }
  );
  if (possessionCfg && possessionCfg.element) {
    const possRes = applyElementalPossession(state, r, c, possessionCfg);
    if (possRes.possessions.length) {
      events.possessions.push(...possRes.possessions);
    }
    if (possRes.releases?.length) {
      events.releases = [...(events.releases || []), ...possRes.releases];
    }
  }

  const continuous = refreshContinuousPossessionsInternal(state);
  if (continuous.possessions.length) {
    events.possessions.push(...continuous.possessions);
  }
  if (continuous.releases.length) {
    events.releases = [...(events.releases || []), ...continuous.releases];
  }

  const dodgeInfo = refreshBoardDodgeStates(state);
  if (Array.isArray(dodgeInfo?.updated) && dodgeInfo.updated.length) {
    events.dodgeUpdates = dodgeInfo.updated;
  }

  const reactions = applyEnemySummonReactions(state, { r, c, unit, tpl });
  if (Array.isArray(reactions?.heals) && reactions.heals.length) {
    events.heals = [...(events.heals || []), ...reactions.heals];
  }

  const manaAura = applyManaGainOnSummon(state, { r, c, unit, tpl });
  if (Array.isArray(manaAura?.events) && manaAura.events.length) {
    events.manaGains = [...(events.manaGains || []), ...manaAura.events];
  }
  if (Array.isArray(manaAura?.logs) && manaAura.logs.length) {
    events.logs = [...(events.logs || []), ...manaAura.logs];
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
  const profile = resolveAttackProfile(state, r, c, tpl, { unit, cell });
  if (!profile) return false;
  const baseType = tpl.attackType || 'STANDARD';
  return profile.attackType === 'MAGIC' && baseType !== 'MAGIC';
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

export function collectMagicTargetCells(state, tpl, attackerRef, primaryTarget) {
  return collectMagicTargetsInternal(state, tpl, attackerRef, primaryTarget, computeMagicAreaCells);
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

export function getTargetCostBonus(state, tpl, hits) {
  return computeTargetCostBonusInternal(state, tpl, hits);
}

export function getTargetHpBonus(state, tpl, hits) {
  return computeTargetHpBonusInternal(state, tpl, hits);
}

export function getAuraAttackBonus(state, r, c, opts = {}) {
  return computeAuraAttackBonusInternal(state, r, c, opts);
}

export function getAuraActivationModifier(state, r, c, opts = {}) {
  return computeAuraActivationDeltaInternal(state, r, c, opts);
}

export function getUnitProtection(state, r, c, opts = {}) {
  return computeUnitProtectionInternal(state, r, c, opts);
}

export function getAuraProtectionBonus(state, r, c, opts = {}) {
  return computeAuraProtectionInternal(state, r, c, opts);
}

export { isIncarnationCard };
export const evaluateIncarnationSummon = evaluateIncarnationSummonInternal;
export const applyIncarnationSummon = applyIncarnationSummonInternal;
export const ensureUnitDodgeState = ensureDodgeState;
export const attemptUnitDodge = attemptDodgeInternal;
export const refreshContinuousPossessions = refreshContinuousPossessionsInternal;
export { refreshBoardDodgeStates };
export const applyTurnStartManaEffects = applyTurnStartManaEffectsInternal;
export const evaluateFieldFatality = evaluateFieldFatalityInternal;
export const applyFieldFatalityCheck = applyFieldFatalityCheckInternal;
export const describeFieldFatality = describeFieldFatalityInternal;

export function collectUnitActions(state, r, c) {
  const actions = [];
  const cell = state?.board?.[r]?.[c];
  const unit = cell?.unit;
  const tpl = getUnitTemplate(unit);
  if (!unit || !tpl) return actions;
  let index = 0;
  const append = (list) => {
    for (const item of list || []) {
      if (!item) continue;
      const actionId = item.actionId || `${item.type}:${index}`;
      actions.push({ ...item, actionId });
      index += 1;
    }
  };
  append(collectSacrificeActions(state, { state, unit, tpl, r, c }));
  return actions;
}

export function executeUnitAction(state, action, payload = {}) {
  if (!state || !action || !action.type) {
    return { ok: false, reason: 'INVALID_ACTION' };
  }
  if (action.type === 'SACRIFICE_TRANSFORM') {
    const result = executeSacrificeAction(state, action, payload);
    if (!result?.ok) {
      return result;
    }
    const cell = state.board?.[action.r]?.[action.c];
    if (cell?.unit) {
      result.summonEvents = applySummonAbilities(state, action.r, action.c);
    }
    return result;
  }
  return { ok: false, reason: 'UNKNOWN_ACTION' };
}

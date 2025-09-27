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
import { buildFieldquakeLockSet, applyFieldquakeToCell } from './abilityHandlers/fieldquake.js';
import { buildDeathRecord } from './utils/deaths.js';

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

function resolveSummonFieldquakePattern(cfg) {
  if (!cfg) return 'ADJACENT';
  if (typeof cfg === 'string') return cfg.toUpperCase();
  if (typeof cfg === 'object') {
    const pattern = cfg.pattern || cfg.type || cfg.mode;
    if (pattern) return String(pattern).toUpperCase();
  }
  return 'ADJACENT';
}

function collectSummonFieldquakeTargets(r, c, cfg) {
  const pattern = resolveSummonFieldquakePattern(cfg);
  const list = [];
  if (pattern === 'SELF' || pattern === 'ORIGIN') {
    list.push({ r, c });
    return list;
  }
  if (pattern === 'ROW') {
    for (let cc = 0; cc < 3; cc += 1) {
      if (cc === c) continue;
      list.push({ r, c: cc });
    }
    return list;
  }
  if (pattern === 'COLUMN' || pattern === 'COL') {
    for (let rr = 0; rr < 3; rr += 1) {
      if (rr === r) continue;
      list.push({ r: rr, c });
    }
    return list;
  }
  // По умолчанию работаем с четырьмя соседними клетками
  const offsets = [ [-1, 0], [1, 0], [0, -1], [0, 1] ];
  for (const [dr, dc] of offsets) {
    const rr = r + dr;
    const cc = c + dc;
    if (!inBounds(rr, cc)) continue;
    list.push({ r: rr, c: cc });
  }
  return list;
}

function collectPendingDeaths(state, cells) {
  const deaths = [];
  for (const pos of cells || []) {
    if (!pos) continue;
    const cell = state.board?.[pos.r]?.[pos.c];
    const unit = cell?.unit;
    if (!unit) continue;
    const tpl = CARDS[unit.tplId];
    const hp = (typeof unit.currentHP === 'number') ? unit.currentHP : (tpl?.hp || 0);
    if (hp > 0) continue;
    const record = buildDeathRecord(state, pos.r, pos.c, unit);
    if (record) deaths.push(record);
  }
  return deaths;
}

function finalizeFieldquakeDeaths(state, deathRecords, opts = {}) {
  const result = { deaths: [], logs: [], manaSteals: [], releases: [], possessions: [], dodgeUpdates: [] };
  if (!Array.isArray(deathRecords) || !deathRecords.length) return result;

  const processed = [];
  for (const record of deathRecords) {
    if (!record) continue;
    const cell = state.board?.[record.r]?.[record.c];
    const unit = cell?.unit;
    if (!unit) continue;
    const tpl = CARDS[unit.tplId];
    if (!tpl) continue;
    processed.push({ record, cell, unit, tpl });
  }
  if (!processed.length) return result;

  for (const item of processed) {
    const { record, cell, unit, tpl } = item;
    const owner = unit.owner;
    const player = state.players?.[owner];
    if (player) {
      player.mana = capMana((player.mana || 0) + 1);
      if (Array.isArray(player.graveyard)) player.graveyard.push(tpl);
    }
    cell.unit = null;
    result.deaths.push(record);
  }

  for (const item of processed) {
    const { tpl, record } = item;
    if (!tpl?.onDeathAddHPAll) continue;
    const amount = tpl.onDeathAddHPAll;
    const owner = record.owner;
    for (let rr = 0; rr < 3; rr += 1) {
      for (let cc = 0; cc < 3; cc += 1) {
        if (rr === record.r && cc === record.c) continue;
        const ally = state.board?.[rr]?.[cc]?.unit;
        if (!ally || ally.owner !== owner) continue;
        const tplAlly = CARDS[ally.tplId];
        if (!tplAlly) continue;
        const cellElement = state.board?.[rr]?.[cc]?.element;
        const buff = computeCellBuff(cellElement, tplAlly.element);
        ally.bonusHP = (ally.bonusHP || 0) + amount;
        const maxHP = (tplAlly.hp || 0) + buff.hp + (ally.bonusHP || 0);
        const before = ally.currentHP ?? tplAlly.hp;
        ally.currentHP = Math.min(maxHP, before + amount);
      }
    }
    result.logs.push(`${tpl.name}: союзники получают +${tpl.onDeathAddHPAll} HP`);
  }

  const discardEffects = applyDeathDiscardEffects(state, result.deaths, { cause: opts.cause || 'ABILITY' });
  if (Array.isArray(discardEffects.logs) && discardEffects.logs.length) {
    result.logs.push(...discardEffects.logs);
  }
  if (Array.isArray(discardEffects?.manaSteals) && discardEffects.manaSteals.length) {
    result.manaSteals.push(...discardEffects.manaSteals);
  }
  if (Array.isArray(discardEffects?.repositions) && discardEffects.repositions.length) {
    result.repositions = discardEffects.repositions.slice();
  }
  if (Array.isArray(discardEffects?.requests) && discardEffects.requests.length) {
    result.discardRequests = discardEffects.requests.slice();
  }

  const releaseEvents = releasePossessionsAfterDeaths(state, result.deaths);
  if (releaseEvents.releases.length) {
    result.releases.push(...releaseEvents.releases);
    for (const rel of releaseEvents.releases) {
      const unit = state.board?.[rel.r]?.[rel.c]?.unit;
      const tplRel = unit ? CARDS[unit.tplId] : null;
      const name = tplRel?.name || 'Существо';
      result.logs.push(`${name}: контроль возвращается к игроку ${rel.owner + 1}.`);
    }
  }

  const continuous = refreshContinuousPossessions(state);
  if (continuous.possessions.length) {
    result.possessions.push(...continuous.possessions);
    for (const ev of continuous.possessions) {
      const takenUnit = state.board?.[ev.r]?.[ev.c]?.unit;
      const tplTaken = takenUnit ? CARDS[takenUnit.tplId] : null;
      const name = tplTaken?.name || 'Существо';
      const ownerLabel = (ev.newOwner != null) ? ev.newOwner + 1 : '?';
      result.logs.push(`${name}: контроль переходит к игроку ${ownerLabel}.`);
    }
  }
  if (continuous.releases.length) {
    result.releases.push(...continuous.releases);
    for (const rel of continuous.releases) {
      const unit = state.board?.[rel.r]?.[rel.c]?.unit;
      const tplRel = unit ? CARDS[unit.tplId] : null;
      const name = tplRel?.name || 'Существо';
      result.logs.push(`${name}: контроль возвращается к игроку ${rel.owner + 1}.`);
    }
  }

  const dodgeInfo = refreshBoardDodgeStates(state);
  if (Array.isArray(dodgeInfo?.updated) && dodgeInfo.updated.length) {
    result.dodgeUpdates = dodgeInfo.updated.slice();
  }

  return result;
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

  const fieldquakeCfg = tpl.fieldquakeOnDamage;
  if (fieldquakeCfg) {
    const attackerElement = normalizeElementName(state.board?.[attackerPos?.r]?.[attackerPos?.c]?.element);
    const requireEl = normalizeElementName(fieldquakeCfg.requireElement || fieldquakeCfg.onlyOnElement);
    const forbidEl = normalizeElementName(fieldquakeCfg.requireNotElement || fieldquakeCfg.forbidElement || fieldquakeCfg.excludeElement);
    let enabled = true;
    if (requireEl && attackerElement !== requireEl) enabled = false;
    if (forbidEl && attackerElement === forbidEl) enabled = false;
    if (enabled) {
      for (const info of processed) {
        if (!info || (info.dealt ?? 0) <= 0) continue;
        if (info.target?.owner === attackerUnit.owner) continue;
        result.events.push({
          type: 'FIELDQUAKE',
          target: { r: info.r, c: info.c },
          source: attackerRef,
          sourceTplId: tpl.id,
          preventRetaliation: fieldquakeCfg.preventRetaliation === true,
          log: fieldquakeCfg.log || `${tpl.name}: fieldquake shakes the target field.`,
        });
        if (fieldquakeCfg.preventRetaliation) {
          result.preventRetaliation.add(info.key);
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
  const fieldquakeResults = [];
  let cachedLocks = null;

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
      if (!cachedLocks) cachedLocks = buildFieldquakeLockSet(state);
      const res = applyFieldquakeToCell(state, target.r, target.c, { lockedSet: cachedLocks });
      if (!res?.ok) continue;
      fieldquakeResults.push({
        r: res.r,
        c: res.c,
        prevElement: res.prevElement,
        nextElement: res.nextElement,
        hpDelta: res.hpDelta,
        hpAfter: res.hpAfter,
        unitAffected: res.unitAffected,
        sourceTplId: ev.sourceTplId || null,
      });
      if (ev.log) logs.push(ev.log);
    }
  }

  return { attackerPosUpdate, logLines: logs, fieldquakes: fieldquakeResults };
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

  if (tpl.fieldquakeOnSummon) {
    const targets = collectSummonFieldquakeTargets(r, c, tpl.fieldquakeOnSummon);
    if (targets.length) {
      const lockedSet = buildFieldquakeLockSet(state);
      const appliedQuakes = [];
      for (const target of targets) {
        const res = applyFieldquakeToCell(state, target.r, target.c, { lockedSet });
        if (res?.ok) appliedQuakes.push(res);
      }
      if (appliedQuakes.length) {
        const quakeLog = `${tpl.name}: fieldquake ripples through nearby fields.`;
        events.logs = [...(events.logs || []), quakeLog];
        events.fieldquakes = [
          ...(events.fieldquakes || []),
          ...appliedQuakes.map(item => ({
            r: item.r,
            c: item.c,
            prevElement: item.prevElement,
            nextElement: item.nextElement,
            hpDelta: item.hpDelta,
            hpAfter: item.hpAfter,
            unitAffected: item.unitAffected,
          })),
        ];
        const pendingDeaths = collectPendingDeaths(state, appliedQuakes);
        if (pendingDeaths.length) {
          const outcome = finalizeFieldquakeDeaths(state, pendingDeaths, { cause: 'FIELDQUAKE_SUMMON' });
          if (outcome.deaths.length) {
            events.deaths = [...(events.deaths || []), ...outcome.deaths];
          }
          if (Array.isArray(outcome.logs) && outcome.logs.length) {
            events.logs = [...(events.logs || []), ...outcome.logs];
          }
          if (Array.isArray(outcome.manaSteals) && outcome.manaSteals.length) {
            events.manaSteals = [...(events.manaSteals || []), ...outcome.manaSteals];
          }
          if (Array.isArray(outcome.releases) && outcome.releases.length) {
            events.releases = [...(events.releases || []), ...outcome.releases];
          }
          if (Array.isArray(outcome.possessions) && outcome.possessions.length) {
            events.possessions = [...(events.possessions || []), ...outcome.possessions];
          }
          if (Array.isArray(outcome.dodgeUpdates) && outcome.dodgeUpdates.length) {
            events.dodgeUpdates = [...(events.dodgeUpdates || []), ...outcome.dodgeUpdates];
          }
          if (Array.isArray(outcome.discardRequests) && outcome.discardRequests.length) {
            events.discardRequests = [...(events.discardRequests || []), ...outcome.discardRequests];
          }
          if (Array.isArray(outcome.repositions) && outcome.repositions.length) {
            events.repositions = [...(events.repositions || []), ...outcome.repositions];
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
      result.freedonianMana = applyFreedonianAura(state, action.owner);
    } else {
      result.summonEvents = result.summonEvents || { possessions: [] };
      result.freedonianMana = 0;
    }
    return result;
  }
  return { ok: false, reason: 'UNKNOWN_ACTION' };
}

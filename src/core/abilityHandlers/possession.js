// Обработчики способностей, связанных с контролем (possession)
// Модуль изолирует чистую игровую логику от визуального слоя,
// чтобы эти эффекты можно было переиспользовать при переносе на Unity.

import { CARDS } from '../cards.js';

const DIR_VECTORS = {
  N: [-1, 0],
  E: [0, 1],
  S: [1, 0],
  W: [0, -1],
};

const BOARD_SIZE = 3;

const inBounds = (r, c) => r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;

function getUnitTemplate(unit) {
  if (!unit) return null;
  return CARDS[unit.tplId] || null;
}

function getUnitUid(unit) {
  return (unit && unit.uid != null) ? unit.uid : null;
}

function normalizeElementRequirement(raw) {
  if (!raw) return null;
  const arr = Array.isArray(raw) ? raw : [raw];
  const set = new Set();
  for (const value of arr) {
    if (!value && value !== 0) continue;
    const normalized = String(value).trim().toUpperCase();
    if (normalized) set.add(normalized);
  }
  return set.size ? set : null;
}

function normalizeEffectList(raw, tplId = 'EFFECT') {
  if (!raw) return [];
  const source = Array.isArray(raw) ? raw : [raw];
  const effects = [];
  let idx = 0;
  for (const entry of source) {
    if (!entry) continue;
    let cfg = null;
    if (typeof entry === 'string') {
      cfg = { pattern: entry };
    } else if (typeof entry === 'object') {
      cfg = { ...entry };
    } else {
      continue;
    }
    const patternRaw = cfg.pattern || cfg.type || cfg.area || cfg.mode || cfg.kind;
    const pattern = typeof patternRaw === 'string' ? patternRaw.trim().toUpperCase() : null;
    if (!pattern) continue;
    const effect = {
      pattern,
      range: (typeof cfg.range === 'number' && Number.isFinite(cfg.range))
        ? Math.max(1, Math.abs(Math.trunc(cfg.range)))
        : 1,
      id: cfg.id || cfg.key || cfg.code || `${tplId}:${idx}`,
      continuous: cfg.continuous !== false,
      requireSourceElements: normalizeElementRequirement(
        cfg.requireSourceElement || cfg.sourceElement || cfg.element
      ),
      onlyEnemies: cfg.onlyEnemies !== false,
    };
    effects.push(effect);
    idx += 1;
  }
  return effects;
}

function buildEffectDescriptor(state, r, c, unit, tpl, effectKey) {
  return {
    uid: getUnitUid(unit),
    tplId: tpl?.id || unit?.tplId || null,
    owner: unit?.owner,
    position: { r, c },
    turn: state?.turn ?? 0,
    effect: effectKey || null,
  };
}

function cloneDescriptor(descriptor) {
  if (!descriptor) return null;
  return {
    ...descriptor,
    position: descriptor.position ? { ...descriptor.position } : null,
  };
}

function sameSourceDescriptor(a, b) {
  if (!a || !b) return false;
  if (a.uid != null && b.uid != null && a.uid === b.uid) return true;
  if (a.position && b.position) {
    if (a.position.r === b.position.r && a.position.c === b.position.c) return true;
  }
  if (a.tplId && b.tplId) {
    if (a.tplId === b.tplId && a.owner === b.owner) return true;
  }
  if (a.effect && b.effect) {
    if (a.effect === b.effect && a.owner === b.owner) {
      const ar = a.position?.r ?? null;
      const ac = a.position?.c ?? null;
      const br = b.position?.r ?? null;
      const bc = b.position?.c ?? null;
      if (ar === br && ac === bc) return true;
    }
  }
  return false;
}

function makeSourceKey(descriptor) {
  if (!descriptor) return null;
  const tplId = descriptor.tplId || 'UNKNOWN';
  const owner = descriptor.owner != null ? descriptor.owner : 'NA';
  const uid = descriptor.uid != null ? descriptor.uid : 'NA';
  const effect = descriptor.effect || 'NA';
  const pos = descriptor.position || {};
  const r = pos.r != null ? pos.r : 'NA';
  const c = pos.c != null ? pos.c : 'NA';
  return `${tplId}:${owner}:${r}:${c}:${uid}:${effect}`;
}

function matchesSourceElement(cellElement, effect) {
  const set = effect?.requireSourceElements;
  if (!set || !set.size) return true;
  if (!cellElement) return false;
  return set.has(String(cellElement).toUpperCase());
}

function collectAdjacentTargets(state, r, c) {
  const result = [];
  for (const [dr, dc] of Object.values(DIR_VECTORS)) {
    const nr = r + dr;
    const nc = c + dc;
    if (!inBounds(nr, nc)) continue;
    const unit = state?.board?.[nr]?.[nc]?.unit;
    if (!unit) continue;
    result.push({ r: nr, c: nc, unit });
  }
  return result;
}

function collectFrontTargets(state, r, c, unit, range = 1) {
  const result = [];
  const facing = unit?.facing || 'N';
  const vec = DIR_VECTORS[facing] || DIR_VECTORS.N;
  if (!vec) return result;
  const [dr, dc] = vec;
  for (let step = 1; step <= range; step++) {
    const nr = r + dr * step;
    const nc = c + dc * step;
    if (!inBounds(nr, nc)) break;
    const target = state?.board?.[nr]?.[nc]?.unit;
    if (!target) break;
    result.push({ r: nr, c: nc, unit: target });
    break; // "прямо перед" подразумевает первую занятую клетку
  }
  return result;
}

function collectEffectTargets(state, r, c, unit, effect) {
  if (!effect) return [];
  if (effect.pattern === 'ADJACENT' || effect.pattern === 'AURA_ADJACENT') {
    return collectAdjacentTargets(state, r, c);
  }
  if (effect.pattern === 'FRONT' || effect.pattern === 'FRONT_LINE') {
    return collectFrontTargets(state, r, c, unit, effect.range || 1);
  }
  return [];
}

function setPossession(state, descriptor, targetR, targetC, events) {
  const cell = state?.board?.[targetR]?.[targetC];
  const targetUnit = cell?.unit;
  if (!targetUnit) return false;
  const tplTarget = getUnitTemplate(targetUnit);
  const sameOwner = targetUnit.owner === descriptor.owner;
  const existing = targetUnit.possessed || null;

  if (sameOwner) {
    if (!existing) return false;
    if (sameSourceDescriptor(existing.source, descriptor)) {
      // Уже захвачено тем же источником
      return false;
    }
    // Наше существо или уже контролируется другим эффектом — не вмешиваемся
    return false;
  }

  const originalOwner = existing?.originalOwner ?? targetUnit.owner;
  targetUnit.owner = descriptor.owner;
  targetUnit.possessed = {
    by: descriptor.owner,
    originalOwner,
    source: cloneDescriptor(descriptor),
    sinceTurn: descriptor.turn,
    targetTplId: tplTarget?.id ?? targetUnit.tplId,
  };
  targetUnit.lastAttackTurn = descriptor.turn;

  const entry = {
    r: targetR,
    c: targetC,
    originalOwner,
    newOwner: descriptor.owner,
    targetTplId: tplTarget?.id ?? targetUnit.tplId,
  };
  if (descriptor.effect) entry.effect = descriptor.effect;
  events.possessions.push(entry);
  return true;
}

function releasePossession(state, r, c, events) {
  const unit = state?.board?.[r]?.[c]?.unit;
  if (!unit?.possessed) return false;
  const originalOwner = unit.possessed.originalOwner;
  const src = unit.possessed.source || null;
  unit.owner = originalOwner;
  delete unit.possessed;
  const entry = { r, c, owner: originalOwner };
  if (src?.effect) entry.effect = src.effect;
  events.releases.push(entry);
  return true;
}

function isSourceStillValid(state, descriptor) {
  if (!descriptor) return false;
  const pos = descriptor.position || {};
  const unit = state?.board?.[pos.r]?.[pos.c]?.unit;
  if (!unit) return false;
  if (descriptor.uid != null && getUnitUid(unit) !== descriptor.uid) return false;
  if (descriptor.tplId && unit.tplId !== descriptor.tplId) return false;
  if (descriptor.owner != null && unit.owner !== descriptor.owner) return false;
  return true;
}

export function applyElementalPossession(state, r, c, cfg) {
  const result = { possessions: [], releases: [] };
  if (!state?.board) return result;
  const unit = state.board?.[r]?.[c]?.unit;
  if (!unit) return result;
  const tpl = getUnitTemplate(unit);
  if (!tpl) return result;

  const cellElement = state.board?.[r]?.[c]?.element || null;
  const targetElement = cfg?.element ? String(cfg.element).toUpperCase() : null;
  if (!targetElement) return result;

  const requireDiff = cfg?.requireDifferentField !== false;
  const requireSame = cfg?.requireSameField === true || cfg?.triggerWhenOnElement === true;

  let shouldTrigger = true;
  if (requireSame) {
    shouldTrigger = cellElement === targetElement;
  } else if (requireDiff) {
    shouldTrigger = cellElement !== targetElement;
  }
  if (!shouldTrigger) return result;

  const descriptor = buildEffectDescriptor(state, r, c, unit, tpl, null);

  for (let rr = 0; rr < BOARD_SIZE; rr++) {
    for (let cc = 0; cc < BOARD_SIZE; cc++) {
      if (rr === r && cc === c) continue;
      const targetCell = state.board?.[rr]?.[cc];
      if (!targetCell?.unit) continue;
      if (targetCell.element !== targetElement) continue;
      if (targetCell.unit.owner === unit.owner) continue;
      setPossession(state, descriptor, rr, cc, result);
    }
  }

  return result;
}

export function refreshContinuousPossessions(state) {
  const events = { possessions: [], releases: [] };
  if (!state?.board) return events;

  const expected = new Map();
  const sourceDescriptors = new Map();

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const unit = state.board?.[r]?.[c]?.unit;
      if (!unit) continue;
      const tpl = getUnitTemplate(unit);
      if (!tpl) continue;
      const effects = normalizeEffectList(tpl.possessionEffects, tpl.id);
      if (!effects.length) continue;
      const cellElement = state.board?.[r]?.[c]?.element || null;

      for (const effect of effects) {
        const descriptor = buildEffectDescriptor(state, r, c, unit, tpl, effect.id);
        const key = makeSourceKey(descriptor);
        sourceDescriptors.set(key, descriptor);
        if (effect.continuous === false) continue;
        if (!matchesSourceElement(cellElement, effect)) continue;
        const targets = collectEffectTargets(state, r, c, unit, effect);
        for (const target of targets) {
          const mapKey = `${target.r},${target.c}`;
          if (expected.has(mapKey)) continue;
          expected.set(mapKey, {
            descriptor,
            owner: unit.owner,
          });
        }
      }
    }
  }

  for (const [key, info] of expected.entries()) {
    const { descriptor } = info;
    if (!descriptor?.effect) continue;
    const [targetR, targetC] = key.split(',').map(v => Number.parseInt(v, 10));
    if (!Number.isFinite(targetR) || !Number.isFinite(targetC)) continue;
    setPossession(state, { ...descriptor }, targetR, targetC, events);
  }

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const unit = state.board?.[r]?.[c]?.unit;
      if (!unit?.possessed) continue;
      const src = unit.possessed.source || null;
      if (!src?.effect) continue;
      const mapKey = `${r},${c}`;
      const expectedInfo = expected.get(mapKey);
      if (expectedInfo && sameSourceDescriptor(src, expectedInfo.descriptor)) {
        continue;
      }
      const sourceKey = makeSourceKey(src);
      const descriptor = sourceDescriptors.get(sourceKey) || null;
      if (descriptor && sameSourceDescriptor(src, descriptor) && isSourceStillValid(state, descriptor)) {
        if (expectedInfo) continue;
      }
      releasePossession(state, r, c, events);
    }
  }

  return events;
}

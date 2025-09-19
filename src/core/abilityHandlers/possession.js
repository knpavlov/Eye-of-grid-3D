// Модуль для обработки способностей, связанных с контролем (possession)
import { CARDS } from '../cards.js';

const DIR_VECTORS = { N: [-1, 0], E: [0, 1], S: [1, 0], W: [0, -1] };

const RELATIVE_DIRS = {
  FRONT: { N: 'N', E: 'E', S: 'S', W: 'W' },
  BACK: { N: 'S', E: 'W', S: 'N', W: 'E' },
  LEFT: { N: 'W', E: 'N', S: 'E', W: 'S' },
  RIGHT: { N: 'E', E: 'S', S: 'W', W: 'N' },
};

const DEFAULT_AURA_TAG = 'POSSESSION_AURA';

function inBounds(r, c) {
  return r >= 0 && r < 3 && c >= 0 && c < 3;
}

function toArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
}

export function normalizeElementConfig(value, defaults = {}) {
  if (!value) return null;
  if (typeof value === 'string') {
    return { ...defaults, element: value.toUpperCase() };
  }
  if (typeof value === 'object') {
    const element = typeof value.element === 'string' ? value.element.toUpperCase() : undefined;
    return { ...defaults, ...value, ...(element ? { element } : {}) };
  }
  return null;
}

export function samePossessionSource(a, b) {
  if (!a || !b) return false;
  if (a.tag && b.tag && a.tag !== b.tag) return false;
  if (a.auraId && b.auraId && a.auraId !== b.auraId) return false;
  if (a.uid != null && b.uid != null && a.uid === b.uid) return true;
  if (a.position && b.position) {
    if (a.position.r === b.position.r && a.position.c === b.position.c) return true;
  }
  if (a.tplId && b.tplId) {
    if (a.tplId === b.tplId && a.owner === b.owner) return true;
  }
  return false;
}

export function buildPossessionSource(state, r, c, unit, tpl, extra = {}) {
  return {
    uid: unit?.uid ?? null,
    tplId: tpl?.id || unit?.tplId || null,
    owner: unit?.owner,
    position: { r, c },
    turn: state?.turn ?? 0,
    ...extra,
  };
}

function applyPossession(state, targetR, targetC, owner, source) {
  const targetUnit = state?.board?.[targetR]?.[targetC]?.unit;
  if (!targetUnit) return null;
  const tplTarget = CARDS[targetUnit.tplId];
  const originalOwner = targetUnit.possessed?.originalOwner ?? targetUnit.owner;
  targetUnit.owner = owner;
  targetUnit.possessed = {
    by: owner,
    originalOwner,
    source,
    sinceTurn: state?.turn ?? 0,
    targetTplId: tplTarget?.id ?? targetUnit.tplId,
  };
  targetUnit.lastAttackTurn = state?.turn ?? 0;
  return {
    r: targetR,
    c: targetC,
    originalOwner,
    newOwner: owner,
    targetTplId: tplTarget?.id ?? targetUnit.tplId,
  };
}

export function applyElementalPossessionOnSummon(state, r, c, unit, tpl) {
  const cfg = normalizeElementConfig(tpl?.gainPossessionEnemiesOnElement, { requireDifferentField: true });
  if (!cfg?.element) return [];
  const cellElement = state?.board?.[r]?.[c]?.element;
  const requireDiff = cfg.requireDifferentField !== false;
  if (requireDiff && cellElement === cfg.element) return [];
  const events = [];
  for (let rr = 0; rr < 3; rr++) {
    for (let cc = 0; cc < 3; cc++) {
      const targetCell = state?.board?.[rr]?.[cc];
      const targetUnit = targetCell?.unit;
      if (!targetUnit) continue;
      if (targetUnit.owner === unit.owner) continue;
      if (targetCell.element !== cfg.element) continue;
      const source = buildPossessionSource(state, r, c, unit, tpl, {
        tag: 'ELEMENTAL_SUMMON',
        element: cfg.element,
      });
      const ev = applyPossession(state, rr, cc, unit.owner, source);
      if (ev) events.push(ev);
    }
  }
  return events;
}

function normalizeDirections(rawDirections) {
  const list = toArray(rawDirections);
  if (!list.length) list.push('ADJACENT');
  const result = [];
  const seen = new Set();
  for (const raw of list) {
    if (!raw) continue;
    let value = raw;
    if (typeof value === 'string') value = value.toUpperCase();
    if (value === 'ADJACENT' || value === 'ORTHOGONAL' || value === 'ALL_ADJACENT') {
      for (const dir of ['N', 'E', 'S', 'W']) {
        const key = `ABS:${dir}`;
        if (!seen.has(key)) {
          seen.add(key);
          result.push({ type: 'ABS', dir });
        }
      }
      continue;
    }
    if (['N', 'E', 'S', 'W'].includes(value)) {
      const key = `ABS:${value}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push({ type: 'ABS', dir: value });
      }
      continue;
    }
    if (value === 'FRONT' || value === 'FORWARD') {
      const key = 'REL:FRONT';
      if (!seen.has(key)) { seen.add(key); result.push({ type: 'REL', dir: 'FRONT' }); }
      continue;
    }
    if (value === 'BACK' || value === 'BACKWARD') {
      const key = 'REL:BACK';
      if (!seen.has(key)) { seen.add(key); result.push({ type: 'REL', dir: 'BACK' }); }
      continue;
    }
    if (value === 'LEFT') {
      const key = 'REL:LEFT';
      if (!seen.has(key)) { seen.add(key); result.push({ type: 'REL', dir: 'LEFT' }); }
      continue;
    }
    if (value === 'RIGHT') {
      const key = 'REL:RIGHT';
      if (!seen.has(key)) { seen.add(key); result.push({ type: 'REL', dir: 'RIGHT' }); }
      continue;
    }
  }
  if (!result.length) {
    for (const dir of ['N', 'E', 'S', 'W']) {
      const key = `ABS:${dir}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push({ type: 'ABS', dir });
      }
    }
  }
  return result;
}

function normalizeAuraConfig(raw, index = 0) {
  if (!raw) return null;
  const cfg = typeof raw === 'object' ? { ...raw } : { directions: raw };
  const id = typeof cfg.id === 'string'
    ? cfg.id
    : typeof cfg.key === 'string'
      ? cfg.key
      : `AURA_${index}`;
  const element = typeof cfg.element === 'string' ? cfg.element.toUpperCase() : null;
  const requireSourceOnElement = cfg.requireSourceOnElement ?? cfg.requireSourceElement ?? false;
  const rangeRaw = Number(cfg.range ?? 1);
  const range = Number.isFinite(rangeRaw) && rangeRaw > 0 ? Math.floor(rangeRaw) : 1;
  const directions = normalizeDirections(cfg.directions ?? cfg.pattern);
  const tag = typeof cfg.tag === 'string' ? cfg.tag : DEFAULT_AURA_TAG;
  return {
    id,
    tag,
    element,
    requireSourceOnElement: !!requireSourceOnElement && !!element,
    directions,
    range,
  };
}

function collectAuraConfigs(tpl) {
  if (!tpl) return [];
  const list = [];
  if (tpl.possessionAura) list.push(tpl.possessionAura);
  if (Array.isArray(tpl.possessionAuras)) list.push(...tpl.possessionAuras);
  const res = [];
  let idx = 0;
  for (const raw of list) {
    const cfg = normalizeAuraConfig(raw, idx);
    idx += 1;
    if (cfg) res.push(cfg);
  }
  return res;
}

function resolveRelativeDir(facing, rel) {
  const table = RELATIVE_DIRS[rel];
  if (!table) return null;
  return table[facing] || null;
}

function gatherAuraTargets(state, r, c, unit, tpl, cfg, desired) {
  const cellElement = state?.board?.[r]?.[c]?.element;
  if (cfg.requireSourceOnElement && cfg.element && cellElement !== cfg.element) {
    return;
  }
  for (const entry of cfg.directions) {
    let absDir = null;
    if (entry.type === 'ABS') {
      absDir = entry.dir;
    } else if (entry.type === 'REL') {
      absDir = resolveRelativeDir(unit.facing, entry.dir);
    }
    if (!absDir) continue;
    const vec = DIR_VECTORS[absDir];
    if (!vec) continue;
    for (let step = 1; step <= cfg.range; step++) {
      const nr = r + vec[0] * step;
      const nc = c + vec[1] * step;
      if (!inBounds(nr, nc)) break;
      const key = `${nr},${nc}`;
      if (desired.has(key)) continue;
      const targetUnit = state?.board?.[nr]?.[nc]?.unit;
      if (!targetUnit) continue;
      if (targetUnit.owner === unit.owner) continue;
      const tplTarget = CARDS[targetUnit.tplId];
      if (!tplTarget) continue;
      const source = buildPossessionSource(state, r, c, unit, tpl, {
        tag: cfg.tag,
        auraId: cfg.id,
        element: cfg.element || null,
      });
      const existing = targetUnit.possessed;
      if (existing && !samePossessionSource(existing.source, source)) continue;
      desired.set(key, {
        owner: unit.owner,
        source,
        targetTplId: tplTarget?.id ?? targetUnit.tplId,
      });
    }
  }
}

export function refreshPossessionAuras(state) {
  const events = { gained: [], released: [] };
  if (!state?.board) return events;

  const desired = new Map();

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const unit = state.board?.[r]?.[c]?.unit;
      if (!unit) continue;
      const tpl = CARDS[unit.tplId];
      if (!tpl) continue;
      const configs = collectAuraConfigs(tpl);
      if (!configs.length) continue;
      for (const cfg of configs) {
        gatherAuraTargets(state, r, c, unit, tpl, cfg, desired);
      }
    }
  }

  for (let rr = 0; rr < 3; rr++) {
    for (let cc = 0; cc < 3; cc++) {
      const unit = state.board?.[rr]?.[cc]?.unit;
      if (!unit?.possessed) continue;
      const src = unit.possessed.source;
      if (!src) continue;
      const tagged = (src.tag === DEFAULT_AURA_TAG) || (typeof src.auraId === 'string');
      if (!tagged) continue;
      const key = `${rr},${cc}`;
      const intent = desired.get(key);
      if (intent && samePossessionSource(src, intent.source)) {
        unit.owner = intent.owner;
        unit.possessed.by = intent.owner;
        unit.possessed.source = intent.source;
        if (!unit.possessed.targetTplId) {
          unit.possessed.targetTplId = intent.targetTplId;
        }
        continue;
      }
      const originalOwner = unit.possessed.originalOwner;
      unit.owner = originalOwner;
      const tplTarget = CARDS[unit.tplId];
      events.released.push({
        r: rr,
        c: cc,
        owner: originalOwner,
        targetTplId: tplTarget?.id ?? unit.tplId,
      });
      delete unit.possessed;
    }
  }

  for (const [key, intent] of desired.entries()) {
    const [rrRaw, ccRaw] = key.split(',');
    const rr = Number(rrRaw);
    const cc = Number(ccRaw);
    if (!Number.isFinite(rr) || !Number.isFinite(cc)) continue;
    const unit = state.board?.[rr]?.[cc]?.unit;
    if (!unit) continue;
    if (unit.possessed) {
      if (samePossessionSource(unit.possessed.source, intent.source)) {
        unit.owner = intent.owner;
        unit.possessed.by = intent.owner;
        unit.possessed.source = intent.source;
        if (!unit.possessed.targetTplId) unit.possessed.targetTplId = intent.targetTplId;
      }
      continue;
    }
    const ev = applyPossession(state, rr, cc, intent.owner, intent.source);
    if (ev) events.gained.push(ev);
  }

  return events;
}


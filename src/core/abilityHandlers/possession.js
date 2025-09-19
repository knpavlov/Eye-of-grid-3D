// Модуль для обработки постоянных эффектов владения (possession)
import { CARDS } from '../cards.js';

// Вспомогательные структуры — держим локально, чтобы избежать циклических импортов
const DIR4 = [
  { dr: -1, dc: 0 },
  { dr: 0, dc: 1 },
  { dr: 1, dc: 0 },
  { dr: 0, dc: -1 },
];
const DIAGONALS = [
  { dr: -1, dc: -1 },
  { dr: -1, dc: 1 },
  { dr: 1, dc: -1 },
  { dr: 1, dc: 1 },
];
const FACING_VECTORS = {
  N: { dr: -1, dc: 0 },
  E: { dr: 0, dc: 1 },
  S: { dr: 1, dc: 0 },
  W: { dr: 0, dc: -1 },
};

const DEFAULT_EFFECT = {
  ADJACENT: 'POSSESSION_ADJACENT',
  ADJACENT_ON_ELEMENT: 'POSSESSION_ADJACENT',
  FRONT_SINGLE: 'POSSESSION_FRONT_SINGLE',
};

function inBounds(r, c) {
  return r >= 0 && r < 3 && c >= 0 && c < 3;
}

function getUnitTemplate(unit) {
  if (!unit) return null;
  return CARDS[unit.tplId] || null;
}

function toArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizeBehavior(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    const keyword = raw.toUpperCase();
    return {
      keyword,
      effectKey: DEFAULT_EFFECT[keyword] || `POSSESSION_${keyword}`,
      includeDiagonals: false,
      range: 1,
    };
  }
  if (typeof raw === 'object') {
    const keywordRaw = raw.keyword || raw.type || raw.kind;
    if (!keywordRaw) return null;
    const keyword = String(keywordRaw).toUpperCase();
    const effectKey = raw.effect || raw.effectKey || DEFAULT_EFFECT[keyword] || `POSSESSION_${keyword}`;
    const elementRaw = raw.element || raw.requireElement;
    const requireElement = elementRaw ? String(elementRaw).toUpperCase() : null;
    const includeDiagonals = !!raw.includeDiagonals;
    const rangeValue = Number.isFinite(raw.range) ? Number(raw.range) : 1;
    const range = Math.max(1, rangeValue || 1);
    return {
      keyword,
      effectKey,
      requireElement,
      includeDiagonals,
      range,
    };
  }
  return null;
}

function collectBehaviors(tpl) {
  const result = [];
  if (!tpl) return result;
  for (const raw of toArray(tpl.possessionBehaviors)) {
    const behavior = normalizeBehavior(raw);
    if (behavior) result.push(behavior);
  }
  for (const raw of toArray(tpl.possessionBehavior)) {
    const behavior = normalizeBehavior(raw);
    if (behavior) result.push(behavior);
  }
  for (const raw of toArray(tpl.possessionRules)) {
    const behavior = normalizeBehavior(raw);
    if (behavior) result.push(behavior);
  }
  return result;
}

function collectAdjacentTargets(r, c, behavior) {
  const dirs = behavior.includeDiagonals ? DIR4.concat(DIAGONALS) : DIR4;
  const cells = [];
  for (const { dr, dc } of dirs) {
    const nr = r + dr;
    const nc = c + dc;
    if (!inBounds(nr, nc)) continue;
    cells.push({ r: nr, c: nc });
  }
  return cells;
}

function collectFrontTargets(state, r, c, unit, behavior) {
  const vec = FACING_VECTORS[unit?.facing] || FACING_VECTORS.N;
  if (!vec) return [];
  const cells = [];
  let nr = r + vec.dr;
  let nc = c + vec.dc;
  for (let step = 1; step <= behavior.range; step += 1) {
    if (!inBounds(nr, nc)) break;
    cells.push({ r: nr, c: nc });
    const occupant = state?.board?.[nr]?.[nc]?.unit;
    if (occupant) break; // дальше по линии не смотрим
    nr += vec.dr;
    nc += vec.dc;
  }
  return cells;
}

function collectTargetsForBehavior(state, r, c, unit, behavior) {
  switch (behavior.keyword) {
    case 'ADJACENT':
    case 'ADJACENT_ON_ELEMENT':
      return collectAdjacentTargets(r, c, behavior);
    case 'FRONT_SINGLE':
      return collectFrontTargets(state, r, c, unit, behavior);
    default:
      return [];
  }
}

export function buildPossessionSourceDescriptor(state, r, c, unit, tpl, extra = {}) {
  return {
    uid: unit?.uid ?? null,
    tplId: tpl?.id || unit?.tplId || null,
    owner: unit?.owner,
    position: { r, c },
    turn: state?.turn ?? 0,
    ...extra,
  };
}

export function refreshContinuousPossessions(state, opts = {}) {
  const { collectEvents = true } = opts || {};
  const events = { acquired: [], released: [] };
  if (!state?.board) return events;

  const desired = new Map();
  const effectCatalog = new Set();

  for (let r = 0; r < 3; r += 1) {
    for (let c = 0; c < 3; c += 1) {
      const cell = state.board?.[r]?.[c];
      const unit = cell?.unit;
      if (!unit) continue;
      if ((unit.currentHP ?? getUnitTemplate(unit)?.hp ?? 0) <= 0) continue;
      const tpl = getUnitTemplate(unit);
      const behaviors = collectBehaviors(tpl);
      if (!behaviors.length) continue;
      for (const behavior of behaviors) {
        effectCatalog.add(behavior.effectKey);
        if (behavior.requireElement) {
          if (!cell?.element || cell.element !== behavior.requireElement) continue;
        }
        const targets = collectTargetsForBehavior(state, r, c, unit, behavior);
        if (!targets.length) continue;
        for (const target of targets) {
          const key = `${target.r},${target.c}`;
          if (desired.has(key)) continue;
          const targetUnit = state.board?.[target.r]?.[target.c]?.unit;
          if (!targetUnit) continue;
          if ((targetUnit.currentHP ?? getUnitTemplate(targetUnit)?.hp ?? 0) <= 0) continue;
          if (targetUnit.owner === unit.owner) continue;
          const tplTarget = getUnitTemplate(targetUnit);
          const existing = targetUnit.possessed;
          const originalOwner = existing?.originalOwner ?? targetUnit.owner;
          const source = buildPossessionSourceDescriptor(state, r, c, unit, tpl, {
            effect: behavior.effectKey,
            keyword: behavior.keyword,
          });
          desired.set(key, {
            r: target.r,
            c: target.c,
            newOwner: unit.owner,
            originalOwner,
            source,
            effectKey: behavior.effectKey,
            sourceTplId: tpl?.id || unit.tplId,
            targetTplId: tplTarget?.id || targetUnit.tplId,
          });
        }
      }
    }
  }

  for (let r = 0; r < 3; r += 1) {
    for (let c = 0; c < 3; c += 1) {
      const unit = state.board?.[r]?.[c]?.unit;
      if (!unit) continue;
      const key = `${r},${c}`;
      const desiredEntry = desired.get(key);
      if (desiredEntry) {
        const tplTarget = getUnitTemplate(unit);
        const existing = unit.possessed;
        const alreadyControlled = existing
          && existing.by === desiredEntry.newOwner
          && existing.source?.uid === desiredEntry.source?.uid
          && existing.source?.effect === desiredEntry.effectKey;
        if (!alreadyControlled) {
          const originalOwner = existing?.originalOwner ?? desiredEntry.originalOwner ?? unit.owner;
          unit.owner = desiredEntry.newOwner;
          unit.possessed = {
            by: desiredEntry.newOwner,
            originalOwner,
            source: desiredEntry.source,
            sinceTurn: state?.turn ?? 0,
            targetTplId: desiredEntry.targetTplId,
            effect: desiredEntry.effectKey,
          };
          unit.lastAttackTurn = state?.turn ?? 0;
          if (collectEvents) {
            events.acquired.push({
              r,
              c,
              newOwner: desiredEntry.newOwner,
              originalOwner,
              sourceTplId: desiredEntry.sourceTplId,
              targetTplId: desiredEntry.targetTplId,
              effect: desiredEntry.effectKey,
            });
          }
        } else {
          unit.owner = desiredEntry.newOwner;
          unit.possessed = {
            ...existing,
            source: desiredEntry.source,
            effect: desiredEntry.effectKey,
            targetTplId: desiredEntry.targetTplId,
          };
        }
        continue;
      }

      const info = unit.possessed;
      if (!info) continue;
      const effectKey = info.effect;
      if (!effectKey || !effectCatalog.has(effectKey)) continue;
      const originalOwner = info.originalOwner ?? unit.owner;
      if (unit.owner !== originalOwner) {
        unit.owner = originalOwner;
      }
      delete unit.possessed;
      if (collectEvents) {
        events.released.push({
          r,
          c,
          originalOwner,
          targetTplId: unit.tplId,
          effect: effectKey,
        });
      }
    }
  }

  return events;
}

export function formatPossessionEvents(events) {
  const lines = [];
  if (!events) return lines;
  const toName = (tplId) => {
    const tpl = tplId ? CARDS[tplId] : null;
    return tpl?.name || 'Существо';
  };
  for (const ev of events.acquired || []) {
    const sourceName = toName(ev.sourceTplId);
    const targetName = toName(ev.targetTplId);
    const ownerLabel = typeof ev.newOwner === 'number'
      ? `игроку ${ev.newOwner + 1}`
      : 'новому владельцу';
    lines.push(`${sourceName}: ${targetName} переходит под контроль ${ownerLabel}.`);
  }
  for (const ev of events.released || []) {
    const targetName = toName(ev.targetTplId);
    const ownerLabel = typeof ev.originalOwner === 'number'
      ? `игрока ${ev.originalOwner + 1}`
      : 'исходного владельца';
    lines.push(`${targetName}: контроль возвращается к ${ownerLabel}.`);
  }
  return lines;
}

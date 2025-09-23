// Модуль обработки эффектов добора карт при призыве существ
// Логика полностью отделена от визуальной части, чтобы упростить перенос на другие движки
import { CARDS } from '../cards.js';
import { drawOneNoAdd } from '../board.js';
import { normalizeElementName, normalizeElementSet } from '../utils/elements.js';

function normalizeFieldDrawConfig(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    const element = normalizeElementName(raw);
    if (!element) return null;
    return { element, limit: null, includeSelf: true, includeCenter: true, min: 0 };
  }
  if (typeof raw === 'object') {
    const element = normalizeElementName(raw.element || raw.field || raw.elementType);
    if (!element) return null;
    const limitRaw = raw.limit ?? raw.max ?? raw.maximum ?? null;
    const minRaw = raw.min ?? raw.minimum ?? 0;
    return {
      element,
      limit: Number.isFinite(limitRaw) ? Math.max(0, Math.floor(limitRaw)) : null,
      includeSelf: raw.includeSelf !== false,
      includeCenter: raw.includeCenter !== false,
      min: Number.isFinite(minRaw) ? Math.max(0, Math.floor(minRaw)) : 0,
    };
  }
  return null;
}

function countMatchingFields(state, cfg) {
  if (!state?.board) return 0;
  const element = cfg?.element || null;
  let count = 0;
  for (let r = 0; r < 3; r += 1) {
    for (let c = 0; c < 3; c += 1) {
      if (!cfg.includeCenter && r === 1 && c === 1) continue;
      if (!cfg.includeSelf && r === cfg?.self?.r && c === cfg?.self?.c) continue;
      const cellEl = normalizeElementName(state.board?.[r]?.[c]?.element || null);
      if (element && cellEl !== element) continue;
      count += 1;
    }
  }
  return count;
}

function normalizeDrawCondition(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    const el = normalizeElementName(raw);
    return el ? { cellElement: el } : null;
  }
  if (typeof raw === 'object') {
    const cond = {};
    const cellElement = normalizeElementName(raw.cellElement || raw.element || raw.field || raw.fieldElement);
    if (cellElement) cond.cellElement = cellElement;
    const cellElementNot = normalizeElementName(raw.cellElementNot || raw.notElement || raw.notField || raw.exclude);
    if (cellElementNot) cond.cellElementNot = cellElementNot;
    const includeSet = normalizeElementSet(raw.cellElementIn || raw.allowedElements || raw.elements || raw.oneOf);
    if (includeSet.size) cond.cellElementIn = includeSet;
    const excludeSet = normalizeElementSet(raw.cellElementNotIn || raw.excludeElements || raw.notIn);
    if (excludeSet.size) cond.cellElementNotIn = excludeSet;
    return Object.keys(cond).length ? cond : null;
  }
  return null;
}

function normalizeDirectDrawConfig(raw) {
  if (!raw) return null;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null;
    return { amount: Math.max(0, Math.floor(raw)), min: 0, limit: null, condition: null };
  }
  if (raw === true) {
    return { amount: 1, min: 0, limit: null, condition: null };
  }
  if (typeof raw === 'object') {
    const amountRaw = raw.amount ?? raw.count ?? raw.cards ?? raw.value ?? raw.draw ?? 1;
    const limitRaw = raw.limit ?? raw.max ?? raw.maximum ?? null;
    const minRaw = raw.min ?? raw.minimum ?? 0;
    const amount = Number.isFinite(amountRaw) ? Math.max(0, Math.floor(amountRaw)) : 0;
    return {
      amount,
      limit: Number.isFinite(limitRaw) ? Math.max(0, Math.floor(limitRaw)) : null,
      min: Number.isFinite(minRaw) ? Math.max(0, Math.floor(minRaw)) : 0,
      condition: normalizeDrawCondition(raw.condition || raw.when || raw.if),
    };
  }
  return null;
}

function evaluateDirectCondition(state, r, c, cond) {
  if (!cond) return true;
  const cellElement = normalizeElementName(state?.board?.[r]?.[c]?.element || null);
  if (cond.cellElement && cellElement !== cond.cellElement) return false;
  if (cond.cellElementNot && cellElement === cond.cellElementNot) return false;
  if (cond.cellElementIn && cond.cellElementIn.size && !cond.cellElementIn.has(cellElement)) return false;
  if (cond.cellElementNotIn && cond.cellElementNotIn.has(cellElement)) return false;
  return true;
}

function computeFieldDraw(state, r, c, cfg) {
  if (!cfg?.element) return null;
  const count = countMatchingFields(state, { ...cfg, self: { r, c } });
  const limited = cfg.limit != null ? Math.min(cfg.limit, count) : count;
  const amount = Math.max(cfg.min || 0, limited);
  if (amount <= 0) return null;
  return {
    amount,
    reason: { type: 'FIELD_COUNT', element: cfg.element, counted: count },
  };
}

function computeDirectDraw(state, r, c, cfg) {
  if (!cfg) return null;
  if (!evaluateDirectCondition(state, r, c, cfg.condition)) return null;
  const limit = cfg.limit != null ? Math.max(0, Math.floor(cfg.limit)) : null;
  const amountBase = Math.max(cfg.min || 0, cfg.amount || 0);
  const amount = limit != null ? Math.min(limit, amountBase) : amountBase;
  if (amount <= 0) return null;
  return {
    amount,
    reason: { type: 'DIRECT', condition: cfg.condition || null },
  };
}

function drawCardsForPlayer(state, owner, amount) {
  if (!state?.players || owner == null) return { drawn: 0, cards: [] };
  const player = state.players[owner];
  if (!player) return { drawn: 0, cards: [] };
  const drawn = [];
  for (let i = 0; i < amount; i += 1) {
    const card = drawOneNoAdd(state, owner);
    if (!card) break;
    player.hand.push(card);
    drawn.push(card);
  }
  return { drawn: drawn.length, cards: drawn };
}

export function computeSummonDraw(state, r, c, tpl) {
  if (!tpl) return null;
  const fieldCfg = normalizeFieldDrawConfig(tpl.drawOnSummonByElementFields);
  if (fieldCfg) {
    const info = computeFieldDraw(state, r, c, fieldCfg);
    if (info) return info;
  }
  const directCfg = normalizeDirectDrawConfig(tpl.drawCardsOnSummon);
  if (directCfg) {
    const info = computeDirectDraw(state, r, c, directCfg);
    if (info) return info;
  }
  return null;
}

export function applySummonDraw(state, r, c, unit, tpl) {
  const info = computeSummonDraw(state, r, c, tpl);
  if (!info || !unit) return { drawn: 0, cards: [], reason: null };
  const res = drawCardsForPlayer(state, unit.owner, info.amount);
  return { ...res, reason: info.reason };
}

function isUnitAlive(unit, tpl) {
  if (!unit || !tpl) return false;
  if (typeof unit.currentHP === 'number') return unit.currentHP > 0;
  if (typeof tpl.hp === 'number') return tpl.hp > 0;
  return true;
}

function isAdjacent(r1, c1, r2, c2) {
  if (!Number.isInteger(r1) || !Number.isInteger(c1) || !Number.isInteger(r2) || !Number.isInteger(c2)) return false;
  return Math.abs(r1 - r2) + Math.abs(c1 - c2) === 1;
}

function normalizeAdjacentDrawConfig(raw) {
  if (!raw) return null;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null;
    return { amount: Math.max(0, Math.floor(raw)), ownerMode: 'ALLY' };
  }
  if (raw === true) {
    return { amount: 1, ownerMode: 'ALLY' };
  }
  if (typeof raw === 'object') {
    const amountRaw = raw.amount ?? raw.count ?? raw.cards ?? 1;
    const ownerCode = String(raw.owner || raw.scope || raw.ownerMode || 'ALLY').toUpperCase();
    const ownerMode = ownerCode === 'ENEMY' ? 'ENEMY' : 'ALLY';
    const sourceElement = normalizeElementName(raw.sourceElement || raw.sourceOnElement || raw.selfElement || raw.field || raw.element);
    const sourceElementNot = normalizeElementName(raw.sourceElementNot || raw.notSourceElement);
    const summonFieldElement = normalizeElementName(raw.summonFieldElement || raw.targetField || raw.summonField);
    const summonFieldNot = normalizeElementName(raw.summonFieldNot || raw.notSummonField);
    const amount = Number.isFinite(amountRaw) ? Math.max(0, Math.floor(amountRaw)) : 0;
    return {
      amount,
      ownerMode,
      sourceElement,
      sourceElementNot,
      summonFieldElement,
      summonFieldNot,
    };
  }
  return null;
}

export function applyAdjacentAllySummonDraws(state, context = {}) {
  const result = { draws: [] };
  if (!state?.board) return result;
  const { r, c, unit } = context;
  if (!Number.isInteger(r) || !Number.isInteger(c) || !unit) return result;
  const ownerSummoned = unit.owner;
  if (ownerSummoned == null) return result;
  const tplSummoned = context.tpl || CARDS[unit.tplId] || null;

  for (let rr = 0; rr < state.board.length; rr += 1) {
    for (let cc = 0; cc < state.board[rr].length; cc += 1) {
      if (!isAdjacent(rr, cc, r, c)) continue;
      const watcherCell = state.board?.[rr]?.[cc];
      const watcher = watcherCell?.unit;
      if (!watcher) continue;
      const tplWatcher = CARDS[watcher.tplId];
      if (!tplWatcher) continue;
      const cfg = normalizeAdjacentDrawConfig(tplWatcher.drawOnAdjacentAllySummon);
      if (!cfg || cfg.amount <= 0) continue;
      if (!isUnitAlive(watcher, tplWatcher)) continue;
      if (cfg.ownerMode === 'ALLY' && watcher.owner !== ownerSummoned) continue;
      if (cfg.ownerMode === 'ENEMY' && watcher.owner === ownerSummoned) continue;
      const cellElement = normalizeElementName(watcherCell?.element || null);
      if (cfg.sourceElement && cellElement !== cfg.sourceElement) continue;
      if (cfg.sourceElementNot && cellElement === cfg.sourceElementNot) continue;
      const summonCellElement = normalizeElementName(state.board?.[r]?.[c]?.element || null);
      if (cfg.summonFieldElement && summonCellElement !== cfg.summonFieldElement) continue;
      if (cfg.summonFieldNot && summonCellElement === cfg.summonFieldNot) continue;
      const drawRes = drawCardsForPlayer(state, watcher.owner, cfg.amount);
      if (!drawRes.drawn) continue;
      result.draws.push({
        player: watcher.owner,
        count: drawRes.drawn,
        cards: drawRes.cards,
        element: cellElement,
        source: {
          type: 'ADJACENT_ALLY_SUMMON',
          watcher: { r: rr, c: cc, tplId: tplWatcher.id },
          summoned: { r, c, tplId: tplSummoned?.id || unit.tplId },
        },
      });
    }
  }

  return result;
}

export default {
  computeSummonDraw,
  applySummonDraw,
  applyAdjacentAllySummonDraws,
};

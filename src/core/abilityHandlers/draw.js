// Модуль обработки эффектов добора карт
// Логика отделена от визуального слоя для упрощения миграции на другие движки
import { drawOneNoAdd } from '../board.js';
import { DIR_VECTORS, inBounds } from '../constants.js';
import { CARDS } from '../cards.js';
import { normalizeElementName } from '../utils/elements.js';

function toInt(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return Math.max(0, Math.floor(fallback));
  return Math.max(0, Math.floor(num));
}

function drawCardsForPlayer(state, player, amount) {
  const result = { requested: toInt(amount, 0), count: 0, cards: [] };
  if (!state?.players || player == null) return result;
  const pl = state.players[player];
  if (!pl) return result;
  const iterations = result.requested;
  for (let i = 0; i < iterations; i += 1) {
    const card = drawOneNoAdd(state, player);
    if (!card) break;
    pl.hand.push(card);
    result.cards.push(card);
  }
  result.count = result.cards.length;
  return result;
}

function normalizeFieldCountConfig(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    const element = normalizeElementName(raw);
    return element ? { element, includeSelf: true, includeCenter: true, limit: null, min: 0 } : null;
  }
  if (typeof raw === 'object') {
    const element = normalizeElementName(raw.element || raw.field || raw.elementType);
    if (!element) return null;
    const limit = raw.limit ?? raw.max ?? raw.maximum ?? null;
    const includeSelf = raw.includeSelf !== false;
    const includeCenter = raw.includeCenter !== false;
    const min = raw.min ?? raw.minimum ?? 0;
    return {
      element,
      includeSelf,
      includeCenter,
      limit: limit != null ? Math.max(0, Math.floor(limit)) : null,
      min: Math.max(0, Math.floor(min)),
    };
  }
  return null;
}

function countMatchingFields(state, cfg) {
  if (!state?.board || !cfg?.element) return 0;
  let count = 0;
  for (let r = 0; r < state.board.length; r += 1) {
    const row = state.board[r];
    if (!Array.isArray(row)) continue;
    for (let c = 0; c < row.length; c += 1) {
      if (!cfg.includeCenter && r === 1 && c === 1) continue;
      if (!cfg.includeSelf && r === cfg.self?.r && c === cfg.self?.c) continue;
      const cellElement = normalizeElementName(row[c]?.element);
      if (cellElement !== cfg.element) continue;
      count += 1;
    }
  }
  return count;
}

export function computeSummonDraw(state, r, c, tpl) {
  if (!tpl) return null;
  const cfgRaw = tpl.drawOnSummonByElementFields || tpl.drawCardsOnSummon;
  const cfg = normalizeFieldCountConfig(cfgRaw);
  if (!cfg) return null;
  const amount = countMatchingFields(state, { ...cfg, self: { r, c } });
  const limited = cfg.limit != null ? Math.min(cfg.limit, amount) : amount;
  const final = Math.max(cfg.min || 0, limited);
  if (final <= 0) return null;
  return { element: cfg.element, amount: final };
}

function normalizeOffElementConfig(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    const element = normalizeElementName(raw);
    return element ? { element, amount: 1 } : null;
  }
  if (typeof raw === 'object') {
    const element = normalizeElementName(raw.element || raw.field || raw.elementType);
    if (!element) return null;
    const amount = raw.amount ?? raw.count ?? raw.draw ?? raw.value ?? 1;
    return { element, amount: Math.max(0, Math.floor(amount)) || 0 };
  }
  return null;
}

function createEvent(base, extra = {}) {
  return {
    player: base.player,
    count: base.count,
    requested: base.requested,
    cards: base.cards,
    element: base.element ?? null,
    source: base.source || null,
    reason: base.reason || null,
    ...extra,
  };
}

export function applySummonDraw(state, r, c, unit, tpl) {
  const result = { drawn: 0, cards: [], events: [] };
  if (!tpl || !unit) return result;
  const owner = unit.owner;
  if (owner == null) return result;

  const fieldInfo = computeSummonDraw(state, r, c, tpl);
  if (fieldInfo && fieldInfo.amount > 0) {
    const drawRes = drawCardsForPlayer(state, owner, fieldInfo.amount);
    if (drawRes.count > 0) {
      result.events.push(createEvent({
        player: owner,
        count: drawRes.count,
        requested: drawRes.requested,
        cards: drawRes.cards,
        element: state?.board?.[r]?.[c]?.element || null,
        source: { type: 'SELF_SUMMON', r, c, tplId: tpl.id },
        reason: { type: 'FIELD_COUNT', element: fieldInfo.element },
      }));
    }
  }

  const offElementCfg = normalizeOffElementConfig(
    tpl.drawOnSummonIfFieldNotElement || tpl.drawOnSummonOffElement
  );
  if (offElementCfg && offElementCfg.amount > 0) {
    const fieldElement = normalizeElementName(state?.board?.[r]?.[c]?.element);
    if (!fieldElement || fieldElement !== offElementCfg.element) {
      const drawRes = drawCardsForPlayer(state, owner, offElementCfg.amount);
      if (drawRes.count > 0) {
        result.events.push(createEvent({
          player: owner,
          count: drawRes.count,
          requested: drawRes.requested,
          cards: drawRes.cards,
          element: state?.board?.[r]?.[c]?.element || null,
          source: { type: 'SELF_SUMMON', r, c, tplId: tpl.id },
          reason: { type: 'FIELD_MISMATCH', element: offElementCfg.element },
        }));
      }
    }
  }

  if (result.events.length) {
    result.drawn = result.events.reduce((acc, ev) => acc + (ev.count || 0), 0);
    result.cards = result.events.flatMap(ev => ev.cards || []);
  }
  return result;
}

function getAdjacentDrawConfig(tpl) {
  if (!tpl) return null;
  const raw = tpl.drawOnAllySummonAdjacent || tpl.drawOnAllySummonNearby;
  if (!raw) return null;
  if (raw === true) return { amount: 1 };
  if (typeof raw === 'number') return { amount: Math.max(0, Math.floor(raw)) };
  if (typeof raw === 'object') {
    const amount = Math.max(0, Math.floor(raw.amount ?? raw.count ?? raw.draw ?? 1));
    const sourceOnElement = normalizeElementName(
      raw.sourceOnElement || raw.sourceElement || raw.element || raw.field
    );
    const summonedElement = normalizeElementName(
      raw.requireSummonedElement || raw.summonedElement || raw.targetElement
    );
    return { amount, sourceOnElement, summonedElement };
  }
  return null;
}

export function applyAdjacentSummonDraws(state, context = {}) {
  const events = [];
  if (!state?.board) return events;
  const { r, c, unit } = context;
  if (typeof r !== 'number' || typeof c !== 'number' || !unit) return events;
  const owner = unit.owner;
  if (owner == null) return events;
  const tplSummoned = CARDS[unit.tplId];

  for (const [dir, vec] of Object.entries(DIR_VECTORS)) {
    const [dr, dc] = vec;
    const nr = r + dr;
    const nc = c + dc;
    if (!inBounds(nr, nc)) continue;
    const reactor = state.board?.[nr]?.[nc]?.unit;
    if (!reactor || reactor.owner !== owner) continue;
    const tplReactor = CARDS[reactor.tplId];
    const cfg = getAdjacentDrawConfig(tplReactor);
    if (!cfg || cfg.amount <= 0) continue;
    if (cfg.sourceOnElement) {
      const sourceElement = normalizeElementName(state.board?.[nr]?.[nc]?.element);
      if (sourceElement !== cfg.sourceOnElement) continue;
    }
    if (cfg.summonedElement) {
      const summonedElement = normalizeElementName(state.board?.[r]?.[c]?.element);
      if (summonedElement !== cfg.summonedElement) continue;
    }
    const drawRes = drawCardsForPlayer(state, owner, cfg.amount);
    if (drawRes.count <= 0) continue;
    events.push(createEvent({
      player: owner,
      count: drawRes.count,
      requested: drawRes.requested,
      cards: drawRes.cards,
      element: state?.board?.[r]?.[c]?.element || null,
      source: { type: 'ALLY_SUMMON_ADJACENT', dir, r: nr, c: nc, tplId: tplReactor?.id },
      reason: {
        type: 'ALLY_SUMMON_ADJACENT',
        sourceOnElement: cfg.sourceOnElement || null,
        summonedElement: cfg.summonedElement || null,
        summonedTplId: tplSummoned?.id || null,
      },
    }));
  }

  return events;
}

export default { applySummonDraw, applyAdjacentSummonDraws, computeSummonDraw };

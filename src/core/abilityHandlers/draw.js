// Модуль для добора карт по различным условиям
import { drawOneNoAdd } from '../board.js';

function toArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizeElement(value) {
  if (typeof value === 'string' && value) return value.toUpperCase();
  return null;
}

function normalizeFieldDrawConfig(raw) {
  if (!raw) return null;
  const [entry] = toArray(raw);
  if (!entry) return null;
  if (typeof entry === 'string') {
    const el = normalizeElement(entry);
    if (!el) return null;
    return { element: el, multiplier: 1 };
  }
  if (typeof entry === 'object') {
    const element = normalizeElement(entry.element || entry.field || (entry.elements ? entry.elements[0] : null));
    if (!element) return null;
    const multiplier = Number(entry.multiplier ?? entry.scale ?? 1) || 1;
    const min = Number.isFinite(entry.min) ? entry.min : null;
    const max = Number.isFinite(entry.max) ? entry.max : null;
    return { element, multiplier, min, max };
  }
  return null;
}

function countFieldsWithElement(state, element) {
  if (!state?.board || !element) return 0;
  let total = 0;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if (state.board?.[r]?.[c]?.element === element) total += 1;
    }
  }
  return total;
}

export function applyDrawOnSummon(state, context = {}) {
  const { tpl, owner } = context;
  if (!state || typeof owner !== 'number' || !tpl) return { draws: [] };
  const player = state.players?.[owner];
  if (!player) return { draws: [] };

  const results = [];
  const cfg = normalizeFieldDrawConfig(tpl.drawCardsOnSummonByFieldCount);
  if (cfg) {
    let count = countFieldsWithElement(state, cfg.element) * cfg.multiplier;
    if (cfg.min != null) count = Math.max(count, cfg.min);
    if (cfg.max != null) count = Math.min(count, cfg.max);
    const total = Math.max(0, Math.floor(count));
    const cards = [];
    for (let i = 0; i < total; i++) {
      const drawn = drawOneNoAdd(state, owner);
      if (!drawn) break;
      player.hand = Array.isArray(player.hand) ? player.hand : [];
      player.hand.push(drawn);
      cards.push(drawn);
    }
    if (cards.length) {
      results.push({ owner, cards, count: cards.length, element: cfg.element, reason: 'FIELD_COUNT' });
    }
  }

  return { draws: results };
}

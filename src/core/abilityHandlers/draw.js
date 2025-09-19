// Модуль обработки эффектов добора карт при призыве существ
// Вся логика изолирована от визуального слоя, чтобы облегчить перенос на другие движки
import { drawOneNoAdd } from '../board.js';

function normalizeConfig(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    return { element: raw.toUpperCase() };
  }
  if (typeof raw === 'object') {
    const element = raw.element || raw.field || raw.elementType;
    const limit = raw.limit || raw.max || null;
    const includeSelf = raw.includeSelf !== false;
    const includeCenter = raw.includeCenter !== false;
    const min = raw.min || raw.minimum || 0;
    return {
      element: element ? String(element).toUpperCase() : null,
      limit: typeof limit === 'number' && Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : null,
      includeSelf,
      includeCenter,
      min: typeof min === 'number' && Number.isFinite(min) ? Math.max(0, Math.floor(min)) : 0,
    };
  }
  return null;
}

function countMatchingFields(state, cfg) {
  if (!state?.board) return 0;
  const element = cfg?.element || null;
  let count = 0;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if (!cfg.includeCenter && r === 1 && c === 1) continue;
      if (!cfg.includeSelf && r === cfg?.self?.r && c === cfg?.self?.c) continue;
      const cellEl = state.board?.[r]?.[c]?.element || null;
      if (element && cellEl !== element) continue;
      count += 1;
    }
  }
  return count;
}

export function computeSummonDraw(state, r, c, tpl) {
  if (!tpl) return null;
  const cfgRaw = tpl.drawOnSummonByElementFields || tpl.drawCardsOnSummon;
  const cfg = normalizeConfig(cfgRaw);
  if (!cfg || !cfg.element) return null;
  const count = countMatchingFields(state, { ...cfg, self: { r, c } });
  const limited = cfg.limit != null ? Math.min(cfg.limit, count) : count;
  const amount = Math.max(cfg.min || 0, limited);
  if (amount <= 0) return null;
  return { element: cfg.element, amount };
}

export function applySummonDraw(state, r, c, unit, tpl) {
  const info = computeSummonDraw(state, r, c, tpl);
  if (!info || !unit) return { drawn: 0, cards: [] };
  const owner = unit.owner;
  if (owner == null || !state?.players?.[owner]) return { drawn: 0, cards: [] };
  const player = state.players[owner];
  const drawn = [];
  for (let i = 0; i < info.amount; i++) {
    const card = drawOneNoAdd(state, owner);
    if (!card) break;
    player.hand.push(card);
    drawn.push(card);
  }
  return { drawn: drawn.length, cards: drawn };
}

// Модуль обработки добора карт при призыве существ
import { drawOne } from '../board.js';

function normalizeElement(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.toUpperCase();
  if (typeof value === 'object' && value.element) {
    return String(value.element).toUpperCase();
  }
  return null;
}

function countFields(state, predicate) {
  if (!state?.board) return 0;
  let total = 0;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const cell = state.board?.[r]?.[c];
      if (cell && predicate(cell, r, c)) total += 1;
    }
  }
  return total;
}

function drawMultiple(state, owner, amount) {
  const events = [];
  if (!state?.players?.[owner]) return events;
  for (let i = 0; i < amount; i++) {
    const drawn = drawOne(state, owner);
    if (!drawn) break;
    events.push(drawn);
  }
  return events;
}

export function applySummonDraw(state, { owner, tpl }) {
  if (!state || !tpl || owner == null) return null;
  const cfg = tpl.drawCardsOnSummon;
  if (!cfg) return null;

  if (cfg.type === 'FIELDS_OF_ELEMENT' || typeof cfg === 'string') {
    const element = normalizeElement(cfg.element || (typeof cfg === 'string' ? cfg : null));
    if (!element) return null;
    const amount = countFields(state, cell => cell?.element === element);
    if (amount <= 0) return null;
    const cards = drawMultiple(state, owner, amount);
    if (!cards.length) return null;
    return { owner, cards, element, amount: cards.length };
  }

  if (typeof cfg === 'number' && Number.isFinite(cfg) && cfg > 0) {
    const amount = Math.floor(cfg);
    const cards = drawMultiple(state, owner, amount);
    if (!cards.length) return null;
    return { owner, cards, amount: cards.length };
  }

  return null;
}

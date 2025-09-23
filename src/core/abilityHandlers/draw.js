// Модуль обработки эффектов добора карт при призыве существ
// Вся логика изолирована от визуального слоя, чтобы облегчить перенос на другие движки
import { drawOneNoAdd } from '../board.js';

// Нормализация конфигурации добора по количеству полей определённой стихии
function normalizeFieldConfig(raw) {
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

function safeElement(value) {
  if (!value) return null;
  return String(value).toUpperCase();
}

// Упрощённый добор по условию клетки призыва
function normalizeDirectConfig(raw) {
  if (!raw) return null;
  if (raw === true) {
    return { amount: 1 };
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return { amount: Math.max(0, Math.floor(raw)) };
  }
  if (typeof raw === 'object') {
    const amountRaw = raw.amount ?? raw.count ?? 1;
    const requireField = raw.requireField ?? raw.requireElement ?? raw.field;
    const forbidField = raw.requireFieldNot ?? raw.excludeField ?? raw.forbidField ?? raw.forbidElement;
    const result = {
      amount: Math.max(0, Math.floor(typeof amountRaw === 'number' && Number.isFinite(amountRaw) ? amountRaw : 1)),
      requireField: safeElement(requireField),
      forbidField: safeElement(forbidField),
    };
    if (raw.reason) result.reason = String(raw.reason);
    return result;
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

// Подсчёт эффектов добора при призыве конкретного существа
export function computeSummonDraw(state, r, c, tpl) {
  const effects = [];
  if (!tpl) return effects;

  const cfgFields = normalizeFieldConfig(tpl.drawOnSummonByElementFields);
  if (cfgFields?.element) {
    const count = countMatchingFields(state, { ...cfgFields, self: { r, c } });
    const limited = cfgFields.limit != null ? Math.min(cfgFields.limit, count) : count;
    const amount = Math.max(cfgFields.min || 0, limited);
    if (amount > 0) {
      effects.push({
        amount,
        element: cfgFields.element,
        reason: 'FIELD_COUNT',
        source: { type: 'SELF_SUMMON', r, c, tplId: tpl?.id || null },
      });
    }
  }

  const cellElement = state?.board?.[r]?.[c]?.element || null;
  const cfgDirect = normalizeDirectConfig(tpl.drawCardsOnSummon);
  if (cfgDirect && cfgDirect.amount > 0) {
    if ((!cfgDirect.requireField || cfgDirect.requireField === cellElement)
      && (!cfgDirect.forbidField || cfgDirect.forbidField !== cellElement)) {
      effects.push({
        amount: cfgDirect.amount,
        element: cellElement,
        reason: cfgDirect.reason || 'FIELD_CONDITION',
        source: { type: 'SELF_SUMMON', r, c, tplId: tpl?.id || null },
      });
    }
  }

  return effects;
}

// Общая утилита добора карт без привязки к визуальному слою
export function drawCards(state, owner, amount) {
  const result = { drawn: 0, cards: [] };
  const safeAmount = Math.max(0, Math.floor(amount || 0));
  if (safeAmount <= 0) return result;
  if (!state?.players?.[owner]) return result;
  const player = state.players[owner];
  for (let i = 0; i < safeAmount; i++) {
    const card = drawOneNoAdd(state, owner);
    if (!card) break;
    player.hand.push(card);
    result.drawn += 1;
    result.cards.push(card);
  }
  return result;
}

export function applySummonDraw(state, r, c, unit, tpl) {
  const owner = unit?.owner;
  if (owner == null) return { drawn: 0, cards: [], details: [] };
  const effects = computeSummonDraw(state, r, c, tpl);
  if (!effects.length) return { drawn: 0, cards: [], details: [] };

  const aggregate = { drawn: 0, cards: [], details: [] };
  for (const eff of effects) {
    const draw = drawCards(state, owner, eff.amount);
    if (!draw.drawn) continue;
    aggregate.drawn += draw.drawn;
    aggregate.cards.push(...draw.cards);
    aggregate.details.push({
      amount: draw.drawn,
      cards: draw.cards,
      element: eff.element ?? (state?.board?.[r]?.[c]?.element || null),
      reason: eff.reason,
      source: eff.source || { type: 'SELF_SUMMON', r, c, tplId: tpl?.id || null },
    });
  }

  return aggregate;
}

// Модуль для вычисления динамических бонусов к атаке
// Держим чистую игровую логику без привязки к визуальному слою
import { countUnits } from '../board.js';
import { CARDS } from '../cards.js';
import { normalizeElementName } from '../utils/elements.js';

const BOARD_SIZE = 3;

function toArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizeTemplateSet(raw) {
  const ids = new Set();
  const names = new Set();
  for (const entry of toArray(raw)) {
    if (!entry) continue;
    const str = String(entry).trim();
    if (!str) continue;
    const cardById = CARDS[str];
    if (cardById?.id) {
      ids.add(cardById.id);
      if (cardById.name) names.add(cardById.name.toLowerCase());
      continue;
    }
    const cardByName = Object.values(CARDS).find(card => card?.name === str);
    if (cardByName?.id) {
      ids.add(cardByName.id);
      if (cardByName.name) names.add(cardByName.name.toLowerCase());
      continue;
    }
    ids.add(str.toUpperCase());
    names.add(str.toLowerCase());
  }
  return { ids, names };
}

function normalizeAllyTemplateConfig(raw) {
  if (!raw) return null;
  if (typeof raw === 'string' || Array.isArray(raw)) {
    const matcher = normalizeTemplateSet(raw);
    if (!matcher.ids.size && !matcher.names.size) return null;
    return {
      matcher,
      amountPer: 1,
      includeSelf: false,
      minCount: 0,
      maxCount: null,
    };
  }
  if (typeof raw === 'object') {
    const matcher = normalizeTemplateSet(raw.templates ?? raw.ids ?? raw.names ?? raw.cards ?? raw.list ?? raw.match);
    if (!matcher.ids.size && !matcher.names.size) return null;
    const amountPer = Number(raw.amountPer ?? raw.per ?? raw.amount ?? raw.plus ?? 1) || 0;
    const includeSelf = raw.includeSelf === true;
    const minCount = Number(raw.min ?? raw.minCount ?? 0) || 0;
    const maxCountRaw = raw.max ?? raw.maxCount ?? raw.cap ?? null;
    const maxCount = maxCountRaw != null ? Math.max(0, Math.floor(Number(maxCountRaw))) : null;
    return {
      matcher,
      amountPer,
      includeSelf,
      minCount: Math.max(0, Math.floor(minCount)),
      maxCount,
    };
  }
  return null;
}

function matchTemplate(unit, tpl, matcher) {
  if (!unit || !tpl || !matcher) return false;
  if (matcher.ids?.has(unit.tplId)) return true;
  if (matcher.ids?.has(tpl.id)) return true;
  const name = tpl.name ? tpl.name.toLowerCase() : '';
  if (name && matcher.names?.has(name)) return true;
  return false;
}

function countAlliedTemplates(state, r, c, owner, matcher, includeSelf) {
  if (!state?.board) return 0;
  let total = 0;
  for (let rr = 0; rr < BOARD_SIZE; rr++) {
    for (let cc = 0; cc < BOARD_SIZE; cc++) {
      if (!includeSelf && rr === r && cc === c) continue;
      const unit = state.board?.[rr]?.[cc]?.unit;
      if (!unit) continue;
      if (owner != null && unit.owner !== owner) continue;
      const tpl = CARDS[unit.tplId];
      if (!tpl) continue;
      if (matchTemplate(unit, tpl, matcher)) {
        total += 1;
      }
    }
  }
  return total;
}

function parseElementFromToken(token) {
  if (!token) return null;
  return normalizeElementName(token);
}

function normalizeElementConfig(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    const match = raw.match(/^([A-Z]+)_CREATURES$/);
    if (match) {
      return { type: 'ELEMENT_CREATURES', element: parseElementFromToken(match[1]) };
    }
    const direct = parseElementFromToken(raw);
    if (direct) {
      return { type: 'ELEMENT_CREATURES', element: direct };
    }
    return null;
  }
  if (typeof raw === 'object') {
    if (raw.type === 'ELEMENT_CREATURES' || raw.mode === 'ELEMENT_CREATURES') {
      const element = parseElementFromToken(raw.element || raw.elementType || raw.elementName);
      if (!element) return null;
      return { type: 'ELEMENT_CREATURES', element };
    }
    if (!raw.type && raw.element) {
      const element = parseElementFromToken(raw.element);
      if (!element) return null;
      return { type: 'ELEMENT_CREATURES', element };
    }
  }
  return null;
}

function countElementCreatures(state, element, opts = {}) {
  if (!state?.board || !element) return 0;
  let count = 0;
  for (let r = 0; r < state.board.length; r += 1) {
    const row = state.board[r];
    if (!Array.isArray(row)) continue;
    for (let c = 0; c < row.length; c += 1) {
      if (opts.exclude && r === opts.exclude.r && c === opts.exclude.c) continue;
      const unit = row[c]?.unit;
      if (!unit) continue;
      const tpl = CARDS[unit.tplId];
      if (!tpl) continue;
      const tplElement = parseElementFromToken(tpl.element);
      if (tplElement && tplElement === element) {
        count += 1;
      }
    }
  }
  return count;
}

function countAlliedElementCreatures(state, owner, element, opts = {}) {
  if (!state?.board || owner == null || !element) return 0;
  let total = 0;
  for (let r = 0; r < state.board.length; r += 1) {
    const row = state.board[r];
    if (!Array.isArray(row)) continue;
    for (let c = 0; c < row.length; c += 1) {
      if (!opts.includeSelf && opts.exclude && r === opts.exclude.r && c === opts.exclude.c) continue;
      const unit = row[c]?.unit;
      if (!unit || unit.owner !== owner) continue;
      const tpl = CARDS[unit.tplId];
      if (!tpl) continue;
      const tplElement = parseElementFromToken(tpl.element);
      if (tplElement && tplElement === element) {
        total += 1;
      }
    }
  }
  return total;
}

export function computeDynamicAttackBonus(state, r, c, tpl) {
  if (!tpl) return null;
  if (tpl.dynamicAtk) {
    const cfg = tpl.dynamicAtk;
    if (cfg === 'OTHERS_ON_BOARD') {
      const total = countUnits(state);
      const others = Math.max(0, total - 1);
      if (others <= 0) return null;
      return { amount: others, type: 'OTHERS_ON_BOARD', count: others };
    }
    const elementCfg = normalizeElementConfig(cfg);
    if (elementCfg?.type === 'ELEMENT_CREATURES' && elementCfg.element) {
      const count = countElementCreatures(state, elementCfg.element, { exclude: { r, c } });
      if (count <= 0) return null;
      return {
        amount: count,
        type: 'ELEMENT_CREATURES',
        element: elementCfg.element,
        count,
      };
    }
  }
  const allyCfg = normalizeAllyTemplateConfig(tpl.dynamicAtkAlliedTemplates);
  if (allyCfg && allyCfg.amountPer !== 0) {
    const owner = state?.board?.[r]?.[c]?.unit?.owner;
    const includeSelf = allyCfg.includeSelf === true;
    const count = countAlliedTemplates(state, r, c, owner, allyCfg.matcher, includeSelf);
    if (count <= 0) return null;
    if (allyCfg.minCount && count < allyCfg.minCount) return null;
    const effective = allyCfg.maxCount != null ? Math.min(count, allyCfg.maxCount) : count;
    if (effective <= 0) return null;
    const amount = allyCfg.amountPer * effective;
    if (amount === 0) return null;
    return {
      amount,
      type: 'ALLY_TEMPLATE',
      count: effective,
      matcher: allyCfg.matcher,
    };
  }
  if (tpl.dynamicAtkAlliedElementOnField) {
    const cfg = tpl.dynamicAtkAlliedElementOnField;
    const element = parseElementFromToken(cfg.element || tpl.element);
    if (element) {
      const requireField = parseElementFromToken(cfg.requireFieldElement || cfg.fieldElement);
      const cellElement = parseElementFromToken(state?.board?.[r]?.[c]?.element);
      if (!requireField || cellElement === requireField) {
        const owner = state?.board?.[r]?.[c]?.unit?.owner;
        const includeSelf = cfg.includeSelf === true;
        const baseValueRaw = Number.isFinite(cfg.baseValue) ? Math.floor(cfg.baseValue) : (Number.isFinite(tpl?.atk) ? tpl.atk : 0);
        const amountPer = Number.isFinite(cfg.amountPer) ? Math.floor(cfg.amountPer) : 1;
        const count = countAlliedElementCreatures(state, owner, element, { includeSelf, exclude: { r, c } });
        const total = baseValueRaw + amountPer * count;
        const baseAtk = Number.isFinite(tpl?.atk) ? tpl.atk : 0;
        const delta = total - baseAtk;
        if (delta !== 0) {
          return {
            amount: delta,
            type: 'ALLY_ELEMENT_FIELD',
            element,
            count,
            total,
            baseValue: baseValueRaw,
            includeSelf,
            requireField,
          };
        }
      }
    }
  }
  return null;
}

export default { computeDynamicAttackBonus };

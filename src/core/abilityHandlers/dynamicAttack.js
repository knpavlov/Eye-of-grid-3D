// Модуль для вычисления динамических бонусов к атаке
// Держим чистую игровую логику без привязки к визуальному слою
import { countUnits } from '../board.js';
import { CARDS } from '../cards.js';
import { normalizeElementName } from '../utils/elements.js';

function toArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizeTemplateList(raw) {
  const ids = new Set();
  const names = new Set();
  for (const entry of toArray(raw)) {
    if (!entry) continue;
    if (typeof entry === 'string') {
      const trimmed = entry.trim();
      if (!trimmed) continue;
      if (trimmed === trimmed.toUpperCase()) ids.add(trimmed);
      names.add(trimmed.toLowerCase());
    }
  }
  return { ids, names };
}

function matchesTemplate(unit, tpl, ids, names) {
  if (!unit || !tpl) return false;
  if (ids.size) {
    if (ids.has(unit.tplId)) return true;
    if (tpl.id && ids.has(tpl.id)) return true;
  }
  if (names.size) {
    const lower = tpl.name ? tpl.name.toLowerCase() : '';
    if (lower && names.has(lower)) return true;
  }
  return false;
}

function countAlliedByTemplate(state, r, c, owner, ids, names, includeSelf) {
  if (!state?.board) return 0;
  let total = 0;
  for (let rr = 0; rr < state.board.length; rr += 1) {
    const row = state.board[rr];
    if (!Array.isArray(row)) continue;
    for (let cc = 0; cc < row.length; cc += 1) {
      if (!includeSelf && rr === r && cc === c) continue;
      const unit = row[cc]?.unit;
      if (!unit) continue;
      if (owner != null && unit.owner !== owner) continue;
      const tpl = CARDS[unit.tplId];
      if (!tpl) continue;
      if (matchesTemplate(unit, tpl, ids, names)) {
        total += 1;
      }
    }
  }
  return total;
}

function normalizeTemplateConfig(raw) {
  if (!raw) return null;
  const typeRaw = String(raw.type || raw.mode || raw.kind || '').toUpperCase();
  if (typeRaw && !['ALLY_TEMPLATE', 'ALLY_CARD', 'ALLY_TPL'].includes(typeRaw)) {
    return null;
  }
  const list = raw.templates || raw.ids || raw.tplIds || raw.cards || raw.names;
  const { ids, names } = normalizeTemplateList(list);
  if (!ids.size && !names.size) return null;
  const includeSelf = raw.includeSelf != null ? !!raw.includeSelf : false;
  const per = Number.isFinite(raw.per) ? raw.per : (Number.isFinite(raw.amountPer) ? raw.amountPer : 1);
  const max = Number.isFinite(raw.max) ? raw.max
    : (Number.isFinite(raw.maxAmount) ? raw.maxAmount
      : (Number.isFinite(raw.maxBonus) ? raw.maxBonus : null));
  return {
    type: 'ALLY_TEMPLATE',
    ids,
    names,
    includeSelf,
    per: Number.isFinite(per) ? per : 1,
    max: Number.isFinite(max) ? max : null,
  };
}

function normalizeDynamicConfig(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    const upper = raw.toUpperCase();
    if (upper === 'OTHERS_ON_BOARD') {
      return { type: 'OTHERS_ON_BOARD' };
    }
    const elementCfg = normalizeElementConfig(raw);
    if (elementCfg?.type === 'ELEMENT_CREATURES' && elementCfg.element) {
      return { type: 'ELEMENT_CREATURES', element: elementCfg.element };
    }
    const element = normalizeElementName(raw);
    if (element) {
      return { type: 'ELEMENT_CREATURES', element };
    }
    return null;
  }
  if (typeof raw === 'object') {
    const typeRaw = String(raw.type || raw.mode || raw.kind || '').toUpperCase();
    if (typeRaw === 'OTHERS_ON_BOARD') {
      return { type: 'OTHERS_ON_BOARD' };
    }
    if (typeRaw === 'ALLY_TEMPLATE' || typeRaw === 'ALLY_CARD' || typeRaw === 'ALLY_TPL' || (!typeRaw && (raw.templates || raw.ids || raw.tplIds || raw.cards))) {
      return normalizeTemplateConfig(raw);
    }
    if (typeRaw === 'ALLY_ELEMENT') {
      const element = normalizeElementName(raw.element || raw.match || raw.elementType);
      if (!element) return null;
      const includeSelf = raw.includeSelf != null ? !!raw.includeSelf : false;
      const per = Number.isFinite(raw.per) ? raw.per : (Number.isFinite(raw.amountPer) ? raw.amountPer : 1);
      return {
        type: 'ALLY_ELEMENT',
        element,
        includeSelf,
        per: Number.isFinite(per) ? per : 1,
      };
    }
    const elementCfg = normalizeElementConfig(raw);
    if (elementCfg?.type === 'ELEMENT_CREATURES' && elementCfg.element) {
      return { type: 'ELEMENT_CREATURES', element: elementCfg.element };
    }
    const element = normalizeElementName(raw.element || raw.match || raw.type);
    if (element) {
      return { type: 'ELEMENT_CREATURES', element };
    }
  }
  return null;
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

function countAlliedByElement(state, r, c, owner, element, includeSelf) {
  if (!state?.board || !element) return 0;
  let total = 0;
  for (let rr = 0; rr < state.board.length; rr += 1) {
    const row = state.board[rr];
    if (!Array.isArray(row)) continue;
    for (let cc = 0; cc < row.length; cc += 1) {
      if (!includeSelf && rr === r && cc === c) continue;
      const unit = row[cc]?.unit;
      if (!unit) continue;
      if (owner != null && unit.owner !== owner) continue;
      const tplUnit = CARDS[unit.tplId];
      if (tplUnit?.element === element) {
        total += 1;
      }
    }
  }
  return total;
}

export function computeDynamicAttackBonus(state, r, c, tpl) {
  if (!tpl || !tpl.dynamicAtk) return null;
  const cfg = normalizeDynamicConfig(tpl.dynamicAtk);
  if (!cfg) return null;
  if (cfg.type === 'OTHERS_ON_BOARD') {
    const total = countUnits(state);
    const others = Math.max(0, total - 1);
    if (others <= 0) return null;
    return { amount: others, type: 'OTHERS_ON_BOARD', count: others };
  }
  if (cfg.type === 'ELEMENT_CREATURES' && cfg.element) {
    const count = countElementCreatures(state, cfg.element, { exclude: { r, c } });
    if (count <= 0) return null;
    return {
      amount: count,
      type: 'ELEMENT_CREATURES',
      element: cfg.element,
      count,
    };
  }
  if (cfg.type === 'ALLY_TEMPLATE') {
    const cell = state?.board?.[r]?.[c];
    const unit = cell?.unit;
    const owner = unit?.owner ?? null;
    const count = countAlliedByTemplate(state, r, c, owner, cfg.ids, cfg.names, cfg.includeSelf);
    if (count <= 0) return null;
    const rawAmount = count * (cfg.per ?? 1);
    const amount = cfg.max != null ? Math.min(rawAmount, cfg.max) : rawAmount;
    if (!amount) return null;
    return {
      amount,
      type: 'ALLY_TEMPLATE',
      count,
      templates: {
        ids: Array.from(cfg.ids),
        names: Array.from(cfg.names),
      },
    };
  }
  if (cfg.type === 'ALLY_ELEMENT' && cfg.element) {
    const cell = state?.board?.[r]?.[c];
    const unit = cell?.unit;
    const owner = unit?.owner ?? null;
    const count = countAlliedByElement(state, r, c, owner, cfg.element, cfg.includeSelf);
    if (count <= 0) return null;
    const amount = count * (cfg.per ?? 1);
    if (!amount) return null;
    return {
      amount,
      type: 'ALLY_ELEMENT',
      element: cfg.element,
      count,
    };
  }
  return null;
}

export default { computeDynamicAttackBonus };

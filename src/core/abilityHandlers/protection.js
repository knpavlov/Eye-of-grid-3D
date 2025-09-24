// Модуль вычисления значения защиты (Protection) для существ
// Вынесен отдельно, чтобы логику можно было переиспользовать без привязки к UI
import { CARDS } from '../cards.js';
import { computeAuraStatModifier } from './auraModifiers.js';
import { normalizeElementName } from '../utils/elements.js';

const BOARD_SIZE = 3;

function toArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function clampNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function collectFieldElements(raw) {
  const list = [];
  for (const entry of toArray(raw)) {
    const element = normalizeElementName(entry);
    if (element) list.push(element);
  }
  return list;
}

function normalizeIdList(raw) {
  const ids = new Set();
  const names = new Set();
  for (const entry of toArray(raw)) {
    if (!entry) continue;
    if (typeof entry === 'string') {
      const trimmed = entry.trim();
      if (!trimmed) continue;
      if (trimmed === trimmed.toUpperCase()) {
        ids.add(trimmed);
      }
      names.add(trimmed.toLowerCase());
    }
  }
  return { ids, names };
}

function normalizeSource(raw) {
  if (!raw) return null;
  if (typeof raw === 'number') {
    return { type: 'FLAT', amount: clampNumber(raw) };
  }
  if (typeof raw === 'string') {
    const element = normalizeElementName(raw);
    if (element) {
      return { type: 'FIELD_ELEMENT', element, per: 1 };
    }
    if (raw.toUpperCase() === 'EMPTY_FIELDS') {
      return { type: 'EMPTY_FIELDS', per: 1 };
    }
    return null;
  }
  if (typeof raw === 'object') {
    const typeRaw = String(raw.type || raw.kind || raw.mode || '').toUpperCase();
    const per = clampNumber(raw.per ?? raw.amount ?? raw.value ?? 1, 1);
    switch (typeRaw) {
      case 'FLAT':
        return { type: 'FLAT', amount: clampNumber(raw.amount ?? raw.value ?? raw.plus ?? raw.base ?? 0) };
      case 'FIELD':
      case 'FIELD_ELEMENT':
      case 'ELEMENT_FIELDS': {
        const elements = collectFieldElements(raw.element ?? raw.field ?? raw.elements ?? raw.fields);
        if (!elements.length) return null;
        return { type: 'FIELD_ELEMENT_SET', elements, per };
      }
      case 'EMPTY_FIELDS':
      case 'EMPTY':
        return { type: 'EMPTY_FIELDS', per };
      case 'ALLY_TEMPLATE':
      case 'ALLY_TPL':
      case 'ALLY_CARD': {
        const { ids, names } = normalizeIdList(raw.ids ?? raw.tplIds ?? raw.cards ?? raw.templates ?? raw.names);
        if (!ids.size && !names.size) return null;
        const includeSelf = raw.includeSelf != null ? !!raw.includeSelf : true;
        return { type: 'ALLY_TEMPLATE', ids, names, per, includeSelf };
      }
      case 'ALLY_ELEMENT':
      case 'ALLY_ELEMENTS':
      case 'ALLY_TYPE': {
        const element = normalizeElementName(raw.element ?? raw.elements ?? raw.type ?? raw.match);
        if (!element) return null;
        const includeSelf = raw.includeSelf != null ? !!raw.includeSelf : true;
        return { type: 'ALLY_ELEMENT', element, per, includeSelf };
      }
      default: {
        const element = normalizeElementName(raw.element ?? raw.field);
        if (element) {
          return { type: 'FIELD_ELEMENT', element, per };
        }
        if (raw.emptyFields) {
          return { type: 'EMPTY_FIELDS', per };
        }
        return null;
      }
    }
  }
  return null;
}

function gatherSources(tpl) {
  const sources = [];
  if (!tpl) return sources;
  if (typeof tpl.protection === 'number') {
    sources.push({ type: 'FLAT', amount: clampNumber(tpl.protection) });
  }
  if (typeof tpl.baseProtection === 'number') {
    sources.push({ type: 'FLAT', amount: clampNumber(tpl.baseProtection) });
  }
  if (typeof tpl.protectionFlat === 'number') {
    sources.push({ type: 'FLAT', amount: clampNumber(tpl.protectionFlat) });
  }

  for (const element of collectFieldElements(tpl.protectionEqualsFieldCount || tpl.protectionFromFields)) {
    sources.push({ type: 'FIELD_ELEMENT', element, per: 1 });
  }

  if (tpl.protectionEqualsEmptyFields || tpl.protectionFromEmptyFields) {
    sources.push({ type: 'EMPTY_FIELDS', per: 1 });
  }

  if (tpl.protectionEqualsAlliedElementCount) {
    const element = normalizeElementName(tpl.protectionEqualsAlliedElementCount);
    if (element) {
      const includeSelf = tpl.protectionEqualsAlliedElementCountIncludeSelf != null
        ? !!tpl.protectionEqualsAlliedElementCountIncludeSelf
        : true;
      sources.push({ type: 'ALLY_ELEMENT', element, per: 1, includeSelf });
    }
  }

  if (tpl.protectionEqualsAlliedTemplates || tpl.protectionEqualsAllyTemplates) {
    const { ids, names } = normalizeIdList(tpl.protectionEqualsAlliedTemplates || tpl.protectionEqualsAllyTemplates);
    if (ids.size || names.size) {
      sources.push({ type: 'ALLY_TEMPLATE', ids, names, per: 1, includeSelf: true });
    }
  }

  for (const raw of toArray(tpl.protectionSources)) {
    const normalized = normalizeSource(raw);
    if (normalized) sources.push(normalized);
  }

  return sources;
}

function getCell(state, r, c) {
  if (!state?.board) return null;
  if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) return null;
  return state.board[r]?.[c] || null;
}

function countFieldsByElement(state, element) {
  if (!state?.board || !element) return 0;
  let total = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (state.board?.[r]?.[c]?.element === element) total += 1;
    }
  }
  return total;
}

function countEmptyFields(state) {
  if (!state?.board) return 0;
  let total = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const unit = state.board?.[r]?.[c]?.unit;
      if (!unit) total += 1;
    }
  }
  return total;
}

function matchesTemplate(unit, tpl, ids, names) {
  if (!unit || !tpl) return false;
  if (ids?.size) {
    if (ids.has(unit.tplId)) return true;
    if (tpl?.id && ids.has(tpl.id)) return true;
  }
  if (names?.size) {
    const name = tpl?.name ? tpl.name.toLowerCase() : '';
    if (name && names.has(name)) return true;
  }
  return false;
}

function countAlliedByTemplate(state, r, c, owner, ids, names, includeSelf) {
  if (!state?.board) return 0;
  let total = 0;
  for (let rr = 0; rr < BOARD_SIZE; rr++) {
    for (let cc = 0; cc < BOARD_SIZE; cc++) {
      if (!includeSelf && rr === r && cc === c) continue;
      const cell = getCell(state, rr, cc);
      const unit = cell?.unit;
      if (!unit || (owner != null && unit.owner !== owner)) continue;
      const tpl = CARDS[unit.tplId];
      if (matchesTemplate(unit, tpl, ids, names)) {
        total += 1;
      }
    }
  }
  return total;
}

function countAlliedByElement(state, r, c, owner, element, includeSelf) {
  if (!state?.board || !element) return 0;
  let total = 0;
  for (let rr = 0; rr < BOARD_SIZE; rr++) {
    for (let cc = 0; cc < BOARD_SIZE; cc++) {
      if (!includeSelf && rr === r && cc === c) continue;
      const cell = getCell(state, rr, cc);
      const unit = cell?.unit;
      if (!unit || (owner != null && unit.owner !== owner)) continue;
      const tpl = CARDS[unit.tplId];
      if (tpl?.element === element) total += 1;
    }
  }
  return total;
}

function computeBaseProtection(state, r, c, tpl, unit) {
  const sources = gatherSources(tpl);
  if (!sources.length) return 0;
  const owner = unit?.owner ?? null;
  let total = 0;
  for (const source of sources) {
    if (!source) continue;
    switch (source.type) {
      case 'FLAT':
        total += clampNumber(source.amount);
        break;
      case 'FIELD_ELEMENT':
        total += countFieldsByElement(state, source.element) * clampNumber(source.per, 1);
        break;
      case 'FIELD_ELEMENT_SET': {
        const per = clampNumber(source.per, 1);
        for (const element of source.elements || []) {
          total += countFieldsByElement(state, element) * per;
        }
        break;
      }
      case 'EMPTY_FIELDS':
        total += countEmptyFields(state) * clampNumber(source.per, 1);
        break;
      case 'ALLY_TEMPLATE':
        total += countAlliedByTemplate(
          state,
          r,
          c,
          owner,
          source.ids,
          source.names,
          source.includeSelf,
        ) * clampNumber(source.per, 1);
        break;
      case 'ALLY_ELEMENT':
        total += countAlliedByElement(
          state,
          r,
          c,
          owner,
          source.element,
          source.includeSelf,
        ) * clampNumber(source.per, 1);
        break;
      default:
        break;
    }
  }
  return total;
}

export function computeAuraProtection(state, r, c, opts = {}) {
  return computeAuraStatModifier(state, r, c, 'PROTECTION', opts);
}

export function computeUnitProtection(state, r, c, opts = {}) {
  const cell = state?.board?.[r]?.[c];
  const unit = opts.unit || cell?.unit;
  if (!unit) return 0;
  const tpl = opts.tpl || CARDS[unit.tplId];
  if (!tpl) return 0;
  const base = computeBaseProtection(state, r, c, tpl, unit);
  const aura = computeAuraProtection(state, r, c, { ...opts, unit, tpl });
  const total = base + aura;
  const value = Math.floor(Math.max(0, total));
  return Number.isFinite(value) ? value : 0;
}


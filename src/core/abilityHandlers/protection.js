// Модуль защиты (Protection) — чистая игровая логика без визуала
import { CARDS } from '../cards.js';
import { normalizeElementName } from '../utils/elements.js';

function getCell(state, r, c) {
  if (!state?.board) return null;
  if (r < 0 || r >= state.board.length) return null;
  const row = state.board[r];
  if (!Array.isArray(row) || c < 0 || c >= row.length) return null;
  return row[c] || null;
}

function clampPositive(value) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? Math.floor(num) : 0;
}

function normalizeSelfEntry(entry) {
  if (!entry) return null;
  if (typeof entry === 'string') {
    const upper = entry.toUpperCase();
    if (upper === 'EMPTY_FIELDS') return { type: 'EMPTY_FIELDS' };
    if (upper.endsWith('_FIELDS')) {
      const element = upper.replace('_FIELDS', '');
      return { type: 'FIELDS', element };
    }
  }
  if (typeof entry === 'object') {
    const type = String(entry.type || entry.mode || '').toUpperCase();
    if (type === 'FIELDS') {
      const element = normalizeElementName(entry.element || entry.field || entry.name);
      if (!element) return null;
      return { type: 'FIELDS', element };
    }
    if (type === 'EMPTY_FIELDS') {
      return { type: 'EMPTY_FIELDS' };
    }
    if (type === 'ALLY_TPL' || type === 'ALLY_TEMPLATE') {
      const ids = [];
      const names = [];
      const addList = (list, target) => {
        if (!list) return;
        const arr = Array.isArray(list) ? list : [list];
        for (const item of arr) {
          if (!item) continue;
          target.push(String(item));
        }
      };
      addList(entry.ids || entry.tplIds || entry.idsList, ids);
      addList(entry.names || entry.tplNames || entry.nameList, names);
      if (!ids.length && !names.length) return null;
      const excludeSelf = !!entry.excludeSelf;
      return { type: 'ALLY_TPL', ids, names, excludeSelf };
    }
    if (type === 'ALLY_ELEMENT') {
      const element = normalizeElementName(entry.element || entry.name);
      if (!element) return null;
      return { type: 'ALLY_ELEMENT', element, excludeSelf: !!entry.excludeSelf };
    }
  }
  return null;
}

function normalizeAuraEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const amount = clampPositive(entry.amount ?? entry.value ?? entry.delta);
  if (!amount) return null;
  const scopeRaw = String(entry.scope || entry.range || 'ADJACENT').toUpperCase();
  const scope = scopeRaw === 'BOARD' || scopeRaw === 'GLOBAL' ? 'BOARD'
    : scopeRaw === 'SELF' ? 'SELF'
    : 'ADJACENT';
  const targetRaw = String(entry.target || entry.affects || 'ALLY').toUpperCase();
  let target = 'ALLY';
  if (targetRaw === 'ENEMY' || targetRaw === 'ENEMIES' || targetRaw === 'OPPONENT') target = 'ENEMY';
  if (targetRaw === 'ALL') target = 'ALL';
  if (targetRaw === 'SELF') target = 'SELF';
  const field = normalizeElementName(entry.field || entry.targetField);
  const element = normalizeElementName(entry.element || entry.targetElement);
  const sourceField = normalizeElementName(entry.sourceField || entry.sourceElement);
  const excludeSelf = !!entry.excludeSelf;
  return { amount, scope, target, field, element, sourceField, excludeSelf };
}

function matchesScope(scope, sr, sc, tr, tc) {
  if (scope === 'BOARD') return true;
  if (scope === 'SELF') return sr === tr && sc === tc;
  const dist = Math.abs(sr - tr) + Math.abs(sc - tc);
  return dist === 1;
}

function matchesTarget(target, ownerSource, ownerTarget, sameCell) {
  switch (target) {
    case 'ALLY':
      return ownerSource != null && ownerSource === ownerTarget && !sameCell;
    case 'ENEMY':
      return ownerSource != null && ownerTarget != null && ownerSource !== ownerTarget;
    case 'SELF':
      return sameCell && ownerSource === ownerTarget;
    case 'ALL':
      return true;
    default:
      return ownerSource != null && ownerTarget != null && ownerSource !== ownerTarget;
  }
}

function matchesTemplate(unit, tpl, filter, sameUnit) {
  if (!unit || !tpl || !filter) return false;
  if (filter.excludeSelf && sameUnit) return false;
  if (Array.isArray(filter.ids) && filter.ids.length) {
    const id = unit.tplId || tpl.id;
    if (filter.ids.includes(id)) return true;
    const normalized = filter.ids.find(entry => (CARDS[entry]?.id) === id);
    if (normalized) return true;
  }
  if (Array.isArray(filter.names) && filter.names.length) {
    const name = String(tpl.name || '').toUpperCase();
    for (const raw of filter.names) {
      if (String(raw || '').toUpperCase() === name) return true;
    }
  }
  return false;
}

function countFieldsByElement(state, element) {
  if (!state?.board || !element) return 0;
  let count = 0;
  for (let r = 0; r < state.board.length; r += 1) {
    const row = state.board[r];
    if (!Array.isArray(row)) continue;
    for (let c = 0; c < row.length; c += 1) {
      if (normalizeElementName(row[c]?.element) === element) count += 1;
    }
  }
  return count;
}

function countEmptyFields(state) {
  if (!state?.board) return 0;
  let count = 0;
  for (let r = 0; r < state.board.length; r += 1) {
    const row = state.board[r];
    if (!Array.isArray(row)) continue;
    for (let c = 0; c < row.length; c += 1) {
      if (!row[c]?.unit) count += 1;
    }
  }
  return count;
}

function countAlliedUnits(state, owner, opts = {}) {
  if (!state?.board) return 0;
  let total = 0;
  for (let r = 0; r < state.board.length; r += 1) {
    const row = state.board[r];
    if (!Array.isArray(row)) continue;
    for (let c = 0; c < row.length; c += 1) {
      const cell = row[c];
      const unit = cell?.unit;
      if (!unit || owner == null || unit.owner !== owner) continue;
      if (opts.exclude && opts.exclude.r === r && opts.exclude.c === c) continue;
      const tpl = CARDS[unit.tplId];
      if (!tpl) continue;
      if (opts.filterElement) {
        const element = normalizeElementName(tpl.element);
        if (element !== opts.filterElement) continue;
      }
      if (opts.templateFilter && !matchesTemplate(unit, tpl, opts.templateFilter, false)) continue;
      total += 1;
    }
  }
  return total;
}

function computeSelfProtection(state, r, c, unit, tpl) {
  const entries = Array.isArray(tpl?.selfProtection) ? tpl.selfProtection : [];
  if (!entries.length) return 0;
  const owner = unit?.owner ?? null;
  let total = 0;
  for (const raw of entries) {
    const entry = normalizeSelfEntry(raw);
    if (!entry) continue;
    if (entry.type === 'FIELDS') {
      const element = normalizeElementName(entry.element);
      if (!element) continue;
      total += countFieldsByElement(state, element);
    } else if (entry.type === 'EMPTY_FIELDS') {
      total += countEmptyFields(state);
    } else if (entry.type === 'ALLY_ELEMENT') {
      const element = normalizeElementName(entry.element);
      if (!element) continue;
      const exclude = entry.excludeSelf ? { r, c } : null;
      total += countAlliedUnits(state, owner, { filterElement: element, exclude });
    } else if (entry.type === 'ALLY_TPL') {
      const exclude = entry.excludeSelf ? { r, c } : null;
      total += countAlliedUnits(state, owner, { templateFilter: entry, exclude });
    }
  }
  return total;
}

function computeAuraProtection(state, r, c, unit, tpl) {
  if (!state?.board) return 0;
  let total = 0;
  const targetCell = getCell(state, r, c);
  const targetField = normalizeElementName(targetCell?.element);
  const ownerTarget = unit?.owner ?? null;
  const targetElement = normalizeElementName(tpl?.element);
  for (let sr = 0; sr < state.board.length; sr += 1) {
    const row = state.board[sr];
    if (!Array.isArray(row)) continue;
    for (let sc = 0; sc < row.length; sc += 1) {
      const sourceCell = row[sc];
      const sourceUnit = sourceCell?.unit;
      if (!sourceUnit) continue;
      const tplSource = CARDS[sourceUnit.tplId];
      if (!tplSource) continue;
      const auraList = Array.isArray(tplSource.protectionAuras) ? tplSource.protectionAuras : [];
      if (!auraList.length) continue;
      const ownerSource = sourceUnit.owner ?? null;
      const sourceField = normalizeElementName(sourceCell?.element);
      for (const raw of auraList) {
        const aura = normalizeAuraEntry(raw);
        if (!aura) continue;
        if (aura.excludeSelf && sr === r && sc === c) continue;
        if (!matchesScope(aura.scope, sr, sc, r, c)) continue;
        if (!matchesTarget(aura.target, ownerSource, ownerTarget, sr === r && sc === c)) continue;
        if (aura.sourceField && sourceField !== aura.sourceField) continue;
        if (aura.field && targetField !== aura.field) continue;
        if (aura.element && targetElement !== aura.element) continue;
        total += aura.amount;
      }
    }
  }
  return total;
}

export function getUnitProtection(state, r, c, opts = {}) {
  const cell = getCell(state, r, c);
  const unit = opts.unit || cell?.unit || null;
  if (!unit) return 0;
  const tpl = opts.tpl || CARDS[unit.tplId] || null;
  if (!tpl) return 0;
  const base = clampPositive(tpl.baseProtection ?? tpl.protectionBase ?? 0);
  const self = computeSelfProtection(state, r, c, unit, tpl);
  const aura = computeAuraProtection(state, r, c, unit, tpl);
  return Math.max(0, base + self + aura);
}

export default { getUnitProtection };

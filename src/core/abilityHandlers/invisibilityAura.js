// Поддержка аур невидимости (логика отдельно от визуала)
import { CARDS } from '../cards.js';
import { normalizeElementName } from '../utils/elements.js';

function getTemplate(unit) {
  if (!unit) return null;
  return CARDS[unit.tplId] || null;
}

const normalizeElement = (value) => normalizeElementName(value);

function collectGrantElements(raw, fallbackElement = null) {
  const set = new Set();
  const fallback = normalizeElement(fallbackElement);
  const add = (value) => {
    const el = normalizeElement(value);
    if (el) set.add(el);
  };

  if (raw == null) {
    return set;
  }
  if (raw === true && fallback) {
    set.add(fallback);
    return set;
  }
  if (typeof raw === 'string') {
    add(raw);
    return set;
  }
  if (Array.isArray(raw)) {
    raw.forEach(add);
    return set;
  }
  if (typeof raw === 'object') {
    if (raw.element) add(raw.element);
    if (raw.elements) {
      const list = Array.isArray(raw.elements) ? raw.elements : [raw.elements];
      list.forEach(add);
    }
    if (raw.field) add(raw.field);
    if (!raw.element && !raw.elements && !raw.field && fallback) {
      set.add(fallback);
    }
    return set;
  }
  return set;
}

function isUnitAlive(unit, tpl) {
  const current = typeof unit?.currentHP === 'number' ? unit.currentHP : null;
  if (current != null) return current > 0;
  if (typeof tpl?.hp === 'number') return tpl.hp > 0;
  return true;
}

export function hasAuraInvisibility(state, r, c, opts = {}) {
  if (!state?.board) return false;
  const unit = opts.unit || state.board?.[r]?.[c]?.unit;
  if (!unit) return false;
  const tpl = opts.tpl || getTemplate(unit);
  if (!tpl) return false;
  const owner = unit.owner;
  if (owner == null) return false;
  const cellElement = normalizeElement(state.board?.[r]?.[c]?.element);

  for (let rr = 0; rr < state.board.length; rr += 1) {
    const row = state.board[rr];
    if (!Array.isArray(row)) continue;
    for (let cc = 0; cc < row.length; cc += 1) {
      const auraUnit = row[cc]?.unit;
      if (!auraUnit || auraUnit.owner !== owner) continue;
      const auraTpl = getTemplate(auraUnit);
      if (!auraTpl) continue;
      if (!isUnitAlive(auraUnit, auraTpl)) continue;

      if (auraTpl.grantInvisibilityToAlliesOnElement) {
        const sameEntity =
          auraUnit === unit ||
          (auraUnit?.uid && unit?.uid && auraUnit.uid === unit.uid);
        if (sameEntity) continue; // Эдин не скрывает саму себя
        const allowed = collectGrantElements(
          auraTpl.grantInvisibilityToAlliesOnElement,
          auraTpl.element,
        );
        if (allowed.size && cellElement && allowed.has(cellElement)) {
          return true;
        }
      }

      if (auraTpl.invisibilityAuraSameElement) {
        const sameCell = rr === r && cc === c;
        if (!sameCell) {
          const auraElement = normalizeElement(state.board?.[rr]?.[cc]?.element);
          if (auraElement && cellElement && auraElement === cellElement) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

export default { hasAuraInvisibility };

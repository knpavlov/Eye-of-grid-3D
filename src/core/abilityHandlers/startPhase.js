// Обработка эффектов начала хода (логика без визуала)
import { CARDS } from '../cards.js';
import { normalizeElementName } from '../utils/elements.js';

const capMana = (value) => {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  return value > 10 ? 10 : value;
};

function getTemplate(unit) {
  if (!unit) return null;
  return CARDS[unit.tplId] || null;
}

function normalizeElement(value, fallback = null) {
  const normalized = normalizeElementName(typeof value === 'string' ? value : null);
  if (normalized) return normalized;
  if (fallback && typeof fallback === 'string') {
    return normalizeElementName(fallback);
  }
  return null;
}

function normalizeManaGainConfig(raw, tpl) {
  if (raw == null) {
    if (tpl?.manaGainOnNonElement === true) {
      return {
        element: normalizeElement(tpl.element),
        amount: 1,
      };
    }
    return null;
  }
  if (typeof raw === 'string') {
    return {
      element: normalizeElement(raw, tpl?.element),
      amount: 1,
    };
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const amount = Math.max(0, Math.floor(raw));
    if (amount <= 0) return null;
    return {
      element: normalizeElement(tpl?.element),
      amount,
    };
  }
  if (typeof raw === 'object') {
    const element = normalizeElement(
      raw.element || raw.base || raw.reference || raw.field,
      tpl?.element,
    );
    const amountRaw = raw.amount || raw.value || raw.plus || raw.gain;
    const amount = Math.max(0, Math.floor(Number.isFinite(amountRaw) ? amountRaw : 1));
    if (!element || amount <= 0) return null;
    return { element, amount };
  }
  return null;
}

function isUnitAlive(unit, tpl) {
  const current = typeof unit?.currentHP === 'number' ? unit.currentHP : null;
  const baseHp = tpl?.hp;
  if (current != null) return current > 0;
  if (typeof baseHp === 'number') return baseHp > 0;
  return true;
}

export function applyTurnStartManaEffects(state, playerIndex) {
  const result = { total: 0, entries: [] };
  if (!state?.board || !Array.isArray(state.board)) return result;
  const player = state.players?.[playerIndex];
  if (!player) return result;

  for (let r = 0; r < state.board.length; r += 1) {
    const row = state.board[r];
    if (!Array.isArray(row)) continue;
    for (let c = 0; c < row.length; c += 1) {
      const cell = row[c];
      const unit = cell?.unit;
      if (!unit || unit.owner !== playerIndex) continue;
      const tpl = getTemplate(unit);
      if (!tpl) continue;
      if (!isUnitAlive(unit, tpl)) continue;
      const cfg = normalizeManaGainConfig(tpl.manaGainOnNonElement, tpl);
      if (!cfg) continue;
      const nativeElement = cfg.element || normalizeElement(tpl.element);
      if (!nativeElement) continue;
      const cellElement = normalizeElement(cell?.element || null);
      if (cellElement === nativeElement) continue;

      const before = typeof player.mana === 'number' ? player.mana : 0;
      const after = before + cfg.amount;
      player.mana = capMana(after);
      const gained = player.mana - before;
      if (gained > 0) {
        result.total += gained;
        result.entries.push({
          r,
          c,
          tplId: tpl.id,
          amount: gained,
          fieldElement: cellElement,
        });
      }
    }
  }

  return result;
}

export default { applyTurnStartManaEffects };

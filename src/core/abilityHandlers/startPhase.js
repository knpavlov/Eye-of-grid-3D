// Обработка эффектов начала хода (логика без визуала)
import { CARDS } from '../cards.js';
import { normalizeElementName } from '../utils/elements.js';

const defaultCap = (value) => {
  const num = Number.isFinite(value) ? value : 0;
  return Math.min(10, Math.max(0, Math.floor(num)));
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

export function applyTurnStartManaEffects(state, playerIndex, options = {}) {
  const result = { total: 0, entries: [] };
  if (!state?.board || !Array.isArray(state.board)) return result;
  const player = state.players?.[playerIndex];
  if (!player) return result;
  const capFn = typeof options.capMana === 'function' ? options.capMana : defaultCap;

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
      const after = capFn(before + cfg.amount);
      const normalizedAfter = Number.isFinite(after) ? after : before;
      player.mana = normalizedAfter;
      const gained = normalizedAfter - before;
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

export function resolveTurnStartPhase(state, playerIndex, options = {}) {
  const summary = {
    manaBefore: 0,
    manaAfterBase: 0,
    manaAfter: 0,
    baseGain: 0,
    bonusGain: 0,
    totalGain: 0,
    effects: { total: 0, entries: [] },
  };
  if (!state || typeof playerIndex !== 'number') return summary;
  const player = state.players?.[playerIndex];
  if (!player) return summary;

  const capFn = typeof options.capMana === 'function' ? options.capMana : defaultCap;
  const baseGainRaw = Number.isFinite(options.baseGain) ? options.baseGain : 2;
  const applyBase = options.applyBase !== false;

  const before = Number.isFinite(player.mana) ? player.mana : 0;
  summary.manaBefore = before;

  let afterBase = before;
  if (applyBase && baseGainRaw !== 0) {
    const candidate = capFn(before + baseGainRaw);
    afterBase = Number.isFinite(candidate) ? candidate : before;
    player.mana = afterBase;
    summary.baseGain = Math.max(0, afterBase - before);
  } else {
    afterBase = Number.isFinite(player.mana) ? player.mana : before;
  }
  summary.manaAfterBase = afterBase;

  const effects = applyTurnStartManaEffects(state, playerIndex, options);
  summary.effects = effects;

  const after = Number.isFinite(player.mana) ? player.mana : afterBase;
  summary.manaAfter = after;
  summary.bonusGain = Math.max(0, after - afterBase);
  summary.totalGain = Math.max(0, after - before);

  return summary;
}

export default { applyTurnStartManaEffects, resolveTurnStartPhase };

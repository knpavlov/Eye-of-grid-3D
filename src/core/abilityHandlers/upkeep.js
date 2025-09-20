// Логика начала хода: эффекты, которые применяются автоматически
// Модуль не зависит от UI и пригоден для переиспользования в тестах и других движках
import { CARDS } from '../cards.js';
import { capMana } from '../constants.js';
import { normalizeElement, elementsEqual } from '../utils/elements.js';

const BOARD_SIZE = 3;

function clampAmount(value, fallback = 1) {
  if (value == null) return fallback;
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.floor(num));
}

function normalizeManaGainNonElement(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    return { element: normalizeElement(raw), amount: 1 };
  }
  if (typeof raw === 'object') {
    const element = normalizeElement(raw.element || raw.type || raw.field);
    const amount = clampAmount(raw.amount ?? raw.value ?? raw.delta ?? raw.gain, 1);
    if (!element || amount <= 0) return null;
    return { element, amount };
  }
  return null;
}

function applyManaGain(state, player, source, cfg, events) {
  const pl = state.players?.[player];
  if (!pl) return;
  const before = pl.mana ?? 0;
  pl.mana = capMana(before + cfg.amount);
  const gained = pl.mana - before;
  if (gained <= 0) return;
  events.manaGains.push({
    r: source.r,
    c: source.c,
    amount: gained,
    field: state.board?.[source.r]?.[source.c]?.element || null,
  });
}

export function applyStartOfTurnUpkeep(state, player) {
  const events = { manaGains: [] };
  if (!state?.board || !state.players?.[player]) return events;

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = state.board[r][c];
      const unit = cell?.unit;
      if (!unit || unit.owner !== player) continue;
      const tpl = CARDS[unit.tplId];
      if (!tpl) continue;

      const manaCfg = normalizeManaGainNonElement(tpl.manaGainOnNonElement);
      if (manaCfg) {
        const fieldElement = normalizeElement(cell?.element);
        if (!elementsEqual(fieldElement, manaCfg.element)) {
          applyManaGain(state, player, { r, c }, manaCfg, events);
        }
      }
    }
  }

  return events;
}

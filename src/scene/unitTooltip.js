// Универсальная подсказка для существ на поле
import {
  showTooltip,
  hideTooltip,
} from '../ui/tooltip.js';
import { buildUnitTooltipContent } from '../ui/unitTooltip.js';
import {
  hasInvisibility,
  hasPerfectDodge,
  isUnitPossessed,
  hasFirstStrike,
  hasDoubleAttack,
  shouldUseMagicAttack,
} from '../core/abilities.js';

const SOURCE = 'unit-hover';
const DELAY_MS = 1000;
const OFFSET_X = 16;
const OFFSET_Y = 16;

let timerId = null;
let pendingEntry = null;
let activeKey = null;

function cancelTimer() {
  if (timerId) {
    clearTimeout(timerId);
    timerId = null;
  }
}

function clearActive() {
  if (activeKey !== null) {
    activeKey = null;
    hideTooltip(SOURCE);
  }
}

function keyFromUnit(unit, r, c) {
  if (!unit) return null;
  if (unit.uid != null) return `uid:${unit.uid}`;
  if (r != null && c != null) return `pos:${r},${c}:${unit.tplId || ''}`;
  return null;
}

function getGameState() {
  return (typeof window !== 'undefined') ? (window.gameState || null) : null;
}

function getCards() {
  return (typeof window !== 'undefined') ? (window.CARDS || {}) : {};
}

function safeNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }
  return value ?? '—';
}

function computeActivationCost(tpl, cell, unit, state, r, c) {
  const fieldElement = cell?.element;
  const ctx = { state, r, c, unit, owner: unit?.owner };
  try {
    if (typeof window !== 'undefined' && typeof window.rotateCost === 'function') {
      const val = window.rotateCost(tpl, fieldElement, ctx);
      if (typeof val === 'number' && Number.isFinite(val)) {
        return Math.max(0, Math.round(val));
      }
    }
  } catch {}
  try {
    if (typeof window !== 'undefined' && typeof window.attackCost === 'function') {
      const val = window.attackCost(tpl, fieldElement, ctx);
      if (typeof val === 'number' && Number.isFinite(val)) {
        return Math.max(0, Math.round(val));
      }
    }
  } catch {}
  if (typeof tpl?.activation === 'number') {
    return Math.max(0, Math.round(tpl.activation));
  }
  if (typeof tpl?.cost === 'number') {
    return Math.max(0, Math.round(tpl.cost - 1));
  }
  return '—';
}

function getEffectiveStats(state, cell, unit, r, c) {
  const fallback = {
    atk: typeof unit?.atk === 'number' ? unit.atk : (unit?.baseAtk ?? 0),
    hp: typeof unit?.hp === 'number' ? unit.hp : (unit?.baseHp ?? 0),
  };
  try {
    if (typeof window !== 'undefined' && typeof window.effectiveStats === 'function') {
      const res = window.effectiveStats(cell, unit, { state, r, c });
      if (res && typeof res.atk === 'number') {
        fallback.atk = res.atk;
      }
      if (res && typeof res.hp === 'number') {
        fallback.hp = res.hp;
      }
    }
  } catch {}
  return fallback;
}

function formatDodgeStatus(unit) {
  const state = unit?.dodgeState;
  if (!state) return null;
  if (!state.limited) return 'Dodge ∞';
  const remaining = Math.max(0, Number(state.remaining ?? state.max ?? 0));
  if (remaining <= 0) return null;
  return `Dodge ×${remaining}`;
}

function collectStatuses(state, cell, unit, tpl, r, c) {
  const statuses = [];
  const push = (key, text) => {
    if (!text) return;
    if (statuses.some(s => s.key === key)) return;
    statuses.push({ key, text });
  };
  if (isUnitPossessed(unit)) {
    push('possessed', 'Possessed');
  }
  if (hasInvisibility(state, r, c, { unit, tpl })) {
    push('invisible', 'Invisible');
  }
  if (hasPerfectDodge(state, r, c, { unit, tpl })) {
    push('perfect-dodge', 'Perfect dodge');
  }
  const dodge = formatDodgeStatus(unit);
  if (dodge) {
    push('dodge', dodge);
  }
  if (tpl && hasFirstStrike(tpl)) {
    push('quickness', 'Quickness');
  }
  if (tpl?.fortress) {
    push('fortress', 'Fortress');
  }
  if (tpl && hasDoubleAttack(tpl)) {
    push('double-attack', 'Double Attack');
  }
  if (tpl?.fieldquakeLock) {
    push('fieldquake-lock', 'Fieldquake lock aura');
  }
  if (tpl && (tpl.attackType === 'MAGIC' || shouldUseMagicAttack(state, r, c, tpl))) {
    push('magic-attack', 'Magic attack');
  }
  return statuses;
}

function buildTooltipPayload(unit, r, c, event) {
  if (!unit) return null;
  const state = getGameState();
  const cards = getCards();
  const tpl = cards?.[unit.tplId] || null;
  const cell = state?.board?.[r]?.[c] || null;
  const stats = getEffectiveStats(state, cell, unit, r, c);
  const atkValue = safeNumber(stats.atk ?? tpl?.atk ?? unit?.atk ?? '—');
  const currentHp = (typeof unit?.currentHP === 'number' && Number.isFinite(unit.currentHP))
    ? Math.max(0, Math.round(unit.currentHP))
    : safeNumber(stats.hp ?? tpl?.hp ?? unit?.hp ?? '—');
  const activation = tpl ? computeActivationCost(tpl, cell, unit, state, r, c) : '—';
  const name = tpl?.name ?? unit?.name ?? tpl?.id ?? 'Creature';
  const cost = safeNumber(tpl?.cost ?? unit?.cost ?? '—');
  const statuses = collectStatuses(state, cell, unit, tpl, r, c);

  const html = buildUnitTooltipContent({
    name,
    cost,
    activation,
    hp: currentHp,
    atk: atkValue,
    desc: tpl?.desc ?? '',
    statuses,
  });

  const x = (event?.clientX ?? 0) + OFFSET_X;
  const y = (event?.clientY ?? 0) + OFFSET_Y;

  return {
    key: keyFromUnit(unit, r, c),
    data: {
      html,
      x,
      y,
      className: 'unit-tooltip',
    },
  };
}

function scheduleShow() {
  cancelTimer();
  if (!pendingEntry) return;
  timerId = setTimeout(() => {
    if (!pendingEntry) return;
    activeKey = pendingEntry.key;
    showTooltip(SOURCE, pendingEntry.data);
    pendingEntry = null;
    timerId = null;
  }, DELAY_MS);
}

export function trackUnitTooltip({ unit, r, c, event }) {
  if (!unit) {
    resetUnitTooltip();
    return;
  }
  const entry = buildTooltipPayload(unit, r, c, event);
  if (!entry || !entry.key) {
    resetUnitTooltip();
    return;
  }

  entry.data.x = Math.round(entry.data.x);
  entry.data.y = Math.round(entry.data.y);

  if (activeKey === entry.key) {
    showTooltip(SOURCE, entry.data);
    return;
  }

  if (pendingEntry && pendingEntry.key === entry.key) {
    pendingEntry.data = entry.data;
    return;
  }

  clearActive();
  pendingEntry = entry;
  scheduleShow();
}

export function resetUnitTooltip() {
  cancelTimer();
  pendingEntry = null;
  clearActive();
}

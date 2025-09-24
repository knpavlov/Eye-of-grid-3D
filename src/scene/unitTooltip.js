// Подсказка по существам: отображение характеристик и статусов
import { showTooltip, hideTooltip } from '../ui/tooltip.js';
import { CARDS } from '../core/cards.js';
import {
  activationCost,
  hasFirstStrike,
  hasDoubleAttack,
  hasInvisibility,
  hasPerfectDodge,
  shouldUseMagicAttack,
  isUnitPossessed,
} from '../core/abilities.js';
import { effectiveStats } from '../core/rules.js';
import { buildUnitTooltipContent } from '../ui/unitTooltipTemplate.js';

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

function computeActivationCost(tpl, cell, state, r, c, unit) {
  try {
    const fieldElement = cell?.element;
    const ctx = { state, r, c, unit, owner: unit?.owner };
    const cost = activationCost(tpl, fieldElement, ctx);
    return Number.isFinite(cost) ? cost : null;
  } catch {
    return tpl?.activation ?? null;
  }
}

function formatHealth(unit, stats) {
  const maxHp = Number.isFinite(stats?.hp) ? stats.hp : null;
  const current = Number.isFinite(unit?.currentHP) ? unit.currentHP : maxHp;
  if (current == null && maxHp == null) return null;
  if (maxHp != null && current != null && maxHp !== current) {
    return `${current}/${maxHp}`;
  }
  if (current != null) return `${current}`;
  if (maxHp != null) return `${maxHp}`;
  return null;
}

function collectStatuses({ unit, tpl, state, r, c }) {
  const statuses = [];

  if (isUnitPossessed(unit)) {
    statuses.push({ key: 'possessed', label: 'Possessed', tone: 'debuff' });
  }

  if (hasInvisibility(state, r, c, { unit, tpl })) {
    statuses.push({ key: 'invisible', label: 'Invisible', tone: 'stealth' });
  }

  if (hasPerfectDodge(state, r, c, { unit, tpl })) {
    statuses.push({ key: 'perfect-dodge', label: 'Perfect dodge', tone: 'evasion' });
  }

  const dodgeState = unit?.dodgeState || null;
  if (dodgeState) {
    let detail = null;
    if (!dodgeState.limited) {
      detail = '∞';
    } else {
      const remaining = Math.max(0, Number(dodgeState.remaining ?? dodgeState.max ?? 0));
      detail = `${remaining}`;
    }
    const postfix = detail ? ` (${detail})` : '';
    statuses.push({ key: 'dodge', label: `Dodge${postfix}`, tone: 'evasion' });
  }

  if (hasFirstStrike(tpl)) {
    statuses.push({ key: 'quickness', label: 'Quickness', tone: 'speed' });
  }

  if (tpl?.fortress) {
    statuses.push({ key: 'fortress', label: 'Fortress', tone: 'defense' });
  }

  if (hasDoubleAttack(tpl)) {
    statuses.push({ key: 'double-attack', label: 'Double Attack', tone: 'offense' });
  }

  if (tpl?.fieldquakeLock) {
    statuses.push({ key: 'fieldquake-lock', label: 'Fieldquake lock aura', tone: 'control' });
  }

  const usesMagic = tpl?.attackType === 'MAGIC'
    || shouldUseMagicAttack(state, r, c, tpl);
  if (usesMagic) {
    statuses.push({ key: 'magic-attack', label: 'Magic attack', tone: 'magic' });
  }

  return statuses;
}

function computeTooltip(unit, r, c, state) {
  if (!unit) return null;
  const tpl = unit.tplId ? CARDS[unit.tplId] : null;
  if (!tpl) return null;

  const cell = state?.board?.[r]?.[c] || null;
  let stats;
  try {
    stats = effectiveStats(cell, unit, { state, r, c });
  } catch {
    stats = { atk: tpl?.atk ?? null, hp: tpl?.hp ?? null };
  }

  const attackValue = Number.isFinite(stats?.atk) ? stats.atk : (tpl?.atk ?? null);
  const healthValue = formatHealth(unit, stats);
  const activationValue = computeActivationCost(tpl, cell, state, r, c, unit);

  const statuses = collectStatuses({ unit, tpl, state, r, c });

  const html = buildUnitTooltipContent({
    name: tpl?.name || 'Creature',
    costs: {
      summon: tpl?.cost ?? null,
      activation: activationValue,
    },
    stats: {
      attack: attackValue,
      health: healthValue,
    },
    description: tpl?.desc || '',
    statuses,
  });

  if (!html) return null;
  return { html, variant: 'unit' };
}

function scheduleShow(entry) {
  cancelTimer();
  pendingEntry = entry;
  timerId = setTimeout(() => {
    if (!pendingEntry) return;
    activeKey = pendingEntry.key;
    showTooltip(SOURCE, {
      html: pendingEntry.html,
      x: pendingEntry.x,
      y: pendingEntry.y,
      variant: pendingEntry.variant,
    });
    pendingEntry = null;
    timerId = null;
  }, DELAY_MS);
}

export function trackUnitHoverTooltip({ unit, r, c, state, event }) {
  const tooltip = computeTooltip(unit, r, c, state);
  if (!tooltip) {
    resetUnitHoverTooltip();
    return;
  }

  const key = keyFromUnit(unit, r, c);
  if (!key) {
    resetUnitHoverTooltip();
    return;
  }

  const x = (event?.clientX ?? 0) + OFFSET_X;
  const y = (event?.clientY ?? 0) + OFFSET_Y;

  if (activeKey === key) {
    showTooltip(SOURCE, { html: tooltip.html, x, y, variant: tooltip.variant });
    return;
  }

  if (pendingEntry && pendingEntry.key === key) {
    pendingEntry.html = tooltip.html;
    pendingEntry.variant = tooltip.variant;
    pendingEntry.x = x;
    pendingEntry.y = y;
    return;
  }

  clearActive();
  pendingEntry = { key, html: tooltip.html, variant: tooltip.variant, x, y };
  scheduleShow(pendingEntry);
}

export function resetUnitHoverTooltip() {
  cancelTimer();
  pendingEntry = null;
  clearActive();
}

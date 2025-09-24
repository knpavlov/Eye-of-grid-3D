// Подсказка по существу на поле: сбор данных и отображение
import {
  hasInvisibility,
  hasPerfectDodge,
  hasFirstStrike,
  hasDoubleAttack,
  rotateCost,
  resolveAttackProfile,
  isUnitPossessed,
  getUnitProtection,
} from '../core/abilities.js';
import { effectiveStats } from '../core/rules.js';
import { showTooltip, hideTooltip } from '../ui/tooltip.js';

const SOURCE = 'unit-hover';
const DELAY_MS = 1000;
const OFFSET_X = 16;
const OFFSET_Y = 16;
const CLASS_NAME = 'unit-tooltip-panel';

let timerId = null;
let pendingEntry = null;
let activeKey = null;

// --- Вспомогательные утилиты логики ---

function getCardsRef(explicit) {
  if (explicit && typeof explicit === 'object') return explicit;
  if (typeof window !== 'undefined' && window.CARDS) return window.CARDS;
  return {};
}

function getGameState(explicit) {
  if (explicit) return explicit;
  if (typeof window !== 'undefined' && window.gameState) return window.gameState;
  return null;
}

function keyFromUnit(unit, r, c) {
  if (!unit) return null;
  if (unit.uid != null) return `uid:${unit.uid}`;
  if (r != null && c != null) return `pos:${r},${c}:${unit.tplId || ''}`;
  return null;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? String(num) : '—';
}

function formatDescription(desc) {
  if (!desc) return 'No card description available.';
  return escapeHtml(desc).replace(/\n+/g, '<br>');
}

function getCell(state, r, c) {
  if (!state?.board) return null;
  if (typeof r !== 'number' || typeof c !== 'number') return null;
  return state.board?.[r]?.[c] || null;
}

function computeActivationCost(tpl, cell, ctx) {
  if (!tpl) return null;
  try {
    const element = cell?.element;
    const cost = rotateCost(tpl, element, ctx);
    return Number.isFinite(cost) ? Math.max(0, Math.floor(cost)) : null;
  } catch {
    return tpl.activation ?? null;
  }
}

function computeDodgeStatus(unit) {
  const state = unit?.dodgeState;
  if (!state) return null;
  if (!state.limited || state.unlimited) {
    return { key: 'dodge', text: 'Dodge: ∞ attempts' };
  }
  const remaining = Math.max(0, Number(state.remaining ?? state.max ?? 0));
  if (remaining <= 0) return null;
  const attemptsText = remaining === 1 ? '1 attempt' : `${remaining} attempts`;
  return { key: 'dodge', text: `Dodge: ${attemptsText}` };
}

function collectStatuses(state, unit, tpl, { r, c, cell }) {
  const statuses = [];
  if (isUnitPossessed(unit)) {
    statuses.push({ key: 'possessed', text: 'Possessed' });
  }
  if (hasInvisibility(state, r, c, { unit, tpl })) {
    statuses.push({ key: 'invisible', text: 'Invisible' });
  }
  if (hasPerfectDodge(state, r, c, { unit, tpl })) {
    statuses.push({ key: 'perfect-dodge', text: 'Perfect dodge' });
  }
  const dodgeInfo = computeDodgeStatus(unit);
  if (dodgeInfo) {
    statuses.push(dodgeInfo);
  }
  if (hasFirstStrike(tpl)) {
    statuses.push({ key: 'quickness', text: 'Quickness' });
  }
  if (tpl?.fortress) {
    statuses.push({ key: 'fortress', text: 'Fortress' });
  }
  if (hasDoubleAttack(tpl)) {
    statuses.push({ key: 'double-attack', text: 'Double Attack' });
  }
  if (tpl?.fieldquakeLock) {
    statuses.push({ key: 'fieldquake', text: 'Fieldquake lock aura' });
  }
  const protection = getUnitProtection(state, r, c, { unit, tpl });
  if (protection > 0) {
    statuses.push({ key: 'protection', text: `Protection ${protection}` });
  }
  let attackType = tpl?.attackType || 'STANDARD';
  try {
    const profile = resolveAttackProfile(state, r, c, tpl, { unit, cell });
    if (profile?.attackType) {
      attackType = profile.attackType;
    }
  } catch {
    attackType = tpl?.attackType || attackType;
  }
  if (attackType === 'MAGIC') {
    statuses.push({ key: 'magic', text: 'Magic attack' });
  }
  return statuses;
}

function buildTooltipData(state, unit, r, c, cardsRef) {
  if (!unit) return null;
  const tpl = cardsRef?.[unit.tplId];
  if (!tpl) return null;
  const cell = getCell(state, r, c);
  const stats = effectiveStats(cell, unit, { state, r, c, owner: unit.owner });
  const maxHp = Number.isFinite(stats?.hp) ? stats.hp : tpl.hp;
  const currentHp = (typeof unit.currentHP === 'number') ? unit.currentHP : maxHp;
  const atk = Number.isFinite(stats?.atk) ? stats.atk : tpl.atk;
  const activation = computeActivationCost(tpl, cell, { state, r, c, unit, owner: unit.owner });
  const statuses = collectStatuses(state, unit, tpl, { r, c, cell });
  return {
    name: tpl.name || 'Creature',
    cost: tpl.cost,
    activation,
    hpCurrent: currentHp,
    hpMax: maxHp,
    atk,
    desc: tpl.desc || '',
    statuses,
  };
}

// --- Формирование HTML (UI-часть отдельно от логики) ---

const ICONS = {
  cost: 'textures/Icon_mana.png',
  activation: 'textures/Icon_activation.png',
  hp: 'textures/Icon_heart.png',
  atk: 'textures/Icon_sword.png',
};

function renderStat(key, label, value) {
  const icon = ICONS[key];
  const safeValue = escapeHtml(value);
  const alt = label ? `${label} icon` : 'Unit stat icon';
  return `
    <div class="unit-tooltip__stat unit-tooltip__stat--${key}">
      ${icon ? `<img class="unit-tooltip__icon" src="${icon}" alt="${escapeHtml(alt)}" />` : ''}
      <span class="unit-tooltip__stat-value">${safeValue}</span>
    </div>
  `;
}

function renderStatuses(statuses) {
  if (!Array.isArray(statuses) || !statuses.length) {
    return '<div class="unit-tooltip__status unit-tooltip__status--empty">No active statuses</div>';
  }
  return statuses.map((status) => {
    const key = escapeHtml(status.key || 'custom');
    const text = escapeHtml(status.text || 'Status');
    return `<span class="unit-tooltip__status unit-tooltip__status--${key}">${text}</span>`;
  }).join('');
}

function renderTooltipHtml(data) {
  const hpValue = (Number.isFinite(data.hpCurrent) && Number.isFinite(data.hpMax))
    ? `${data.hpCurrent} / ${data.hpMax}`
    : formatNumber(data.hpCurrent);
  const costValue = formatNumber(data.cost);
  const activationValue = formatNumber(data.activation);
  const atkValue = formatNumber(data.atk);
  return `
    <div class="unit-tooltip">
      <div class="unit-tooltip__stats">
        ${renderStat('cost', 'Summon', costValue)}
        ${renderStat('activation', 'Activation', activationValue)}
        ${renderStat('hp', 'Health', hpValue)}
        ${renderStat('atk', 'Attack', atkValue)}
      </div>
      <div class="unit-tooltip__divider"></div>
      <div class="unit-tooltip__section">
        <div class="unit-tooltip__section-title">Abilities</div>
        <div class="unit-tooltip__desc">${formatDescription(data.desc)}</div>
      </div>
      <div class="unit-tooltip__section">
        <div class="unit-tooltip__section-title">Statuses</div>
        <div class="unit-tooltip__statuses">${renderStatuses(data.statuses)}</div>
      </div>
    </div>
  `;
}

// --- Планирование показа/скрытия подсказки ---

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
      className: CLASS_NAME,
    });
    pendingEntry = null;
    timerId = null;
  }, DELAY_MS);
}

// --- Публичные функции ---

export function trackUnitHover({ unit, r, c, event, state, cards }) {
  const gameState = getGameState(state);
  const cardsRef = getCardsRef(cards);
  const key = keyFromUnit(unit, r, c);
  if (!unit || !key) {
    resetUnitHover();
    return;
  }
  const data = buildTooltipData(gameState, unit, r, c, cardsRef);
  if (!data) {
    resetUnitHover();
    return;
  }
  const html = renderTooltipHtml(data);
  const x = (event?.clientX ?? 0) + OFFSET_X;
  const y = (event?.clientY ?? 0) + OFFSET_Y;

  if (activeKey === key) {
    showTooltip(SOURCE, { html, x, y, className: CLASS_NAME });
    return;
  }

  if (pendingEntry && pendingEntry.key === key) {
    pendingEntry.html = html;
    pendingEntry.x = x;
    pendingEntry.y = y;
    return;
  }

  clearActive();
  pendingEntry = { key, html, x, y };
  scheduleShow(pendingEntry);
}

export function resetUnitHover() {
  cancelTimer();
  pendingEntry = null;
  clearActive();
}


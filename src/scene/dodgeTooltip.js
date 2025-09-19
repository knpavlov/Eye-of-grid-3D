// Подсказка с числом попыток Dodge при наведении на существа
import { showTooltip, hideTooltip } from '../ui/tooltip.js';

const SOURCE = 'dodge-hover';
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

function formatDodgeInfo(unit) {
  const state = unit?.dodgeState;
  if (!state) return null;
  if (!state.limited) {
    return { text: 'Dodge: ∞ attempts' };
  }
  const remaining = Math.max(0, Number(state.remaining ?? state.max ?? 0));
  if (remaining <= 0) return null;
  return { text: `Dodge: ${remaining} attempts` };
}

function scheduleShow(entry) {
  cancelTimer();
  pendingEntry = entry;
  timerId = setTimeout(() => {
    if (!pendingEntry) return;
    activeKey = pendingEntry.key;
    showTooltip(SOURCE, {
      text: pendingEntry.text,
      x: pendingEntry.x,
      y: pendingEntry.y,
    });
    pendingEntry = null;
    timerId = null;
  }, DELAY_MS);
}

export function trackDodgeHover({ unit, r, c, event }) {
  const info = formatDodgeInfo(unit);
  if (!info) {
    resetDodgeHover();
    return;
  }
  const key = keyFromUnit(unit, r, c);
  if (!key) {
    resetDodgeHover();
    return;
  }
  const x = (event?.clientX ?? 0) + OFFSET_X;
  const y = (event?.clientY ?? 0) + OFFSET_Y;

  if (activeKey === key) {
    showTooltip(SOURCE, { text: info.text, x, y });
    return;
  }

  if (pendingEntry && pendingEntry.key === key) {
    pendingEntry.text = info.text;
    pendingEntry.x = x;
    pendingEntry.y = y;
    return;
  }

  clearActive();
  pendingEntry = { key, text: info.text, x, y };
  scheduleShow(pendingEntry);
}

export function resetDodgeHover() {
  cancelTimer();
  pendingEntry = null;
  clearActive();
}

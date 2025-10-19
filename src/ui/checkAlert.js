// Координатор оповещений "CHECK": запускает заставку и подсветку панелей
import { showCheckSplash } from './checkSplash.js';

const CONTROL_WARNING_CLASS = 'control-warning';
const _warningState = [false, false];
let _lastTriggerTs = 0;
const MIN_TRIGGER_INTERVAL = 400; // мс

function getControlElement(playerIndex) {
  if (typeof document === 'undefined') return null;
  return document.getElementById(`control-info-${playerIndex}`);
}

function normalizePlayerName(playerIndex, fallback) {
  if (typeof window === 'undefined') return fallback;
  try {
    const gs = window.gameState;
    const raw = gs?.players?.[playerIndex]?.name;
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
  } catch {}
  return fallback;
}

function applyWarning(playerIndex, enabled) {
  if (playerIndex !== 0 && playerIndex !== 1) return;
  _warningState[playerIndex] = !!enabled;
  const el = getControlElement(playerIndex);
  if (el) {
    el.classList.toggle(CONTROL_WARNING_CLASS, _warningState[playerIndex]);
  }
}

export function triggerCheck(playerIndex, options = {}) {
  if (playerIndex !== 0 && playerIndex !== 1) return;
  const now = Date.now();
  if (now - _lastTriggerTs < MIN_TRIGGER_INTERVAL) {
    // избегаем каскада одинаковых заставок
    _lastTriggerTs = now;
  } else {
    _lastTriggerTs = now;
  }

  const label = normalizePlayerName(playerIndex, `Игрок ${playerIndex + 1}`);
  const subtitle = options.subtitle || `${label}: 4 существа на поле`;

  try {
    showCheckSplash({ playerName: subtitle });
  } catch (err) {
    console.warn('[checkAlert] Не удалось показать заставку CHECK', err);
  }

  applyWarning(playerIndex, true);
}

export function setControlWarning(playerIndex, enabled) {
  applyWarning(playerIndex, enabled);
}

export function syncControlPanels({ counts = [] } = {}) {
  for (let i = 0; i < 2; i += 1) {
    const count = Number.isFinite(counts[i]) ? counts[i] : 0;
    applyWarning(i, count >= 4);
  }
}

const api = { triggerCheck, syncControlPanels, setControlWarning };

try {
  if (typeof window !== 'undefined') {
    window.__ui = window.__ui || {};
    window.__ui.checkAlert = api;
  }
} catch {}

export default api;

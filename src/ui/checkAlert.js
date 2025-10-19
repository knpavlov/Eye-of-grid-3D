// Координатор оповещений "CHECK": запускает заставку и подсветку панелей
import { showCheckSplash } from './checkSplash.js';

const CONTROL_WARNING_CLASS = 'control-warning';
const _warningState = [false, false];
const _controlCounts = [0, 0];
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

function runSplash(subtitle) {
  const now = Date.now();
  if (now - _lastTriggerTs < MIN_TRIGGER_INTERVAL) {
    _lastTriggerTs = now;
    return;
  }
  _lastTriggerTs = now;
  try {
    showCheckSplash({ playerName: subtitle });
  } catch (err) {
    console.warn('[checkAlert] Не удалось показать заставку CHECK', err);
  }
}

function updateControlCount(playerIndex, rawCount, { allowSplash = false, subtitle } = {}) {
  if (playerIndex !== 0 && playerIndex !== 1) return;
  const next = Number.isFinite(rawCount) ? rawCount : 0;
  const prev = Number.isFinite(_controlCounts[playerIndex]) ? _controlCounts[playerIndex] : 0;
  _controlCounts[playerIndex] = next;

  const warning = next >= 4;
  applyWarning(playerIndex, warning);

  if (!allowSplash) return;

  const crossedThreshold = warning && prev < 4;
  if (!crossedThreshold) return;

  const label = normalizePlayerName(playerIndex, `Игрок ${playerIndex + 1}`);
  const finalSubtitle = subtitle || `${label}: 4 существа на поле`;
  runSplash(finalSubtitle);
}

export function triggerCheck(playerIndex, options = {}) {
  if (playerIndex !== 0 && playerIndex !== 1) return;
  const label = normalizePlayerName(playerIndex, `Игрок ${playerIndex + 1}`);
  const subtitle = options.subtitle || `${label}: 4 существа на поле`;
  const prev = Number.isFinite(_controlCounts[playerIndex]) ? _controlCounts[playerIndex] : 0;
  const forcedCount = prev < 4 ? 4 : prev;
  updateControlCount(playerIndex, forcedCount, { allowSplash: true, subtitle });
}

export function setControlWarning(playerIndex, enabled) {
  applyWarning(playerIndex, enabled);
}

export function syncControlPanels({ counts = [] } = {}) {
  for (let i = 0; i < 2; i += 1) {
    updateControlCount(i, counts[i], { allowSplash: true });
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

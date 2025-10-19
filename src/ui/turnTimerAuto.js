// Управление автоматическим завершением хода по таймеру
import * as TurnTimer from './turnTimer.js';
import { hasPendingForcedDiscards, requestAutoEndTurn } from '../scene/interactions.js';

const STORAGE_KEY = 'eog3d:autoTurnEnabled';
let _autoEnabled = true;
let _toggleEl = null;
let _initialized = false;

function loadSetting() {
  if (typeof window === 'undefined') return true;
  try {
    const raw = window.localStorage?.getItem(STORAGE_KEY);
    if (raw === '0') return false;
    if (raw === '1') return true;
  } catch {}
  return true;
}

function persistSetting(value) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage?.setItem(STORAGE_KEY, value ? '1' : '0');
  } catch {}
}

function applySetting(value, { silent = false } = {}) {
  _autoEnabled = !!value;
  if (typeof window !== 'undefined') {
    window.__autoTurnTimerEnabled = _autoEnabled;
  }
  if (_toggleEl) {
    _toggleEl.checked = _autoEnabled;
  }
  if (!silent && typeof window !== 'undefined') {
    const text = _autoEnabled ? 'Автопереход по таймеру включен' : 'Автопереход по таймеру отключен';
    window.__ui?.notifications?.show(text, 'info');
  }
  persistSetting(_autoEnabled);
}

function isMyTurn() {
  if (typeof window === 'undefined') return true;
  const state = window.gameState;
  if (!state) return false;
  if (typeof window.MY_SEAT === 'number') {
    return state.active === window.MY_SEAT;
  }
  return true;
}

function handleTimerExpire() {
  if (!_autoEnabled) return;
  if (typeof window === 'undefined') return;
  const state = window.gameState;
  if (!state || state.winner !== null) return;
  if (!isMyTurn()) return;
  if (window.__endTurnInProgress) return;
  if (hasPendingForcedDiscards()) {
    window.__ui?.notifications?.show('Время вышло, завершите обязательные действия.', 'warning');
    return;
  }
  const seconds = typeof TurnTimer.getSeconds === 'function'
    ? TurnTimer.getSeconds()
    : (typeof window.__turnTimerSeconds === 'number' ? window.__turnTimerSeconds : 0);
  if (seconds > 0) return;

  window.__ui?.notifications?.show('Время вышло: ход завершён автоматически.', 'info');
  try {
    requestAutoEndTurn();
  } catch (err) {
    console.warn('[turnTimerAuto] Не удалось инициировать завершение хода', err);
  }
}

export function bindToggle(element) {
  _toggleEl = element || null;
  if (!_toggleEl) return;
  _toggleEl.checked = _autoEnabled;
  _toggleEl.addEventListener('change', () => {
    applySetting(_toggleEl.checked);
  });
}

export function setAutoEnabled(value) {
  applySetting(value);
}

export function isAutoEnabled() {
  return _autoEnabled;
}

export function initAutoTurnTimer() {
  if (_initialized) return;
  _autoEnabled = loadSetting();
  applySetting(_autoEnabled, { silent: true });
  try {
    TurnTimer.onExpire(handleTimerExpire);
  } catch (err) {
    console.warn('[turnTimerAuto] Не удалось подключить обработчик истечения таймера', err);
  }
  _initialized = true;
}

const api = { initAutoTurnTimer, bindToggle, isAutoEnabled, setAutoEnabled };

try {
  if (typeof window !== 'undefined') {
    window.__ui = window.__ui || {};
    window.__ui.turnTimerAuto = api;
  }
} catch {}

export default api;

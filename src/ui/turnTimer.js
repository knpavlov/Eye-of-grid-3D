// Turn timer UI controller

let _btn = null;
let _timerId = null;
let _seconds = 0;
const URGENT_THRESHOLD = 10;
let _autoEnabled = true;
try {
  if (typeof window !== 'undefined' && typeof window.__turnTimerAutoEnabled === 'boolean') {
    _autoEnabled = !!window.__turnTimerAutoEnabled;
  }
} catch {}
let _autoTriggered = false;
let _toggleEl = null;
let _toggleListener = null;

function _syncButton() {
  try {
    if (!_btn) return;
    const fill = _btn.querySelector('.time-fill');
    const txt = _btn.querySelector('.sec-text');
    const s = Math.max(0, Math.min(100, Number(_seconds) || 0));
    if (txt) txt.textContent = String(s);
    const percent = s / 100;
    if (fill) fill.style.top = `${Math.round((1 - percent) * 100)}%`;
    if (s <= URGENT_THRESHOLD) { _btn.classList.add('urgent'); } else { _btn.classList.remove('urgent'); }
  } catch {}
}

function _syncToggleState() {
  if (!_toggleEl) return;
  try { _toggleEl.checked = !!_autoEnabled; } catch {}
}

function _handleExpire() {
  if (_autoTriggered || !_autoEnabled) return;
  const w = typeof window !== 'undefined' ? window : null;
  if (!w) return;
  const gameState = w.gameState;
  const seat = (typeof w.MY_SEAT === 'number') ? w.MY_SEAT : null;
  if (seat != null && gameState && gameState.active !== seat) return;
  _autoTriggered = true;
  stop();
  try { w.__interactions?.requestAutoEndTurn?.(); } catch {}
  if (!gameState || seat == null || gameState.active === seat) {
    try { w.showNotification?.('Время вышло — ход завершён автоматически.', 'info'); } catch {}
  }
}

function _tick() {
  const next = Math.max(0, (_seconds || 0) - 1);
  _setSeconds(next);
  if (next <= 0) {
    _handleExpire();
  }
}

function _setSeconds(v) {
  const next = Math.max(0, Number(v) || 0);
  _seconds = next;
  if (next > 0) { _autoTriggered = false; }
  try { if (typeof window !== 'undefined') window.__turnTimerSeconds = _seconds; } catch {}
  _syncButton();
}

export function attach(buttonOrId) {
  if (typeof buttonOrId === 'string') {
    _btn = (typeof document !== 'undefined') ? document.getElementById(buttonOrId) : null;
  } else {
    _btn = buttonOrId || null;
  }
  return api;
}

export function start(seconds) {
  try { if (_timerId) { clearInterval(_timerId); _timerId = null; } } catch {}
  if (typeof seconds === 'number') _setSeconds(seconds);
  _timerId = setInterval(_tick, 1000);
  _syncButton();
  if (_seconds <= 0) {
    _handleExpire();
  }
  return api;
}

export function stop() {
  try { if (_timerId) clearInterval(_timerId); } catch {}
  _timerId = null;
  return api;
}

export function reset(seconds = 100) {
  stop();
  _setSeconds(seconds);
  return api;
}

export function set(seconds) {
  _setSeconds(seconds);
  return api;
}

export function getSeconds() { return _seconds; }

export function init({ buttonId = 'end-turn-btn', seconds = 100 } = {}) {
  attach(buttonId);
  reset(seconds);
  start();
  return api;
}

export function setAutoEnabled(enabled) {
  _autoEnabled = !!enabled;
  try { if (typeof window !== 'undefined') window.__turnTimerAutoEnabled = _autoEnabled; } catch {}
  if (!_autoEnabled) { _autoTriggered = false; }
  _syncToggleState();
  return api;
}

export function isAutoEnabled() { return _autoEnabled; }

export function bindAutoToggle(inputOrId) {
  if (typeof document === 'undefined') return api;
  const el = typeof inputOrId === 'string' ? document.getElementById(inputOrId) : inputOrId;
  if (!el) return api;
  if (_toggleListener && _toggleEl) {
    try { _toggleEl.removeEventListener('change', _toggleListener); } catch {}
  }
  _toggleEl = el;
  _toggleListener = () => { setAutoEnabled(_toggleEl.checked); };
  _toggleEl.addEventListener('change', _toggleListener);
  _syncToggleState();
  return api;
}

const api = { attach, start, stop, reset, set, getSeconds, init, setAutoEnabled, isAutoEnabled, bindAutoToggle };

try { if (typeof window !== 'undefined') { window.__ui = window.__ui || {}; window.__ui.turnTimer = api; } } catch {}

export default api;


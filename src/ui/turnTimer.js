// Turn timer UI controller

let _btn = null;
let _timerId = null;
let _seconds = 0;
const URGENT_THRESHOLD = 10;

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

function _setSeconds(v) {
  _seconds = Math.max(0, Number(v) || 0);
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
  _timerId = setInterval(() => {
    _setSeconds(Math.max(0, (_seconds || 0) - 1));
  }, 1000);
  _syncButton();
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

const api = { attach, start, stop, reset, set, getSeconds, init };

try { if (typeof window !== 'undefined') { window.__ui = window.__ui || {}; window.__ui.turnTimer = api; } } catch {}

export default api;


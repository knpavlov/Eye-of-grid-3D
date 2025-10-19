// Turn timer UI controller

let _btn = null;
let _timerId = null;
let _seconds = 0;
const URGENT_THRESHOLD = 10;
let _onExpire = null;
let _expireFired = false;

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
  const next = Math.max(0, Number(v) || 0);
  _seconds = next;
  if (next > 0) {
    _expireFired = false;
  }
  try { if (typeof window !== 'undefined') window.__turnTimerSeconds = _seconds; } catch {}
  _syncButton();
  if (next <= 0) {
    _triggerExpire();
  }
}

function _triggerExpire() {
  if (_expireFired) return;
  _expireFired = true;
  if (typeof _onExpire === 'function') {
    try { _onExpire(); } catch (err) { console.warn('[turnTimer] onExpire handler error', err); }
  }
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
  if (typeof seconds === 'number') {
    _setSeconds(seconds);
  }
  _expireFired = _seconds <= 0;
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
  _expireFired = false;
  _setSeconds(seconds);
  return api;
}

export function set(seconds) {
  _setSeconds(seconds);
  return api;
}

export function getSeconds() { return _seconds; }

export function onExpire(handler) {
  _onExpire = (typeof handler === 'function') ? handler : null;
  return api;
}

export function init({ buttonId = 'end-turn-btn', seconds = 100 } = {}) {
  attach(buttonId);
  reset(seconds);
  start();
  return api;
}

const api = { attach, start, stop, reset, set, getSeconds, init, onExpire };

try { if (typeof window !== 'undefined') { window.__ui = window.__ui || {}; window.__ui.turnTimer = api; } } catch {}

export default api;


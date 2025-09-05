// Opponent hand count indicator
let _container = null;
let _hooked = false;

function _getContainer() {
  if (_container) return _container;
  try {
    _container = (typeof document !== 'undefined') ? document.getElementById('opponent-hand') : null;
  } catch {
    _container = null;
  }
  return _container;
}

function _render(count) {
  const el = _getContainer();
  if (!el) return;
  try {
    el.innerHTML = '';
    const maxCards = Math.max(0, Number(count) || 0);
    const n = Math.min(maxCards, 10);
    const step = 6; // degrees between cards
    const start = -(n - 1) * step / 2;
    for (let i = 0; i < n; i++) {
      const card = document.createElement('div');
      card.className = 'hand-count-card';
      const ang = start + i * step;
      card.style.transform = `translateX(-50%) rotate(${ang}deg)`;
      card.style.zIndex = String(i + 1);
      el.appendChild(card);
    }
    el.title = `${maxCards} card${maxCards === 1 ? '' : 's'}`;
  } catch {}
}

export function update() {
  try {
    const gs = (typeof window !== 'undefined') ? window.gameState : null;
    const mySeat = (typeof window !== 'undefined' && typeof window.MY_SEAT === 'number') ? window.MY_SEAT : 0;
    const opp = 1 - mySeat;
    const count = gs?.players?.[opp]?.hand?.length || 0;
    _render(count);
  } catch {}
}

function _hookUpdateUI() {
  if (_hooked) return;
  try {
    const prev = (typeof window !== 'undefined') ? window.updateUI : null;
    if (prev) {
      window.updateUI = function (...args) {
        const res = prev.apply(this, args);
        try { update(); } catch {}
        return res;
      };
    } else if (typeof window !== 'undefined') {
      window.updateUI = function (...args) {
        const res = undefined;
        try { update(); } catch {}
        return res;
      };
    }
  } catch {}
  _hooked = true;
}

export function init() {
  try { _container = null; _getContainer(); } catch {}
  _hookUpdateUI();
  try { update(); } catch {}
  return api;
}

const api = { init, update };

try {
  if (typeof window !== 'undefined') {
    window.__ui = window.__ui || {};
    window.__ui.opponentHand = api;
  }
} catch {}

export default api;

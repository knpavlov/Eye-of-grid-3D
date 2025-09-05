// Opponent hand count indicator
// Renders small fan of cards representing opponent hand size

let _container = null;

function _ensureContainer(id = 'opponent-hand-count') {
  if (!_container && typeof document !== 'undefined') {
    _container = document.getElementById(id);
    if (_container) _container.innerHTML = '';
  }
  return _container;
}

export function render(count) {
  const el = _ensureContainer();
  if (!el) return;
  const n = Math.max(0, Number(count) || 0);
  el.innerHTML = '';
  el.setAttribute('title', `Opponent has ${n} card${n === 1 ? '' : 's'}`);
  // basic fan layout: cards rotate around bottom center
  for (let i = 0; i < n; i++) {
    const card = document.createElement('div');
    card.className = 'opp-card';
    const stepAngle = 14; // degrees between cards
    const stepOffset = 7; // px horizontal offset
    const offsetIndex = i - (n - 1) / 2;
    const angle = offsetIndex * stepAngle;
    const offset = offsetIndex * stepOffset;
    card.style.transform = `translateX(${offset}px) rotate(${angle}deg)`;
    card.style.zIndex = String(n - i);
    el.appendChild(card);
  }
}

export function init(id = 'opponent-hand-count') {
  _container = document.getElementById(id);
  return api;
}

const api = { render, init };

try {
  if (typeof window !== 'undefined') {
    window.__ui = window.__ui || {};
    window.__ui.handCount = api;
  }
} catch {}

export default api;

// Opponent hand size display UI
// Renders a small fan of cards showing how many cards the other player holds

let _el = null;

function _getEl(id = 'opponent-hand') {
  if (!_el && typeof document !== 'undefined') {
    _el = document.getElementById(id);
  }
  return _el;
}

export function render(gameState, id = 'opponent-hand') {
  const el = _getEl(id);
  if (!el || !gameState || !Array.isArray(gameState.players)) return;

  const mySeat = (typeof window !== 'undefined' && window.MY_SEAT != null)
    ? window.MY_SEAT
    : gameState.active;
  const otherSeat = mySeat === 0 ? 1 : 0;
  const count = gameState.players?.[otherSeat]?.hand?.length || 0;

  // Clear previous cards
  el.innerHTML = '';

  const maxDisplay = Math.min(count, 10); // don't overflow visually
  for (let i = 0; i < maxDisplay; i++) {
    const card = document.createElement('div');
    card.className = 'opp-card';
    // Fan out cards with small rotation/translation
    const offset = -((maxDisplay - 1) * 6) / 2 + i * 6;
    const rot = -((maxDisplay - 1) * 3) / 2 + i * 3;
    card.style.transform = `translateX(${offset}px) rotate(${rot}deg)`;
    el.appendChild(card);
  }

  // Update tooltip
  el.title = `${count} card${count === 1 ? '' : 's'} in opponent's hand`;
}

export function init(id = 'opponent-hand') {
  _el = (typeof document !== 'undefined') ? document.getElementById(id) : null;
  if (typeof window !== 'undefined' && window.gameState) {
    render(window.gameState, id);
  }
  return api;
}

const api = { init, render };

try {
  if (typeof window !== 'undefined') {
    window.__ui = window.__ui || {};
    window.__ui.opponentHand = api;
  }
} catch {}

export default api;


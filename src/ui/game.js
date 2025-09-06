// Game initialization logic extracted from index.html
// Depends on global window variables and modules exposed via main.js
export async function initGame() {
  const startGame = window.startGame;
  const STARTER_FIRESET = window.STARTER_FIRESET;
  if (!startGame || !Array.isArray(STARTER_FIRESET)) return;

  // Создаём состояние игры и сохраняем глобально
  window.gameState = startGame(STARTER_FIRESET, STARTER_FIRESET);
  const gameState = window.gameState;

  // Немедленно строим сцену и UI
  if (typeof window.createBoard === 'function') window.createBoard();
  if (typeof window.createMetaObjects === 'function') window.createMetaObjects();
  if (typeof window.updateUnits === 'function') window.updateUnits();
  if (typeof window.updateHand === 'function') window.updateHand();
  if (typeof window.updateUI === 'function') window.updateUI();

  // Заставка начала игры
  try {
    const banner = window.__ui?.banner;
    const turn = gameState?.turn;
    const fn = banner?.ensureTurnSplashVisible || banner?.forceTurnSplashWithRetry || window.forceTurnSplashWithRetry;
    if (typeof fn === 'function') {
      await fn.call(banner, 2, turn);
    }
  } catch {}

  // Запуск таймера хода
  try { if (window.__turnTimerId) clearInterval(window.__turnTimerId); } catch {}
  window.__turnTimerSeconds = 100;
  (function syncBtn(){ try {
    const btn = document.getElementById('end-turn-btn');
    if (btn) {
      const fill = btn.querySelector('.time-fill');
      const txt = btn.querySelector('.sec-text');
      if (txt) txt.textContent = `${window.__turnTimerSeconds}`;
      if (fill) fill.style.top = `0%`;
    }
  } catch {} })();
  try {
    const tt = window.__ui?.turnTimer?.attach?.('end-turn-btn');
    const online = (typeof window.NET_ON === 'function') ? window.NET_ON() : !!window.NET_ACTIVE;
    if (tt) { online ? tt.stop() : tt.reset(100).start(); }
  } catch {}

  // Стартовые сообщения
  try { window.__ui?.log?.add('The game has begun! Player 1 goes first.'); } catch {}
  try { window.__ui?.log?.add('Drag units to the field, use spells by clicking.'); } catch {}
}

const api = { initGame };
try {
  if (typeof window !== 'undefined') {
    window.initGame = initGame;
    window.__ui = window.__ui || {};
    window.__ui.game = api;
  }
} catch {}

export default api;

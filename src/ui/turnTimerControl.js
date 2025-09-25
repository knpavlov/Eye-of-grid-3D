// Управление паузами таймера хода для ситуаций вроде принудительного сброса

const pauseReasons = new Set();
let offlineWasRunning = false;
let uiTimerWasRunning = false;

function getWindow() {
  if (typeof window === 'undefined') return null;
  return window;
}

function syncButton(w) {
  try {
    const btn = w.document?.getElementById?.('end-turn-btn');
    if (!btn) return;
    const fill = btn.querySelector('.time-fill');
    const txt = btn.querySelector('.sec-text');
    const seconds = Math.max(0, Math.min(100, Number(w.__turnTimerSeconds) || 0));
    if (txt) txt.textContent = `${seconds}`;
    if (fill) fill.style.top = `${Math.round((1 - seconds / 100) * 100)}%`;
    if (seconds <= 10) { btn.classList.add('urgent'); } else { btn.classList.remove('urgent'); }
  } catch {}
}

function startOfflineInterval(w) {
  if (!w) return;
  try { if (w.__turnTimerId) clearInterval(w.__turnTimerId); } catch {}
  syncButton(w);
  w.__turnTimerId = setInterval(() => {
    if (typeof w.__turnTimerSeconds !== 'number') {
      w.__turnTimerSeconds = 100;
    }
    if (w.__turnTimerSeconds > 0) {
      w.__turnTimerSeconds -= 1;
    }
    syncButton(w);
  }, 1000);
}

export function pauseTurnTimer(reason = 'generic') {
  const w = getWindow();
  if (!w) return;
  const key = String(reason || 'generic');
  const firstPause = pauseReasons.size === 0;
  pauseReasons.add(key);
  if (!firstPause) return;

  offlineWasRunning = !!w.__turnTimerId;
  if (offlineWasRunning) {
    try { clearInterval(w.__turnTimerId); } catch {}
    w.__turnTimerId = null;
  }

  const uiTimer = w.__ui?.turnTimer;
  const netOnline = typeof w.NET_ON === 'function' ? !!w.NET_ON() : !!w.NET_ACTIVE;
  uiTimerWasRunning = !!uiTimer && !netOnline;
  try { uiTimer?.stop?.(); } catch {}
}

export function resumeTurnTimer(reason = 'generic') {
  const w = getWindow();
  if (!w) return;
  const key = String(reason || 'generic');
  if (!pauseReasons.delete(key)) return;
  if (pauseReasons.size > 0) return;

  if (uiTimerWasRunning) {
    try { w.__ui?.turnTimer?.start?.(); } catch {}
  }
  if (offlineWasRunning) {
    startOfflineInterval(w);
  }
  offlineWasRunning = false;
  uiTimerWasRunning = false;
}

const api = { pauseTurnTimer, resumeTurnTimer };

try {
  if (typeof window !== 'undefined') {
    window.__ui = window.__ui || {};
    window.__ui.turnTimerControl = api;
  }
} catch {}

export default api;

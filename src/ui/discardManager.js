// Менеджер очереди принудительного сброса карт
import { interactionState } from '../scene/interactions.js';
import { discardHandCard } from '../scene/discard.js';

const DEFAULT_AUTO_MS = 20000;

const managerState = {
  container: null,
  titleEl: null,
  timerEl: null,
  subEl: null,
  raf: null,
  timeout: null,
  active: null,
  lastStateId: 0,
};

function ensureContainer() {
  if (managerState.container) return managerState.container;
  if (typeof document === 'undefined') return null;

  const wrap = document.createElement('div');
  wrap.id = 'discard-overlay';
  wrap.style.position = 'fixed';
  wrap.style.inset = '0';
  wrap.style.display = 'none';
  wrap.style.alignItems = 'center';
  wrap.style.justifyContent = 'center';
  wrap.style.pointerEvents = 'none';
  wrap.style.zIndex = '1300';

  const card = document.createElement('div');
  card.style.minWidth = '320px';
  card.style.maxWidth = '420px';
  card.style.padding = '18px 20px';
  card.style.borderRadius = '12px';
  card.style.background = 'rgba(15,23,42,0.92)';
  card.style.border = '1px solid rgba(148,163,184,0.35)';
  card.style.color = '#e2e8f0';
  card.style.fontFamily = 'system-ui, -apple-system, "Segoe UI", sans-serif';
  card.style.textAlign = 'center';
  card.style.boxShadow = '0 18px 40px rgba(2,6,23,0.55)';
  card.style.pointerEvents = 'auto';

  const title = document.createElement('div');
  title.style.fontSize = '18px';
  title.style.fontWeight = '700';
  title.style.marginBottom = '10px';

  const timer = document.createElement('div');
  timer.style.fontSize = '32px';
  timer.style.fontWeight = '800';
  timer.style.letterSpacing = '0.05em';
  timer.style.marginBottom = '12px';

  const sub = document.createElement('div');
  sub.style.fontSize = '14px';
  sub.style.color = '#cbd5f5';
  sub.style.lineHeight = '1.4';

  card.appendChild(title);
  card.appendChild(timer);
  card.appendChild(sub);
  wrap.appendChild(card);
  document.body.appendChild(wrap);

  managerState.container = wrap;
  managerState.titleEl = title;
  managerState.timerEl = timer;
  managerState.subEl = sub;
  return wrap;
}

function hideOverlay() {
  if (managerState.container) managerState.container.style.display = 'none';
}

function showOverlay() {
  const node = ensureContainer();
  if (node) node.style.display = 'flex';
}

function clearTimers() {
  if (managerState.timeout) {
    clearTimeout(managerState.timeout);
    managerState.timeout = null;
  }
  if (managerState.raf) {
    cancelAnimationFrame(managerState.raf);
    managerState.raf = null;
  }
}

function getLocalSeats() {
  try {
    const netOn = typeof window.NET_ON === 'function' ? window.NET_ON() : false;
    if (!netOn) return [0, 1];
    const seat = (typeof window.MY_SEAT === 'number') ? window.MY_SEAT : 0;
    return [seat];
  } catch {
    return [0, 1];
  }
}

function resolvePlayerName(state, idx) {
  const player = state?.players?.[idx];
  return player?.name || `Player ${idx + 1}`;
}

function formatCardName(tplId) {
  try {
    const tpl = window.CARDS?.[tplId];
    return tpl?.name || tplId || 'Card';
  } catch {
    return tplId || 'Card';
  }
}

function formatSource(req) {
  if (!req?.source) return 'Способность';
  const name = req.source.name || formatCardName(req.source.tplId);
  return `${name}`;
}

function formatRemaining(n) {
  const val = Math.max(0, Number(n) || 0);
  if (val === 1) return '1 карту';
  if (val >= 2 && val <= 4) return `${val} карты`;
  return `${val} карт`;
}

function updateTimerDisplay() {
  const req = managerState.active;
  if (!req || !managerState.timerEl) return;
  const now = Date.now();
  const msLeft = Math.max(0, (req.deadline || 0) - now);
  const seconds = Math.ceil(msLeft / 1000);
  managerState.timerEl.textContent = `${seconds} с`;
  if (msLeft <= 0) {
    managerState.raf = null;
    managerState.timerEl.textContent = '0 с';
    managerState.timeout = null;
    managerState.deadline = null;
    triggerAutoDiscard();
    return;
  }
  managerState.raf = requestAnimationFrame(updateTimerDisplay);
}

function scheduleCountdown() {
  clearTimers();
  const req = managerState.active;
  if (!req) return;
  const duration = req.autoRandomMs || DEFAULT_AUTO_MS;
  const deadline = Date.now() + duration;
  req.deadline = deadline;
  managerState.timeout = setTimeout(triggerAutoDiscard, duration + 20);
  managerState.raf = requestAnimationFrame(updateTimerDisplay);
}

function resetSelectionState() {
  if (interactionState.pendingDiscardSelection?.requestId === managerState.active?.id) {
    interactionState.pendingDiscardSelection = null;
  }
}

function finishRequest() {
  clearTimers();
  resetSelectionState();
  hideOverlay();
  managerState.active = null;
}

function applyStateMutation(updater) {
  try {
    const gs = window.gameState;
    if (!gs) return;
    updater(gs);
    if (typeof window.schedulePush === 'function') {
      window.schedulePush('forced-discard', { force: false });
    }
    if (typeof window.updateHand === 'function') {
      window.updateHand(gs);
    }
    if (typeof window.__ui?.handCount?.update === 'function') {
      window.__ui.handCount.update(gs);
    }
  } catch {}
}

function removeRequestFromState(reqId) {
  applyStateMutation((gs) => {
    const queue = Array.isArray(gs.pendingDiscards) ? gs.pendingDiscards : (gs.pendingDiscards = []);
    const idx = queue.findIndex(item => item && item.id === reqId);
    if (idx >= 0) {
      queue.splice(idx, 1);
    }
  });
}

function updateRequestRemaining(reqId, remaining) {
  applyStateMutation((gs) => {
    const queue = Array.isArray(gs.pendingDiscards) ? gs.pendingDiscards : (gs.pendingDiscards = []);
    const item = queue.find(entry => entry && entry.id === reqId);
    if (item) item.remaining = remaining;
  });
}

function handleDiscard(handIdx, { auto = false } = {}) {
  const req = managerState.active;
  const state = window.gameState;
  if (!req || !state) return;
  const player = state.players?.[req.target];
  if (!player || !Array.isArray(player.hand) || player.hand.length === 0) {
    removeRequestFromState(req.id);
    finishRequest();
    return;
  }
  if (typeof handIdx !== 'number' || handIdx < 0 || handIdx >= player.hand.length) {
    return;
  }
  const cardTpl = player.hand[handIdx];
  discardHandCard(player, handIdx);
  const tplName = cardTpl?.name || formatCardName(cardTpl?.id || cardTpl?.tplId);
  const playerName = resolvePlayerName(state, req.target);
  const sourceName = formatSource(req);
  if (auto) {
    window.addLog?.(`${sourceName}: ${playerName} сбрасывает ${tplName} автоматически (таймер).`);
  } else {
    window.addLog?.(`${sourceName}: ${playerName} сбрасывает ${tplName}.`);
  }

  const newRemaining = Math.max(0, (req.remaining || 1) - 1);
  req.remaining = newRemaining;
  if (newRemaining <= 0) {
    removeRequestFromState(req.id);
    finishRequest();
    syncWithState(window.gameState);
    return;
  }
  updateRequestRemaining(req.id, newRemaining);
  managerState.subEl.textContent = `${playerName}: сбросьте ${formatRemaining(newRemaining)}.`;
  scheduleCountdown();
  prepareSelection();
}

function triggerAutoDiscard() {
  const req = managerState.active;
  const state = window.gameState;
  if (!req || !state) return;
  const player = state.players?.[req.target];
  const hand = Array.isArray(player?.hand) ? player.hand : [];
  if (!hand.length) {
    removeRequestFromState(req.id);
    finishRequest();
    syncWithState(state);
    return;
  }
  const idx = Math.floor(Math.random() * hand.length);
  handleDiscard(idx, { auto: true });
}

function prepareSelection() {
  const req = managerState.active;
  const state = window.gameState;
  if (!req || !state) return;
  const player = state.players?.[req.target];
  if (!player || !Array.isArray(player.hand) || player.hand.length === 0) {
    removeRequestFromState(req.id);
    finishRequest();
    syncWithState(state);
    return;
  }
  interactionState.pendingDiscardSelection = {
    forced: true,
    requestId: req.id,
    onPicked: (handIdx) => {
      handleDiscard(handIdx, { auto: false });
    },
  };
}

function beginRequest(state, req) {
  const container = ensureContainer();
  if (!container) return;
  managerState.active = { ...req };
  const playerName = resolvePlayerName(state, req.target);
  const source = formatSource(req);
  managerState.titleEl.textContent = `${source}: требуется сброс`;
  managerState.subEl.textContent = `${playerName}: сбросьте ${formatRemaining(req.remaining)}.`;
  showOverlay();
  prepareSelection();
  scheduleCountdown();
}

function cancelIfStale(state) {
  const req = managerState.active;
  if (!req) return;
  const queue = Array.isArray(state?.pendingDiscards) ? state.pendingDiscards : [];
  const match = queue.find(item => item && item.id === req.id);
  if (!match || match.remaining <= 0) {
    finishRequest();
  }
}

function findNextLocalRequest(state) {
  const queue = Array.isArray(state?.pendingDiscards) ? state.pendingDiscards : [];
  if (!queue.length) return null;
  const seats = getLocalSeats();
  for (const req of queue) {
    if (!req || req.remaining <= 0) continue;
    if (seats.includes(req.target)) return req;
  }
  return null;
}

export function syncWithState(state) {
  const seats = getLocalSeats();
  if (!state || seats.length === 0) {
    finishRequest();
    return;
  }
  if (managerState.active) {
    cancelIfStale(state);
  }
  const current = managerState.active;
  if (current) {
    const queue = Array.isArray(state.pendingDiscards) ? state.pendingDiscards : [];
    const match = queue.find(item => item && item.id === current.id);
    if (match && match.remaining !== current.remaining) {
      current.remaining = match.remaining;
      managerState.subEl.textContent = `${resolvePlayerName(state, match.target)}: сбросьте ${formatRemaining(match.remaining)}.`;
      scheduleCountdown();
      prepareSelection();
    }
    return;
  }
  const next = findNextLocalRequest(state);
  if (!next) {
    finishRequest();
    return;
  }
  beginRequest(state, next);
}

export function initDiscardManager() {
  ensureContainer();
}

const api = { initDiscardManager, syncWithState };

try {
  if (typeof window !== 'undefined') {
    window.__ui = window.__ui || {};
    window.__ui.discardManager = api;
  }
} catch {}

export default api;

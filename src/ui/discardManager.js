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
  turnTimerPaused: false,
  waitingServer: false,
  activeSeatBlocked: false,
  activeSeatMessage: '',
};

function isNetOn() {
  try {
    return typeof window !== 'undefined' && typeof window.NET_ON === 'function' && window.NET_ON();
  } catch {
    return false;
  }
}

function getMySeat() {
  try {
    return typeof window !== 'undefined' && typeof window.MY_SEAT === 'number' ? window.MY_SEAT : null;
  } catch {
    return null;
  }
}

function getSocket() {
  try {
    return typeof window !== 'undefined' ? window.socket : null;
  } catch {
    return null;
  }
}

function notifyInputLockChanged() {
  try {
    if (typeof window !== 'undefined' && window.updateInputLock) {
      window.updateInputLock();
    }
  } catch {}
}

// Останавливаем общий таймер хода, пока игрок выбирает карты для сброса
function pauseTurnTimer() {
  if (managerState.turnTimerPaused) return;
  try {
    if (typeof window !== 'undefined' && window.__ui?.turnTimer?.stop) {
      window.__ui.turnTimer.stop();
      managerState.turnTimerPaused = true;
    }
  } catch {}
}

// Возобновляем таймер, когда все локальные запросы на сброс выполнены
function resumeTurnTimerIfIdle(state) {
  if (!managerState.turnTimerPaused) return;
  const gs = state || (typeof window !== 'undefined' ? window.gameState : null);
  if (!gs) {
    managerState.turnTimerPaused = false;
    try { window.__ui?.turnTimer?.start?.(); } catch {}
    return;
  }
  const queue = Array.isArray(gs.pendingDiscards) ? gs.pendingDiscards : [];
  const hasPending = queue.some(item => item && item.remaining > 0);
  if (hasPending) return;
  managerState.turnTimerPaused = false;
  try { window.__ui?.turnTimer?.start?.(); } catch {}
}

function hasPendingForTarget(state, target, excludeId = null) {
  if (!state || typeof target !== 'number') return false;
  const queue = Array.isArray(state.pendingDiscards) ? state.pendingDiscards : [];
  return queue.some(item => item && item.remaining > 0 && item.target === target && item.id !== excludeId);
}

function resolveAutoSeats(req) {
  const seats = [];
  if (req && typeof req?.source?.owner === 'number') {
    seats.push(req.source.owner);
  }
  if (req && typeof req?.target === 'number' && !seats.includes(req.target)) {
    seats.push(req.target);
  }
  return seats;
}

function maybeScheduleAutoEndAfterDiscard(req, state) {
  if (!req) return;
  const gs = state || (typeof window !== 'undefined' ? window.gameState : null);
  if (!gs) return;
  const pendingAuto = Math.max(0, Number(gs.pendingAutoEndRequests) || 0);
  if (pendingAuto <= 0) return;
  const seats = resolveAutoSeats(req);
  if (!seats.includes(gs.active)) return;
  if (hasPendingForTarget(gs, gs.active, req.id)) return;
  if (typeof window !== 'undefined' && typeof window.MY_SEAT === 'number' && window.MY_SEAT !== gs.active) {
    return;
  }
  try {
    if (typeof window !== 'undefined') {
      window.__interactions?.requestAutoEndTurn?.({ resumeOnly: true });
    }
  } catch {}
}

function completeRequestAndSync(req, state) {
  if (!req) return;
  removeRequestFromState(req.id);
  handleRequestResolved(req, state);
  finishRequest();
  const gs = (typeof window !== 'undefined' ? window.gameState : state) || state;
  if (typeof setTimeout === 'function') {
    setTimeout(() => {
      const latest = (typeof window !== 'undefined' ? window.gameState : gs) || gs;
      syncWithState(latest);
    }, 0);
  } else {
    syncWithState(gs);
  }
}

function handleRequestResolved(req, state) {
  if (!req) return;
  managerState.waitingServer = false;
  maybeScheduleAutoEndAfterDiscard(req, state);
}

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
  managerState.waitingServer = false;
  notifyInputLockChanged();
  resumeTurnTimerIfIdle(typeof window !== 'undefined' ? window.gameState : null);
}

function setActiveSeatBlock(blocked, message = '') {
  const normalized = blocked ? (message || 'Оппонент выбирает карты для сброса…') : '';
  const wasBlocked = managerState.activeSeatBlocked;
  const prevMessage = managerState.activeSeatMessage;
  managerState.activeSeatBlocked = !!blocked;
  managerState.activeSeatMessage = managerState.activeSeatBlocked ? normalized : '';
  if (wasBlocked !== managerState.activeSeatBlocked || prevMessage !== managerState.activeSeatMessage) {
    notifyInputLockChanged();
  }
}

function computeActiveSeatBlock(state, queue) {
  if (!state) {
    setActiveSeatBlock(false);
    return;
  }
  const pending = Array.isArray(queue) ? queue : (Array.isArray(state.pendingDiscards) ? state.pendingDiscards : []);
  const activeSeat = typeof state.active === 'number' ? state.active : null;
  if (!pending.length || activeSeat == null) {
    setActiveSeatBlock(false);
    return;
  }
  for (const req of pending) {
    if (!req || req.remaining <= 0) continue;
    if (typeof req.target !== 'number') continue;
    if (req.target === activeSeat) continue;
    const playerName = resolvePlayerName(state, req.target);
    const message = `${playerName} выбирает карты для сброса…`;
    setActiveSeatBlock(true, message);
    return;
  }
  setActiveSeatBlock(false);
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
    completeRequestAndSync(req, state);
    return;
  }
  if (typeof handIdx !== 'number' || handIdx < 0 || handIdx >= player.hand.length) {
    return;
  }
  const mySeat = getMySeat();
  const netActive = isNetOn();
  const requiresServer = netActive && mySeat != null && mySeat === req.target && state.active !== mySeat;
  const tplPreview = player.hand[handIdx];
  const tplName = tplPreview?.name || formatCardName(tplPreview?.id || tplPreview?.tplId);
  const playerName = resolvePlayerName(state, req.target);
  const sourceName = formatSource(req);

  if (requiresServer) {
    if (managerState.waitingServer) return;
    const socket = getSocket();
    if (!socket) {
      // Если сокет недоступен, пытаемся обработать локально как в оффлайн-режиме
      window.console?.warn?.('[discard] Нет подключения к серверу, выполняем локально.');
    } else {
      clearTimers();
      managerState.waitingServer = true;
      managerState.subEl.textContent = `${playerName}: ожидаем подтверждение сброса…`;
      interactionState.pendingDiscardSelection = null;
      try {
        socket.emit('forcedDiscardResolve', {
          requestId: req.id,
          target: req.target,
          handIdx,
          auto: !!auto,
        });
        if (auto) {
          window.addLog?.(`${sourceName}: ${playerName} инициирует автоматический сброс ${tplName} (таймер).`);
        } else {
          window.addLog?.(`${sourceName}: ${playerName} выбирает ${tplName} для сброса.`);
        }
        return;
      } catch (err) {
        window.console?.error?.('[discard] Не удалось отправить выбор сброса', err);
        managerState.waitingServer = false;
        scheduleCountdown();
        prepareSelection();
        return;
      }
    }
  }

  const cardTpl = discardHandCard(player, handIdx);
  if (!cardTpl) {
    completeRequestAndSync(req, state);
    return;
  }
  const pickedName = cardTpl?.name || formatCardName(cardTpl?.id || cardTpl?.tplId);
  if (auto) {
    window.addLog?.(`${sourceName}: ${playerName} сбрасывает ${pickedName} автоматически (таймер).`);
  } else {
    window.addLog?.(`${sourceName}: ${playerName} сбрасывает ${pickedName}.`);
  }

  const newRemaining = Math.max(0, (req.remaining || 1) - 1);
  req.remaining = newRemaining;
  if (newRemaining <= 0) {
    completeRequestAndSync(req, state);
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
  if (!req || !state || managerState.waitingServer) return;
  const player = state.players?.[req.target];
  const hand = Array.isArray(player?.hand) ? player.hand : [];
  if (!hand.length) {
    completeRequestAndSync(req, state);
    return;
  }
  const idx = Math.floor(Math.random() * hand.length);
  handleDiscard(idx, { auto: true });
}

function prepareSelection() {
  const req = managerState.active;
  const state = window.gameState;
  if (!req || !state || managerState.waitingServer) return;
  const player = state.players?.[req.target];
  if (!player || !Array.isArray(player.hand) || player.hand.length === 0) {
    completeRequestAndSync(req, state);
    return;
  }
  interactionState.pendingDiscardSelection = {
    forced: true,
    keepAfterPick: true,
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
  managerState.waitingServer = false;
  const playerName = resolvePlayerName(state, req.target);
  const source = formatSource(req);
  managerState.titleEl.textContent = `${source}: требуется сброс`;
  managerState.subEl.textContent = `${playerName}: сбросьте ${formatRemaining(req.remaining)}.`;
  pauseTurnTimer();
  showOverlay();
  prepareSelection();
  scheduleCountdown();
  notifyInputLockChanged();
}

function cancelIfStale(state, queueOverride = null) {
  const req = managerState.active;
  if (!req) return;
  const queue = queueOverride || (Array.isArray(state?.pendingDiscards) ? state.pendingDiscards : []);
  const match = queue.find(item => item && item.id === req.id);
  if (!match || match.remaining <= 0) {
    handleRequestResolved(req, state);
    finishRequest();
    return;
  }
  if (managerState.waitingServer && match.remaining === req.remaining) {
    managerState.waitingServer = false;
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
    resumeTurnTimerIfIdle(state);
    finishRequest();
    setActiveSeatBlock(false);
    return;
  }
  const queue = Array.isArray(state.pendingDiscards) ? state.pendingDiscards : [];
  computeActiveSeatBlock(state, queue);
  const hasPending = queue.some(item => item && item.remaining > 0);
  if (hasPending) {
    pauseTurnTimer();
  } else {
    resumeTurnTimerIfIdle(state);
  }
  if (managerState.active) {
    cancelIfStale(state, queue);
  }
  const current = managerState.active;
  if (current) {
    const match = queue.find(item => item && item.id === current.id);
    if (match && match.remaining !== current.remaining) {
      current.remaining = match.remaining;
      managerState.subEl.textContent = `${resolvePlayerName(state, match.target)}: сбросьте ${formatRemaining(match.remaining)}.`;
      scheduleCountdown();
      prepareSelection();
      managerState.waitingServer = false;
    }
    if (match && (!interactionState.pendingDiscardSelection || interactionState.pendingDiscardSelection.requestId !== match.id)) {
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

export function hasActiveLocalRequest() {
  if (!managerState.active) return false;
  const seats = getLocalSeats();
  return seats.includes(managerState.active.target);
}

export function isActiveSeatBlocked() {
  return !!managerState.activeSeatBlocked;
}

export function getActiveSeatBlockMessage() {
  return managerState.activeSeatBlocked ? managerState.activeSeatMessage : '';
}

const api = {
  initDiscardManager,
  syncWithState,
  hasActiveLocalRequest,
  isActiveSeatBlocked,
  getActiveSeatBlockMessage,
};

try {
  if (typeof window !== 'undefined') {
    window.__ui = window.__ui || {};
    window.__ui.discardManager = api;
  }
} catch {}

export default api;

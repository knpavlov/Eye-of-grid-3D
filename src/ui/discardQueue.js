// UI-обработчик очереди принудительных сбросов (таймер + выбор карты)
import { interactionState } from '../scene/interactions.js';
import { discardHandCard } from '../scene/discard.js';

const queueState = {
  active: null,
  timerId: null,
  intervalId: null,
};

function getLocalSeat() {
  if (typeof window === 'undefined') return null;
  if (typeof window.MY_SEAT === 'number') return window.MY_SEAT;
  return null;
}

function findQueue(state) {
  return Array.isArray(state?.pendingDiscardRequests) ? state.pendingDiscardRequests : [];
}

function removeRequest(state, id) {
  const queue = findQueue(state);
  const idx = queue.findIndex(req => req && req.id === id);
  if (idx >= 0) {
    queue.splice(idx, 1);
  }
}

function stopCountdown() {
  if (queueState.timerId) { clearTimeout(queueState.timerId); queueState.timerId = null; }
  if (queueState.intervalId) { clearInterval(queueState.intervalId); queueState.intervalId = null; }
}

function hidePrompt() {
  try { window.__ui?.panels?.hidePrompt?.(); } catch {}
}

function clearSelection() {
  if (interactionState.pendingDiscardSelection) {
    interactionState.pendingDiscardSelection = null;
  }
}

function resetActive() {
  stopCountdown();
  hidePrompt();
  clearSelection();
  queueState.active = null;
  try { window.__ui?.cancelButton?.refreshCancelButton?.(); } catch {}
}

function formatCardWord(amount) {
  const n = Math.abs(amount);
  if (n === 1) return '1 карту';
  if (n >= 2 && n <= 4) return `${n} карты`;
  return `${n} карт`;
}

function updatePromptText(entry) {
  if (typeof document === 'undefined') return;
  const el = document.getElementById('prompt-text');
  if (!el) return;
  const source = entry?.request?.source?.name || 'Способность';
  const remain = Math.max(0, entry?.remaining ?? 0);
  const now = Date.now();
  const ms = Math.max(0, (entry.deadline ?? now) - now);
  const sec = Math.ceil(ms / 1000);
  el.textContent = `${source}: выберите ${formatCardWord(remain)} для сброса. Осталось ${sec} с.`;
}

function scheduleCountdown(entry, state) {
  stopCountdown();
  const tick = () => updatePromptText(entry);
  queueState.intervalId = setInterval(tick, 200);
  const autoDiscard = () => {
    queueState.timerId = null;
    queueState.intervalId && clearInterval(queueState.intervalId);
    queueState.intervalId = null;
    performAutoDiscard(entry, state);
  };
  queueState.timerId = setTimeout(autoDiscard, Math.max(0, (entry.deadline ?? Date.now()) - Date.now()));
}

function ensurePrompt(entry, state) {
  try {
    const source = entry?.request?.source?.name || 'Способность';
    window.__ui?.panels?.showPrompt?.(
      `${source}: выберите ${formatCardWord(entry.remaining)} для сброса. Осталось 20 с.`,
      null,
      false,
    );
  } catch {}
  updatePromptText(entry);
  scheduleCountdown(entry, state);
}

function ensureSelection(entry, state) {
  const player = state?.players?.[entry.playerIndex];
  if (!player || !Array.isArray(player.hand)) {
    finalizeRequest(entry, state);
    return;
  }
  if (!player.hand.length || entry.remaining <= 0) {
    finalizeRequest(entry, state);
    return;
  }
  entry.deadline = Date.now() + 20000;
  ensurePrompt(entry, state);
  interactionState.pendingDiscardSelection = {
    forced: true,
    onPicked: (handIdx) => {
      try { handleManualChoice(entry, state, handIdx); } catch {}
    },
  };
  try { window.__ui?.cancelButton?.refreshCancelButton?.(); } catch {}
}

function pushStateUpdate() {
  try { window.schedulePush?.('forced-discard', { force: true }); } catch {}
}

function finalizeRequest(entry, state) {
  if (!entry) return;
  removeRequest(state, entry.request?.id);
  resetActive();
  pushStateUpdate();
  try { window.updateHand?.(state); window.updateUI?.(state); } catch {}
  setTimeout(() => {
    try { window.updateUI?.(state); } catch {}
  }, 100);
}

function performAutoDiscard(entry, state) {
  const player = state?.players?.[entry.playerIndex];
  if (!player || !Array.isArray(player.hand) || !player.hand.length) {
    finalizeRequest(entry, state);
    return;
  }
  const idx = Math.floor(Math.random() * player.hand.length);
  try { window.addLog?.('Время ожидания истекло: сбрасывается случайная карта.'); } catch {}
  applyDiscard(entry, state, idx);
}

function applyDiscard(entry, state, handIdx) {
  const player = state?.players?.[entry.playerIndex];
  if (!player || typeof handIdx !== 'number' || handIdx < 0 || handIdx >= (player.hand?.length || 0)) {
    ensureSelection(entry, state);
    return;
  }
  const tpl = discardHandCard(player, handIdx);
  if (!tpl) {
    ensureSelection(entry, state);
    return;
  }
  entry.remaining = Math.max(0, (entry.remaining || 0) - 1);
  clearSelection();
  try { window.updateHand?.(state); } catch {}
  pushStateUpdate();
  if (entry.remaining <= 0 || !(player.hand?.length)) {
    finalizeRequest(entry, state);
  } else {
    ensureSelection(entry, state);
  }
}

function handleManualChoice(entry, state, handIdx) {
  applyDiscard(entry, state, handIdx);
}

export function processDiscardQueue(state) {
  if (typeof window === 'undefined') return;
  const queue = findQueue(state);
  if (!queue.length) {
    if (queueState.active) {
      resetActive();
    }
    return;
  }
  if (queueState.active) {
    const exists = queue.some(req => req && req.id === queueState.active.request?.id);
    if (!exists) {
      resetActive();
    } else {
      return;
    }
  }
  const mySeat = getLocalSeat();
  let request = null;
  for (const entry of queue) {
    if (!entry) continue;
    if (mySeat == null || entry.target === mySeat) {
      request = entry;
      break;
    }
  }
  if (!request) return;
  const player = state?.players?.[request.target];
  const remaining = Math.max(0, Math.floor(request.amount || 0));
  if (remaining <= 0 || !player) {
    removeRequest(state, request.id);
    pushStateUpdate();
    return;
  }
  queueState.active = {
    request,
    playerIndex: request.target,
    remaining: remaining,
    deadline: Date.now() + 20000,
  };
  ensureSelection(queueState.active, state);
}

const api = { processDiscardQueue };
try { if (typeof window !== 'undefined') { window.__ui = window.__ui || {}; window.__ui.discardQueue = api; } } catch {}
export default api;

// Управление принудительными сбросами карт (дискардами)
// Модуль отвечает за отображение промптов и обработку таймеров

import { interactionState } from '../scene/interactions.js';
import { discardHandCard } from '../scene/discard.js';

const LOCAL_STATE = {
  currentEventId: null,
  timerId: null,
  deadline: null,
  baseText: null,
};

function clearTimer() {
  if (LOCAL_STATE.timerId) {
    clearInterval(LOCAL_STATE.timerId);
    LOCAL_STATE.timerId = null;
  }
  LOCAL_STATE.deadline = null;
}

function resetInteractionState() {
  if (interactionState.pendingDiscardSelection) {
    interactionState.pendingDiscardSelection = null;
  }
}

function hidePrompt() {
  clearTimer();
  resetInteractionState();
  LOCAL_STATE.currentEventId = null;
  LOCAL_STATE.baseText = null;
  try { window.__ui?.panels?.hidePrompt?.(); } catch {}
}

function formatPrompt(event, remaining, seconds) {
  const name = event?.source?.name || 'Существо';
  const total = event?.amount ?? remaining;
  const base = `${name}: выберите карту для сброса (${remaining}/${total})`;
  const secText = seconds != null ? ` — ${seconds}с` : '';
  return `${base}${secText}`;
}

function updatePromptCountdown(event) {
  if (!event) return;
  const now = Date.now();
  const msLeft = Math.max(0, (LOCAL_STATE.deadline ?? now) - now);
  const seconds = Math.ceil(msLeft / 1000);
  const targetState = window.gameState;
  const events = Array.isArray(targetState?.pendingForcedDiscards) ? targetState.pendingForcedDiscards : [];
  const active = events.find(ev => ev.id === event.id);
  const remaining = active?.remaining ?? 0;
  const text = formatPrompt(event, Math.max(0, remaining), seconds);
  try {
    const el = document.getElementById('prompt-text');
    if (el) el.textContent = text;
  } catch {}
  if (msLeft <= 0) {
    clearTimer();
    triggerAutoDiscard(event);
  }
}

function triggerAutoDiscard(event) {
  const state = window.gameState;
  if (!state) return;
  const player = state.players?.[event.target];
  const hand = Array.isArray(player?.hand) ? player.hand : [];
  if (hand.length <= 0) {
    finalizeDiscard(event, null, { auto: true });
    return;
  }
  const idx = Math.floor(Math.random() * hand.length);
  finalizeDiscard(event, idx, { auto: true });
}

function removeEventFromState(eventId) {
  const state = window.gameState;
  if (!state || !Array.isArray(state.pendingForcedDiscards)) return null;
  const idx = state.pendingForcedDiscards.findIndex(ev => ev?.id === eventId);
  if (idx >= 0) {
    return state.pendingForcedDiscards.splice(idx, 1)[0] || null;
  }
  return null;
}

function finalizeDiscard(event, handIdx, { auto = false } = {}) {
  const state = window.gameState;
  if (!state) return;
  const player = state.players?.[event.target];
  if (!player) {
    hidePrompt();
    return;
  }
  if (handIdx != null && handIdx >= 0) {
    const discarded = discardHandCard(player, handIdx);
    if (discarded?.name) {
      const reason = auto ? 'автоматически' : 'по выбору';
      try { window.__ui?.log?.add?.(`${discarded.name} сброшена ${reason}.`); } catch {}
    }
  }
  const activeEvent = state.pendingForcedDiscards.find(ev => ev.id === event.id);
  if (activeEvent) {
    activeEvent.remaining = Math.max(0, (activeEvent.remaining || 0) - 1);
    if (activeEvent.remaining > 0) {
      try { window.schedulePush?.('forced-discard', { force: true }); } catch {}
      syncPendingDiscards(state);
      return;
    }
  }
  removeEventFromState(event.id);
  hidePrompt();
  try { window.schedulePush?.('forced-discard', { force: true }); } catch {}
  syncPendingDiscards(state);
}

function beginEvent(event, state) {
  if (!event || !state) return;
  LOCAL_STATE.currentEventId = event.id;
  const player = state.players?.[event.target];
  const hand = Array.isArray(player?.hand) ? player.hand : [];
  const remaining = Math.max(0, event.remaining ?? event.amount ?? 0);
  if (remaining <= 0 || hand.length <= 0) {
    removeEventFromState(event.id);
    syncPendingDiscards(state);
    return;
  }
  LOCAL_STATE.deadline = Date.now() + (event.timeoutMs ?? 20000);
  const promptText = formatPrompt(event, remaining, Math.ceil((event.timeoutMs ?? 20000) / 1000));
  LOCAL_STATE.baseText = promptText;
  try { window.__ui?.panels?.showPrompt?.(promptText, null, false); } catch {}
  interactionState.pendingDiscardSelection = {
    forced: true,
    targetPlayer: event.target,
    onPicked: (handIdx) => {
      resetInteractionState();
      clearTimer();
      finalizeDiscard(event, handIdx, { auto: false });
    },
  };
  clearTimer();
  LOCAL_STATE.timerId = setInterval(() => updatePromptCountdown(event), 250);
  updatePromptCountdown(event);
}

function shouldHandleEvent(event) {
  if (!event) return false;
  const online = typeof window.NET_ON === 'function' ? window.NET_ON() : !!window.NET_ACTIVE;
  const mySeat = (typeof window.MY_SEAT === 'number') ? window.MY_SEAT : null;
  if (!online) return true;
  if (mySeat == null) return false;
  return mySeat === event.target;
}

export function syncPendingDiscards(gameState) {
  if (typeof window === 'undefined') return;
  const state = gameState || window.gameState;
  if (!state) { hidePrompt(); return; }
  const events = Array.isArray(state.pendingForcedDiscards) ? state.pendingForcedDiscards : [];
  if (!events.length) { hidePrompt(); return; }
  const current = events[0];
  if (!shouldHandleEvent(current)) {
    hidePrompt();
    return;
  }
  if (LOCAL_STATE.currentEventId === current.id) {
    return;
  }
  hidePrompt();
  beginEvent(current, state);
}

const api = { syncPendingDiscards };
try {
  if (typeof window !== 'undefined') {
    window.__ui = window.__ui || {};
    window.__ui.forcedDiscard = api;
  }
} catch {}

export default api;

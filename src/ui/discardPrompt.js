// Управление всплывающими запросами на сброс карт (UI часть)
import { interactionState } from '../scene/interactions.js';
import { discardHandCard } from '../scene/discard.js';
import {
  applyDiscardSelection,
  resolveDiscardRequestEmpty,
  getPendingDiscardById,
  DISCARD_TIMER_MS,
} from '../core/abilityHandlers/discard.js';

const SOURCE_TAG = 'DISCARD_ABILITY';

let active = null;

function clearTimers() {
  if (active?.timeoutId) clearTimeout(active.timeoutId);
  if (active?.intervalId) clearInterval(active.intervalId);
  active = null;
}

function setPromptText(baseText, deadline) {
  try {
    const doc = typeof document !== 'undefined' ? document : null;
    if (!doc) return;
    const el = doc.getElementById('prompt-text');
    if (!el) return;
    const now = Date.now();
    const secs = Math.max(0, Math.ceil((deadline - now) / 1000));
    el.textContent = `${baseText} Осталось: ${secs} с.`;
  } catch {}
}

function hidePromptIfOwned() {
  try {
    if (interactionState.pendingDiscardSelection?.source === SOURCE_TAG) {
      interactionState.pendingDiscardSelection = null;
    }
    window.__ui?.panels?.hidePrompt?.();
  } catch {}
}

function cleanupPrompt() {
  clearTimers();
  hidePromptIfOwned();
}

function describeSource(state, request) {
  try {
    const tplId = request?.source?.tplId;
    if (!tplId) return 'эффекта';
    const cardsDb = state?.cards || (typeof window !== 'undefined' ? window.CARDS : null);
    const tpl = cardsDb ? cardsDb[tplId] : (typeof window !== 'undefined' ? window.CARDS?.[tplId] : null);
    return tpl?.name ? `эффекта ${tpl.name}` : 'эффекта';
  } catch {
    return 'эффекта';
  }
}

function ensurePromptVisible(baseText, deadline) {
  try {
    window.__ui?.panels?.showPrompt?.(baseText, null, false);
  } catch {}
  setPromptText(baseText, deadline);
}

function handleDiscardChoice(state, request, handIdx, auto = false) {
  const player = state?.players?.[request.target];
  if (!player) { cleanupPrompt(); return; }
  const hand = Array.isArray(player.hand) ? player.hand : [];
  if (handIdx < 0 || handIdx >= hand.length) { return; }
  const cardTpl = hand[handIdx];
  discardHandCard(player, handIdx);
  applyDiscardSelection(state, request.id, { now: Date.now() });

  try {
    const sourceLabel = describeSource(state, request);
    const cardName = cardTpl?.name || cardTpl?.id || 'Карта';
    const playerName = player?.name || `Player ${request.target + 1}`;
    const prefix = auto ? 'Время истекло' : 'Сброс';
    window.addLog?.(`${prefix}: ${playerName} сбрасывает ${cardName} из-за ${sourceLabel}.`);
  } catch {}

  try { window.schedulePush?.('discard-select', { force: true }); } catch {}
  cleanupPrompt();
  syncRequests(state);
}

function handleAutoDiscard(state, request) {
  const player = state?.players?.[request.target];
  const hand = Array.isArray(player?.hand) ? player.hand : [];
  if (!player || !hand.length) {
    resolveDiscardRequestEmpty(state, request.id);
    try { window.schedulePush?.('discard-empty', { force: true }); } catch {}
    cleanupPrompt();
    syncRequests(state);
    return;
  }
  const idx = Math.max(0, Math.min(hand.length - 1, Math.floor(Math.random() * hand.length)));
  handleDiscardChoice(state, request, idx, true);
}

function updateCountdown() {
  if (!active) return;
  const state = typeof window !== 'undefined' ? window.gameState : null;
  if (!state) return;
  const request = getPendingDiscardById(state, active.id);
  if (!request) { cleanupPrompt(); return; }
  setPromptText(active.baseText, request.deadline || (Date.now() + DISCARD_TIMER_MS));
}

function startPrompt(state, request) {
  const player = state?.players?.[request.target];
  const handCount = Array.isArray(player?.hand) ? player.hand.length : 0;
  if (handCount <= 0) {
    resolveDiscardRequestEmpty(state, request.id);
    try { window.schedulePush?.('discard-empty', { force: true }); } catch {}
    cleanupPrompt();
    syncRequests(state);
    return;
  }

  clearTimers();

  const resolved = (request.total || request.remaining || 0) - (request.remaining || 0);
  const step = Math.max(1, resolved + 1);
  const total = request.total || (request.remaining || 1);
  const playerName = player?.name || `Player ${request.target + 1}`;
  const sourceLabel = describeSource(state, request);
  const baseText = `Сбросьте карту (${step}/${total}). ${playerName}, эффект: ${sourceLabel}.`;

  ensurePromptVisible(baseText, request.deadline || (Date.now() + DISCARD_TIMER_MS));

  interactionState.pendingDiscardSelection = {
    forced: true,
    source: SOURCE_TAG,
    onPicked: (handIdx) => handleDiscardChoice(state, request, handIdx, false),
  };

  active = {
    id: request.id,
    baseText,
    timeoutId: setTimeout(() => handleAutoDiscard(state, request), Math.max(0, (request.deadline || (Date.now() + DISCARD_TIMER_MS)) - Date.now())),
    intervalId: setInterval(updateCountdown, 200),
  };
}

export function syncRequests(state) {
  try {
    const gameState = state || (typeof window !== 'undefined' ? window.gameState : null);
    if (!gameState) { cleanupPrompt(); return; }
    const mySeat = (typeof window !== 'undefined' && typeof window.MY_SEAT === 'number') ? window.MY_SEAT : 0;
    const list = (Array.isArray(gameState.pendingDiscards) ? gameState.pendingDiscards : [])
      .filter(req => req && req.target === mySeat && (req.remaining ?? 0) > 0)
      .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
    if (!list.length) { cleanupPrompt(); return; }
    const current = list[0];
    if (active && active.id === current.id) {
      setPromptText(active.baseText, current.deadline || (Date.now() + DISCARD_TIMER_MS));
      return;
    }
    startPrompt(gameState, current);
  } catch (err) {
    console.error('[discardPrompt] syncRequests error', err);
  }
}

const api = { syncRequests };
try {
  if (typeof window !== 'undefined') {
    window.__ui = window.__ui || {};
    window.__ui.discard = api;
  }
} catch {}

export default api;

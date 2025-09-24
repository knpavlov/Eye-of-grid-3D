// Очередь эффектов принудительного сброса карт
// Отвечает за показ таймера, ожидание выбора карты и автоматический сброс,
// если игрок не успевает сделать выбор.

import { interactionState } from '../scene/interactions.js';
import { discardHandCard } from '../scene/discard.js';

const REQUEST_QUEUE = [];
let activeRequest = null;
let countdownInterval = null;

function isLocalSeat(playerIndex) {
  try {
    if (typeof window === 'undefined') return true;
    if (typeof window.NET_ON === 'function' && window.NET_ON()) {
      const seat = (typeof window.MY_SEAT === 'number') ? window.MY_SEAT : null;
      return seat === playerIndex;
    }
  } catch {}
  return true;
}

function stopCountdown() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
}

function playerLabel(idx) {
  if (typeof idx !== 'number') return 'игрок ?';
  return `игрок ${idx + 1}`;
}

function formatBaseText(request, remaining) {
  const sourceName = request?.source?.name || 'Эффект';
  return `${sourceName}: сбросьте карту (${remaining} ост.)`;
}

function updatePromptText(text) {
  try {
    if (typeof document === 'undefined') return;
    const label = document.getElementById('prompt-text');
    if (label) label.textContent = text;
  } catch {}
}

function showPrompt(base, secondsLeft) {
  try {
    if (typeof window === 'undefined') return;
    const text = `${base} Осталось ${secondsLeft} с.`;
    window.__ui?.panels?.showPrompt?.(text, null, false);
    updatePromptText(text);
    window.__ui?.cancelButton?.refreshCancelButton?.();
  } catch {}
}

function handleDiscardCompletion(autoPick, cardTpl) {
  try {
    if (typeof window === 'undefined' || !activeRequest) return;
    const request = activeRequest.request;
    const playerIdx = request.player;
    const label = playerLabel(playerIdx);
    const sourceName = request.source?.name || 'Эффект';
    if (cardTpl) {
      const actionText = autoPick
        ? `${sourceName}: ${label} не успевает выбрать карту — сбрасывается ${cardTpl.name}.`
        : `${sourceName}: ${label} сбрасывает ${cardTpl.name}.`;
      window.addLog?.(actionText);
    } else {
      window.addLog?.(`${sourceName}: ${label} не сбрасывает карту.`);
    }
  } catch {}
}

function finishActiveRequest() {
  stopCountdown();
  try {
    if (typeof window !== 'undefined') {
      window.__ui?.panels?.hidePrompt?.();
      window.__ui?.cancelButton?.refreshCancelButton?.();
    }
  } catch {}
  interactionState.pendingDiscardSelection = null;
  activeRequest = null;
  processQueue();
}

function scheduleNextStep() {
  if (!activeRequest) return;
  try {
    const w = window;
    const state = w.gameState;
    const request = activeRequest.request;
    const player = state?.players?.[request.player];
    const hand = Array.isArray(player?.hand) ? player.hand : [];
    if (!player || hand.length === 0) {
      handleDiscardCompletion(false, null);
      finishActiveRequest();
      return;
    }
    const remaining = Math.min(activeRequest.remaining, hand.length);
    activeRequest.remaining = remaining;
    const timer = Math.max(1, Math.floor(request.timer || 20));
    const baseText = formatBaseText(request, remaining);
    activeRequest.baseText = baseText;
    let secondsLeft = timer;
    showPrompt(baseText, secondsLeft);
    stopCountdown();
    countdownInterval = setInterval(() => {
      secondsLeft -= 1;
      if (secondsLeft <= 0) {
        stopCountdown();
        performAutoDiscard();
      } else {
        updatePromptText(`${baseText} Осталось ${secondsLeft} с.`);
      }
    }, 1000);
    interactionState.pendingDiscardSelection = {
      forced: true,
      filter: (_, idx) => idx >= 0 && idx < hand.length,
      invalidMessage: 'Эта карта недоступна для сброса.',
      onPicked: (handIdx) => {
        stopCountdown();
        applyDiscard(handIdx, { auto: false });
      },
    };
  } catch (err) {
    console.error('[discardQueue] ошибка scheduleNextStep', err);
    finishActiveRequest();
  }
}

function applyDiscard(handIdx, { auto }) {
  try {
    if (typeof window === 'undefined' || !activeRequest) return;
    const state = window.gameState;
    const request = activeRequest.request;
    const player = state?.players?.[request.player];
    if (!player) {
      finishActiveRequest();
      return;
    }
    const cardTpl = discardHandCard(player, handIdx);
    if (!cardTpl) {
      finishActiveRequest();
      return;
    }
    handleDiscardCompletion(auto, cardTpl);
    try {
      window.schedulePush?.('ability-discard', { force: true });
    } catch {}
    try {
      window.updateHand?.(state);
      window.updateUI?.(state);
    } catch {}
    activeRequest.remaining -= 1;
    interactionState.pendingDiscardSelection = null;
    if (activeRequest.remaining > 0 && (player.hand?.length || 0) > 0) {
      setTimeout(() => scheduleNextStep(), 120);
    } else {
      finishActiveRequest();
    }
  } catch (err) {
    console.error('[discardQueue] ошибка applyDiscard', err);
    finishActiveRequest();
  }
}

function performAutoDiscard() {
  try {
    if (typeof window === 'undefined' || !activeRequest) return;
    const state = window.gameState;
    const request = activeRequest.request;
    const player = state?.players?.[request.player];
    const hand = Array.isArray(player?.hand) ? player.hand : [];
    if (!player || hand.length === 0) {
      handleDiscardCompletion(true, null);
      finishActiveRequest();
      return;
    }
    const randomIdx = Math.floor(Math.random() * hand.length);
    applyDiscard(randomIdx, { auto: true });
  } catch (err) {
    console.error('[discardQueue] ошибка performAutoDiscard', err);
    finishActiveRequest();
  }
}

function processQueue() {
  if (activeRequest) return;
  try {
    if (typeof window === 'undefined') return;
    const state = window.gameState;
    while (REQUEST_QUEUE.length) {
      const request = REQUEST_QUEUE.shift();
      if (!request || typeof request.player !== 'number' || typeof request.amount !== 'number') {
        continue;
      }
      if (!isLocalSeat(request.player)) {
        continue;
      }
      const player = state?.players?.[request.player];
      const hand = Array.isArray(player?.hand) ? player.hand : [];
      if (!player || hand.length === 0) {
        const sourceName = request.source?.name || 'Эффект';
        window.addLog?.(`${sourceName}: ${playerLabel(request.player)} не имеет карт для сброса.`);
        continue;
      }
      const amount = Math.min(Math.max(1, Math.floor(request.amount)), hand.length);
      if (amount <= 0) {
        continue;
      }
      activeRequest = {
        request,
        remaining: amount,
        baseText: '',
      };
      scheduleNextStep();
      return;
    }
  } catch (err) {
    console.error('[discardQueue] ошибка processQueue', err);
  }
}

export function enqueueDiscardRequests(requests = []) {
  const list = Array.isArray(requests) ? requests : [requests];
  for (const req of list) {
    if (!req || typeof req.player !== 'number' || typeof req.amount !== 'number') continue;
    REQUEST_QUEUE.push({ ...req });
  }
  processQueue();
}

export function clearDiscardQueue() {
  REQUEST_QUEUE.length = 0;
  activeRequest = null;
  stopCountdown();
  interactionState.pendingDiscardSelection = null;
  try {
    if (typeof window !== 'undefined') {
      window.__ui?.panels?.hidePrompt?.();
      window.__ui?.cancelButton?.refreshCancelButton?.();
    }
  } catch {}
}

const api = { enqueueDiscardRequests, clearDiscardQueue };
try {
  if (typeof window !== 'undefined') {
    window.__ui = window.__ui || {};
    window.__ui.discardQueue = api;
  }
} catch {}

export default api;

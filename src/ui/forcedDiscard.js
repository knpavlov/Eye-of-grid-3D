// Очередь на принудительный сброс карт по требованиям способностей
import { interactionState } from '../scene/interactions.js';
import { discardHandCard } from '../scene/discard.js';

const requestQueue = [];
let processing = false;

function getWindow() {
  if (typeof window === 'undefined') return null;
  return window;
}

function isOnline(w) {
  if (!w) return false;
  try {
    if (typeof w.NET_ON === 'function') return !!w.NET_ON();
    return !!w.NET_ACTIVE;
  } catch {
    return false;
  }
}

function mySeat(w) {
  if (!w) return null;
  try {
    return typeof w.MY_SEAT === 'number' ? w.MY_SEAT : null;
  } catch {
    return null;
  }
}

function shouldProcessRequest(request) {
  const w = getWindow();
  if (!w) return false;
  const seat = mySeat(w);
  if (!isOnline(w) || seat == null) {
    return true;
  }
  return seat === request.targetPlayer;
}

function formatSourcesLabel(sources, fallback) {
  if (!Array.isArray(sources) || !sources.length) return fallback || 'Способность';
  const counter = new Map();
  for (const entry of sources) {
    const name = entry?.name || entry?.tplId || fallback || 'Способность';
    counter.set(name, (counter.get(name) || 0) + 1);
  }
  const parts = [];
  for (const [name, count] of counter.entries()) {
    if (count > 1) parts.push(`${name} (x${count})`);
    else parts.push(name);
  }
  return parts.join(', ');
}

function showPrompt(label, remaining, total, seconds) {
  const w = getWindow();
  if (!w) return;
  const text = `${label}: выберите карту для сброса. Осталось ${remaining} из ${total}. Таймер: ${seconds} с.`;
  try { w.__ui?.panels?.showPrompt?.(text, null, false); } catch {}
}

function hidePrompt() {
  const w = getWindow();
  if (!w) return;
  try { w.__ui?.panels?.hidePrompt?.(); } catch {}
}

function scheduleSync() {
  const w = getWindow();
  if (!w) return;
  try { w.schedulePush?.('forced-discard', { force: true }); } catch {}
}

function updateUiState() {
  const w = getWindow();
  if (!w) return;
  try { w.updateHand?.(w.gameState); } catch {}
  try { w.updateUI?.(w.gameState); } catch {}
}

function logMessage(text) {
  const w = getWindow();
  if (!w) return;
  try { w.addLog?.(text); } catch {}
}

async function handleSingleDiscard(request, total, label) {
  const w = getWindow();
  if (!w) return false;
  const player = w.gameState?.players?.[request.targetPlayer];
  if (!player || !Array.isArray(player.hand) || player.hand.length === 0) {
    logMessage(`${label}: у игрока ${request.targetPlayer + 1} нет карт для сброса.`);
    return true;
  }
  const timerDuration = Math.max(1, Math.floor(request.timerSeconds ?? 20));
  let resolveFn;
  const promise = new Promise((resolve) => { resolveFn = resolve; });
  let secondsLeft = timerDuration;
  showPrompt(label, request.remaining, total, secondsLeft);

  const tick = setInterval(() => {
    secondsLeft -= 1;
    if (secondsLeft > 0) {
      showPrompt(label, request.remaining, total, secondsLeft);
    }
  }, 1000);

  const finish = (handIdx, auto) => {
    if (handIdx == null || handIdx < 0 || handIdx >= player.hand.length) {
      clearInterval(tick);
      hidePrompt();
      resolveFn(false);
      return;
    }
    const cardTpl = discardHandCard(player, handIdx);
    hidePrompt();
    clearInterval(tick);
    interactionState.pendingDiscardSelection = null;
    updateUiState();
    scheduleSync();
    const cardName = cardTpl?.name || cardTpl?.id || 'карта';
    if (auto) {
      logMessage(`${label}: время истекло, игрок ${request.targetPlayer + 1} сбрасывает случайную карту (${cardName}).`);
    } else {
      logMessage(`${label}: игрок ${request.targetPlayer + 1} сбрасывает ${cardName}.`);
    }
    resolveFn(true);
  };

  const timeout = setTimeout(() => {
    const index = player.hand.length ? Math.floor(Math.random() * player.hand.length) : -1;
    finish(index, true);
  }, timerDuration * 1000);

  interactionState.pendingDiscardSelection = {
    forced: true,
    onPicked: (handIdx) => {
      clearTimeout(timeout);
      finish(handIdx, false);
    },
  };

  showPrompt(label, request.remaining, total, secondsLeft);
  const result = await promise;
  clearTimeout(timeout);
  interactionState.pendingDiscardSelection = null;
  return result;
}

async function processRequest(request) {
  const w = getWindow();
  if (!w) return;
  const player = w.gameState?.players?.[request.targetPlayer];
  if (!player || !Array.isArray(player.hand) || player.hand.length === 0) {
    if (request.amount > 0) {
      const label = formatSourcesLabel(request.sources, request.label);
      logMessage(`${label}: у игрока ${request.targetPlayer + 1} нет карт для сброса.`);
    }
    return;
  }
  const label = formatSourcesLabel(request.sources, request.label);
  const maxDiscard = Math.min(request.amount, player.hand.length);
  for (let i = 0; i < maxDiscard; i += 1) {
    request.remaining = maxDiscard - i;
    const done = await handleSingleDiscard(request, maxDiscard, label);
    if (!done) break;
    if (!player.hand.length) break;
  }
  hidePrompt();
  interactionState.pendingDiscardSelection = null;
}

async function processQueue() {
  if (processing) return;
  processing = true;
  while (requestQueue.length) {
    const next = requestQueue.shift();
    try {
      await processRequest(next);
    } catch (err) {
      console.error('[forcedDiscard] обработка прервана', err);
    }
  }
  hidePrompt();
  interactionState.pendingDiscardSelection = null;
  processing = false;
}

export function enqueueForcedDiscardRequests(requests) {
  const list = Array.isArray(requests) ? requests.filter(Boolean) : [requests].filter(Boolean);
  if (!list.length) return;
  for (const req of list) {
    if (typeof req?.targetPlayer !== 'number' || req.amount == null) continue;
    if (!shouldProcessRequest(req)) continue;
    const normalized = {
      targetPlayer: req.targetPlayer,
      amount: Math.max(0, Math.floor(req.amount)),
      label: req.label,
      sources: Array.isArray(req.sources) ? req.sources : [],
      timerSeconds: req.timerSeconds,
      remaining: 0,
    };
    if (normalized.amount <= 0) continue;
    requestQueue.push(normalized);
  }
  processQueue().catch(err => console.error('[forcedDiscard] queue error', err));
}

const api = { enqueueForcedDiscardRequests };
api.enqueue = enqueueForcedDiscardRequests;
try {
  const w = getWindow();
  if (w) {
    w.__ui = w.__ui || {};
    w.__ui.forcedDiscard = api;
  }
} catch {}

export default api;

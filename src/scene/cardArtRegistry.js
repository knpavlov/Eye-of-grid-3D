// Реестр подписок на иллюстрации карт: централизуем оповещение, чтобы
// синхронно обновлять все меши и предзагружать арты независимо от владельца.
import {
  ensureCardIllustration,
  isCardIllustrationReady,
  getIllustrationLookupKeys,
} from './cards.js';

// Храним подписки по ключу иллюстрации
const ART_WATCHERS = new Map();

function pickPrimaryKey(cardData) {
  const keys = getIllustrationLookupKeys(cardData);
  return Array.isArray(keys) && keys.length ? keys[0] : null;
}

function normalizeCardRef(cardRef) {
  if (!cardRef) return null;
  if (typeof cardRef === 'string') {
    const trimmed = cardRef.trim();
    return trimmed ? { id: trimmed } : null;
  }
  if (typeof cardRef === 'object') {
    if (cardRef.id && typeof cardRef.id === 'string') return { ...cardRef, id: cardRef.id };
    if (cardRef.cardId && typeof cardRef.cardId === 'string') {
      return { ...cardRef, id: cardRef.cardId };
    }
    if (cardRef.tplId && typeof cardRef.tplId === 'string') {
      const tplId = cardRef.tplId.trim();
      if (!tplId) return null;
      if (cardRef.id && typeof cardRef.id === 'string' && cardRef.id.trim()) {
        return { ...cardRef, tplId };
      }
      return { ...cardRef, id: tplId, tplId };
    }
  }
  return null;
}

function invokeCallbacks(callbacks, payload) {
  if (!callbacks) return;
  for (const cb of Array.from(callbacks)) {
    try { cb(payload); } catch {}
  }
}

function scheduleImmediate(fn) {
  try {
    if (typeof queueMicrotask === 'function') {
      queueMicrotask(fn);
      return;
    }
  } catch {}
  setTimeout(fn, 0);
}

export function subscribeCardIllustration(cardData, { onReady, onError } = {}) {
  if (!cardData) {
    if (typeof onError === 'function') scheduleImmediate(() => onError());
    return { ready: false, unsubscribe: () => {} };
  }
  const key = pickPrimaryKey(cardData);
  if (!key) {
    if (typeof onError === 'function') scheduleImmediate(() => onError());
    return { ready: false, unsubscribe: () => {} };
  }
  let entry = ART_WATCHERS.get(key);
  const readyNow = isCardIllustrationReady(cardData);
  if (!entry) {
    entry = {
      key,
      ready: readyNow,
      callbacks: new Set(),
      errorCallbacks: new Set(),
    };
    ART_WATCHERS.set(key, entry);
  } else if (!entry.ready && readyNow) {
    entry.ready = true;
  }

  if (typeof onReady === 'function') entry.callbacks.add(onReady);
  if (typeof onError === 'function') entry.errorCallbacks.add(onError);

  const unsubscribe = () => {
    const current = ART_WATCHERS.get(key);
    if (!current) return;
    if (typeof onReady === 'function') current.callbacks.delete(onReady);
    if (typeof onError === 'function') current.errorCallbacks.delete(onError);
    if (!current.callbacks.size && !current.errorCallbacks.size) {
      ART_WATCHERS.delete(key);
    }
  };

  if (entry.ready) {
    if (typeof onReady === 'function') scheduleImmediate(() => onReady());
  } else {
    ensureCardIllustration(cardData, {
      onLoad: () => {
        const current = ART_WATCHERS.get(key);
        if (!current) return;
        current.ready = true;
        invokeCallbacks(current.callbacks);
      },
      onError: () => {
        const current = ART_WATCHERS.get(key);
        if (!current) return;
        invokeCallbacks(current.errorCallbacks);
      },
    });
  }

  return { ready: entry.ready, unsubscribe };
}

export function markKnownCard(cardRef) {
  const normalized = normalizeCardRef(cardRef);
  if (!normalized) return;
  ensureCardIllustration(normalized);
}

export function markKnownCards(list) {
  if (!Array.isArray(list) || !list.length) return;
  for (const entry of list) {
    try { markKnownCard(entry); } catch {}
  }
}

try {
  if (typeof window !== 'undefined') {
    window.__cardArt = {
      markKnownCard,
      markKnownCards,
      subscribeCardIllustration,
    };
  }
} catch {}

// Сетевые операции с колодами — чистые функции без привязки к DOM
import { hydrateDeck, serializeDeck, setDecks, upsertDeck } from '../core/decks.js';
import { getDecksApiBase } from './config.js';

let lastError = null;

function buildUrl(path = '') {
  const base = getDecksApiBase();
  if (!path) return base;
  if (path.startsWith('http')) return path;
  const effectiveBase = base === '/'
    ? ''
    : base.endsWith('/') ? base.slice(0, -1) : base;
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${effectiveBase}${suffix}` || suffix;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Accept': 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
    ...options,
  });
  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    if (isJson) {
      try {
        const payload = await response.json();
        if (payload?.error) message = payload.error;
      } catch {}
    }
    const err = new Error(message);
    err.status = response.status;
    throw err;
  }
  if (!isJson) return {};
  try {
    return await response.json();
  } catch (err) {
    console.warn('[net/decks] Не удалось разобрать JSON ответа', err);
    return {};
  }
}

export function getLastSyncError() {
  return lastError;
}

export async function refreshDecks({ signal, persistLocal = true } = {}) {
  try {
    const data = await requestJson(buildUrl(), { method: 'GET', signal });
    const rawDecks = Array.isArray(data.decks) ? data.decks : [];
    const hydrated = rawDecks.map(hydrateDeck).filter(Boolean);
    setDecks(hydrated, { persistLocal });
    lastError = null;
    return hydrated;
  } catch (err) {
    lastError = err;
    throw err;
  }
}

export async function fetchDeckById(id, { signal, updateStore = false, persistLocal = false } = {}) {
  try {
    const data = await requestJson(buildUrl(`/${encodeURIComponent(id)}`), { method: 'GET', signal });
    const raw = data.deck || data;
    const hydrated = hydrateDeck(raw);
    if (hydrated && updateStore) {
      upsertDeck(hydrated, { persistLocal });
    }
    lastError = null;
    return hydrated;
  } catch (err) {
    lastError = err;
    throw err;
  }
}

export async function saveDeck(deck, { signal, persistLocal = true } = {}) {
  try {
    const payload = serializeDeck(deck);
    const data = await requestJson(buildUrl(), {
      method: 'POST',
      body: JSON.stringify(payload),
      signal,
    });
    const saved = hydrateDeck(data.deck || data);
    if (saved) {
      upsertDeck(saved, { persistLocal });
    }
    lastError = null;
    return saved;
  } catch (err) {
    lastError = err;
    throw err;
  }
}

export const api = { refreshDecks, fetchDeckById, saveDeck, getLastSyncError };

try {
  if (typeof window !== 'undefined') {
    window.__net = window.__net || {};
    window.__net.decks = api;
  }
} catch {}

export default api;


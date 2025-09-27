// Сетевые операции с колодами — чистые функции без привязки к DOM
import { hydrateDeck, serializeDeck, setDecks, upsertDeck, removeDeck } from '../core/decks.js';
import { getAuthToken } from '../auth/session.js';
import { getDecksApiBase } from './config.js';

let lastError = null;

function buildUrl(path = '') {
  const apiBase = getDecksApiBase();
  if (!path) return apiBase;
  if (path.startsWith('http')) return path;
  const base = apiBase.endsWith('/') ? apiBase.slice(0, -1) : apiBase;
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}

async function requestJson(url, options = {}) {
  const token = getAuthToken();
  const baseHeaders = {
      'Accept': 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  };
  const response = await fetch(url, {
    ...options,
    headers: { ...baseHeaders, ...(options.headers || {}) },
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

export async function deleteDeck(id, { signal, persistLocal = true } = {}) {
  try {
    if (!id) return false;
    await requestJson(buildUrl(`/${encodeURIComponent(id)}`), {
      method: 'DELETE',
      signal,
    });
    const removed = removeDeck(id, { persistLocal });
    lastError = null;
    return removed;
  } catch (err) {
    lastError = err;
    throw err;
  }
}

export const api = { refreshDecks, fetchDeckById, saveDeck, deleteDeck, getLastSyncError };

try {
  if (typeof window !== 'undefined') {
    window.__net = window.__net || {};
    window.__net.decks = api;
  }
} catch {}

export default api;


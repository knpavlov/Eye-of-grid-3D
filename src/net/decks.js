// Сетевой слой для работы с REST API колод. Держим его независимым от UI.
import { replaceDecksFromRemote, upsertDeckFromRemote } from '../core/decks.js';
import { prepareDeckForSave } from '../../shared/decks/validation.js';

const DEFAULT_BASE = '/decks';

function resolveBase() {
  if (typeof window !== 'undefined') {
    if (typeof window.__DECKS_API_BASE__ === 'string') return window.__DECKS_API_BASE__;
    if (window.__config?.deckApiBase) return window.__config.deckApiBase;
    if (window.__net?.deckApiBase) return window.__net.deckApiBase;
  }
  return DEFAULT_BASE;
}

function buildUrl(path = '') {
  const base = resolveBase();
  const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${suffix}`;
}

async function request(path, { method = 'GET', body, signal } = {}) {
  if (typeof fetch !== 'function') {
    throw new Error('Fetch API недоступен в текущей среде');
  }

  const headers = { 'Accept': 'application/json' };
  let payload;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = typeof body === 'string' ? body : JSON.stringify(body);
  }

  const response = await fetch(buildUrl(path), {
    method,
    headers,
    body: payload,
    signal,
    credentials: 'include',
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
  }

  if (!response.ok) {
    const error = new Error(data?.error || `Deck API error (${response.status})`);
    error.status = response.status;
    error.details = data?.details;
    error.payload = data;
    throw error;
  }

  return data ?? {};
}

export async function fetchDecks({ applyToStore = true, signal } = {}) {
  const data = await request('/', { signal });
  const decks = Array.isArray(data?.decks) ? data.decks : [];
  if (applyToStore) {
    replaceDecksFromRemote(decks, { persist: true });
  }
  return decks;
}

export async function fetchDeck(id, { applyToStore = true, signal } = {}) {
  if (!id) throw new Error('ID колоды обязателен');
  const data = await request(`/${id}`, { signal });
  const deck = data?.deck || null;
  if (deck && applyToStore) {
    upsertDeckFromRemote(deck, { persist: true });
  }
  return deck;
}

export async function saveDeckRemote(rawDeck, { applyToStore = true, signal } = {}) {
  const { valid, errors, deck } = prepareDeckForSave(rawDeck, { requireId: true });
  if (!valid) {
    const err = new Error('Валидация колоды не пройдена');
    err.validationErrors = errors;
    throw err;
  }

  const data = await request('/', {
    method: 'POST',
    body: { deck },
    signal,
  });

  const saved = data?.deck;
  if (!saved) {
    throw new Error('Сервер не вернул сохранённую колоду');
  }

  if (applyToStore) {
    upsertDeckFromRemote(saved, { persist: true });
  }
  return saved;
}

export async function syncDecksWithServer(options = {}) {
  try {
    const decks = await fetchDecks(options);
    return { decks, ok: true };
  } catch (error) {
    console.warn('[DeckAPI] Не удалось синхронизировать список колод', error);
    return { decks: null, ok: false, error };
  }
}

export default {
  fetchDecks,
  fetchDeck,
  saveDeckRemote,
  syncDecksWithServer,
};

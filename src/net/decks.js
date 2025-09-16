// Небольшой клиент для REST-эндпоинтов /decks
// Не использует DOM: может быть переиспользован в других окружениях

function resolveBaseUrl() {
  if (typeof window !== 'undefined') {
    if (window.__DECKS_API_BASE) return String(window.__DECKS_API_BASE).replace(/\/$/, '');
  }
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_DECKS_API_BASE) {
    return String(import.meta.env.VITE_DECKS_API_BASE).replace(/\/$/, '');
  }
  if (typeof process !== 'undefined' && process.env && process.env.DECKS_API_BASE) {
    return String(process.env.DECKS_API_BASE).replace(/\/$/, '');
  }
  return '';
}

const API_BASE = resolveBaseUrl();

function buildUrl(path) {
  if (!API_BASE) return path;
  if (!path.startsWith('/')) return `${API_BASE}/${path}`;
  return `${API_BASE}${path}`;
}

async function readJsonSafe(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

class DeckApiError extends Error {
  constructor(message, { status, details } = {}) {
    super(message);
    this.name = 'DeckApiError';
    this.status = status || 500;
    this.details = details || null;
  }
}

export async function fetchDecks({ signal } = {}) {
  const res = await fetch(buildUrl('/decks'), {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!res.ok) {
    const body = await readJsonSafe(res);
    throw new DeckApiError(body?.error || 'Не удалось получить список колод', { status: res.status, details: body });
  }
  const data = await res.json();
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.decks)) return data.decks;
  return [];
}

export async function fetchDeck(id, { signal } = {}) {
  const res = await fetch(buildUrl(`/decks/${encodeURIComponent(id)}`), {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await readJsonSafe(res);
    throw new DeckApiError(body?.error || 'Не удалось получить колоду', { status: res.status, details: body });
  }
  const data = await res.json();
  return data?.deck || data;
}

export async function saveDeck(deck, { signal } = {}) {
  const res = await fetch(buildUrl('/decks'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(deck),
    signal,
  });
  if (!res.ok) {
    const body = await readJsonSafe(res);
    throw new DeckApiError(body?.error || 'Не удалось сохранить колоду', { status: res.status, details: body?.details || body });
  }
  const data = await res.json();
  return data?.deck || data;
}

export { DeckApiError };

export default {
  fetchDecks,
  fetchDeck,
  saveDeck,
};

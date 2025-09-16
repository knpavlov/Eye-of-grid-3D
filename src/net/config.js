// Конфигурация сетевых эндпоинтов, отделённая от UI и визуала
// Цель — хранить знания об адресах API в одном месте и позволить
// быстро переиспользовать логику при миграции на другой движок

const DEFAULT_DECKS_BASE = '/decks';
const STORAGE_KEY = 'decksApiBase';
let cachedDecksBase = null;

function stripTrailingSlash(value) {
  if (!value || value === '/') return value;
  return value.replace(/\/+$/, '');
}

function normalizeBase(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const schemeMatch = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed);
  if (schemeMatch && !trimmed.startsWith('data:')) {
    return stripTrailingSlash(trimmed);
  }

  if (trimmed.startsWith('//')) {
    return stripTrailingSlash(`https:${trimmed}`);
  }

  if (trimmed.startsWith('/')) {
    const sanitized = stripTrailingSlash(trimmed);
    return sanitized || '/';
  }

  // Если похоже на домен — добавляем https://
  if (/^[\w.-]+(:\d+)?(\/|$)/.test(trimmed)) {
    return stripTrailingSlash(`https://${trimmed}`);
  }

  // В остальных случаях считаем строку относительным путём
  const relative = trimmed.replace(/^\/*/, '');
  const sanitized = stripTrailingSlash(`/${relative}`);
  return sanitized || '/';
}

function readQueryBase() {
  if (typeof window === 'undefined' || !window.location) return null;
  try {
    const params = new URLSearchParams(window.location.search || '');
    const raw = params.get('decksApiBase') || params.get('decksApi');
    if (!raw) return null;
    const normalized = normalizeBase(raw);
    if (normalized) {
      params.delete('decksApiBase');
      params.delete('decksApi');
      const nextSearch = params.toString();
      const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash || ''}`;
      try { window.history.replaceState({}, '', nextUrl); } catch {}
    }
    return normalized;
  } catch {
    return null;
  }
}

function readStoredBase() {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage?.getItem(STORAGE_KEY);
    return normalizeBase(stored);
  } catch {
    return null;
  }
}

function readGlobalBase() {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.__DECKS_API_BASE;
    return normalizeBase(typeof value === 'string' ? value : null);
  } catch {
    return null;
  }
}

function readMetaBase() {
  if (typeof document === 'undefined') return null;
  try {
    const meta = document.querySelector('meta[name="decks-api-base"]');
    return normalizeBase(meta?.content || null);
  } catch {
    return null;
  }
}

export function setDecksApiBase(base, { persist = true } = {}) {
  const normalized = normalizeBase(base);
  const finalBase = normalized || DEFAULT_DECKS_BASE;
  cachedDecksBase = finalBase;

  if (typeof window !== 'undefined') {
    try {
      if (persist) {
        if (normalized) {
          window.localStorage?.setItem(STORAGE_KEY, finalBase);
        } else {
          window.localStorage?.removeItem(STORAGE_KEY);
        }
      }
    } catch {}

    try { window.__DECKS_API_BASE = finalBase; } catch {}
  }

  return finalBase;
}

function detectDecksApiBase() {
  const fromQuery = readQueryBase();
  if (fromQuery) return setDecksApiBase(fromQuery, { persist: true });

  const fromGlobal = readGlobalBase();
  if (fromGlobal) return setDecksApiBase(fromGlobal, { persist: false });

  const fromStored = readStoredBase();
  if (fromStored) return setDecksApiBase(fromStored, { persist: false });

  const fromMeta = readMetaBase();
  if (fromMeta) return setDecksApiBase(fromMeta, { persist: false });

  return setDecksApiBase(DEFAULT_DECKS_BASE, { persist: false });
}

export function getDecksApiBase({ refresh = false } = {}) {
  if (!refresh && cachedDecksBase) return cachedDecksBase;
  return detectDecksApiBase();
}

export function clearDecksApiBase() {
  cachedDecksBase = DEFAULT_DECKS_BASE;
  if (typeof window !== 'undefined') {
    try { window.localStorage?.removeItem(STORAGE_KEY); } catch {}
    try { window.__DECKS_API_BASE = DEFAULT_DECKS_BASE; } catch {}
  }
  return DEFAULT_DECKS_BASE;
}

export const netConfig = {
  getDecksApiBase,
  setDecksApiBase,
  clearDecksApiBase,
};

try {
  if (typeof window !== 'undefined') {
    window.__net = window.__net || {};
    window.__net.config = {
      ...(window.__net.config || {}),
      getDecksApiBase,
      setDecksApiBase,
      clearDecksApiBase,
    };
  }
} catch {}

export default netConfig;

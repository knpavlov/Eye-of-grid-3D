// Конфигурация сетевого взаимодействия: HTTP и WebSocket адреса сервера
// Держим расчёт базовых URL изолированным, чтобы упростить перенос на другие движки
const DEFAULT_REMOTE_BASE = 'https://eog-mp-server-production.up.railway.app';
const LOCAL_DEFAULT_PORT = 3001;

function sanitizeBase(url) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  const collapsed = trimmed.replace(/\s+/g, '');
  if (!collapsed) return null;
  if (collapsed === '/' || collapsed === '//') return collapsed;
  return collapsed.replace(/\/+$/, '');
}

function isLocalHost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

function readWindowOverride(name) {
  if (typeof window === 'undefined') return null;
  try {
    const value = window[name];
    if (!value) return null;
    const normalized = sanitizeBase(String(value));
    return normalized || null;
  } catch {
    return null;
  }
}

export function getServerBase() {
  const override = readWindowOverride('__MP_SERVER_URL');
  if (override) {
    if (override.startsWith('http://') || override.startsWith('https://')) {
      return override;
    }
    // Поддерживаем краткую запись вроде //host:port
    if (override.startsWith('//')) {
      return `https:${override}`;
    }
    if (override.startsWith('/')) {
      return override;
    }
  }

  if (typeof window !== 'undefined') {
    try {
      const { protocol, hostname } = window.location || {};
      if (hostname && isLocalHost(hostname)) {
        const portOverride = Number(readWindowOverride('__MP_SERVER_PORT'));
        const port = Number.isFinite(portOverride) && portOverride > 0
          ? portOverride
          : LOCAL_DEFAULT_PORT;
        const scheme = protocol === 'https:' ? 'https' : 'http';
        return `${scheme}://${hostname}:${port}`;
      }
    } catch {}
  }

  return DEFAULT_REMOTE_BASE;
}

export function getDecksApiBase() {
  const override = readWindowOverride('__DECKS_API_BASE');
  if (override) {
    if (override.startsWith('http://') || override.startsWith('https://') || override.startsWith('/')) {
      return override;
    }
  }
  const base = getServerBase();
  return `${base.replace(/\/+$/, '')}/decks`;
}

export function getAuthApiBase() {
  const override = readWindowOverride('__AUTH_API_BASE');
  if (override) {
    if (override.startsWith('http://') || override.startsWith('https://') || override.startsWith('/')) {
      return override;
    }
  }
  const base = getServerBase();
  return `${base.replace(/\/+$/, '')}/auth`;
}

export function getResolvedConfig() {
  return {
    serverBase: getServerBase(),
    decksApiBase: getDecksApiBase(),
    authApiBase: getAuthApiBase(),
  };
}

try {
  if (typeof window !== 'undefined') {
    const target = window.__netConfig || {};
    Object.defineProperties(target, {
      serverBase: {
        get: getServerBase,
        enumerable: true,
        configurable: true,
      },
      decksApiBase: {
        get: getDecksApiBase,
        enumerable: true,
        configurable: true,
      },
      authApiBase: {
        get: getAuthApiBase,
        enumerable: true,
        configurable: true,
      },
    });
    window.__netConfig = target;
  }
} catch {}

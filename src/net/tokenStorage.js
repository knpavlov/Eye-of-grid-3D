// Хранилище токена авторизации: отделено от сетевой логики для упрощения миграции
const LOCAL_SESSIONS_KEY = 'mp.auth.sessions';
const SESSION_ACTIVE_KEY = 'mp.auth.activeUser';
const SESSION_DATA_VERSION = 1;

const listeners = new Set();

function safeParse(json, fallback) {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

function readLocalSessions() {
  if (typeof window === 'undefined') return { version: SESSION_DATA_VERSION, sessions: {} };
  const raw = window.localStorage?.getItem(LOCAL_SESSIONS_KEY);
  if (!raw) return { version: SESSION_DATA_VERSION, sessions: {} };
  const parsed = safeParse(raw, {});
  if (parsed?.version !== SESSION_DATA_VERSION || typeof parsed.sessions !== 'object') {
    return { version: SESSION_DATA_VERSION, sessions: {} };
  }
  return { version: SESSION_DATA_VERSION, sessions: parsed.sessions || {} };
}

function writeLocalSessions(payload) {
  if (typeof window === 'undefined') return;
  const data = JSON.stringify({ version: SESSION_DATA_VERSION, sessions: payload.sessions || {} });
  try { window.localStorage?.setItem(LOCAL_SESSIONS_KEY, data); } catch {}
}

function readActiveUserId() {
  if (typeof window === 'undefined') return null;
  const value = window.sessionStorage?.getItem(SESSION_ACTIVE_KEY);
  return value && value !== 'null' ? value : null;
}

function writeActiveUserId(userId) {
  if (typeof window === 'undefined') return;
  if (userId) {
    try { window.sessionStorage?.setItem(SESSION_ACTIVE_KEY, userId); } catch {}
  } else {
    try { window.sessionStorage?.removeItem(SESSION_ACTIVE_KEY); } catch {}
  }
}

export function listSavedSessions() {
  const { sessions } = readLocalSessions();
  return Object.values(sessions || {});
}

export function getSessionByUserId(userId) {
  if (!userId) return null;
  const { sessions } = readLocalSessions();
  return sessions?.[userId] || null;
}

export function getActiveSession() {
  const userId = readActiveUserId();
  if (!userId) return null;
  return getSessionByUserId(userId);
}

function notify(change) {
  const snapshot = getActiveSession();
  listeners.forEach((cb) => {
    try { cb(snapshot, change); } catch {}
  });
}

export function onSessionChange(cb) {
  if (typeof cb !== 'function') return () => {};
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function setActiveSession(userId) {
  writeActiveUserId(userId);
  notify({ type: 'activate', userId });
}

export function persistSession({ user, token, expiresAt }) {
  if (!user || !user.id || !token) return null;
  const payload = {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName || user.email?.split('@')[0] || 'Player',
    },
    token,
    expiresAt: expiresAt || null,
    savedAt: new Date().toISOString(),
  };
  const store = readLocalSessions();
  store.sessions = store.sessions || {};
  store.sessions[user.id] = payload;
  writeLocalSessions(store);
  notify({ type: 'persist', userId: user.id });
  return payload;
}

export function clearSession(userId) {
  if (!userId) return;
  const store = readLocalSessions();
  if (store.sessions && store.sessions[userId]) {
    delete store.sessions[userId];
    writeLocalSessions(store);
  }
  const active = readActiveUserId();
  if (active === userId) {
    writeActiveUserId(null);
  }
  notify({ type: 'remove', userId });
}

export function clearAllSessions() {
  if (typeof window === 'undefined') return;
  try { window.localStorage?.removeItem(LOCAL_SESSIONS_KEY); } catch {}
  try { window.sessionStorage?.removeItem(SESSION_ACTIVE_KEY); } catch {}
  notify({ type: 'clear' });
}

export function getAuthToken() {
  const session = getActiveSession();
  return session?.token || null;
}


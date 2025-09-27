// Сервис авторизации: общение с backend без привязки к UI
import { requestJson } from './httpClient.js';
import { getAuthApiBase } from './config.js';
import {
  persistSession,
  setActiveSession,
  getActiveSession,
  listSavedSessions,
  clearSession,
  getSessionByUserId,
} from './tokenStorage.js';

function buildUrl(path = '') {
  const base = getAuthApiBase();
  if (!path) return base;
  const trimmed = base.endsWith('/') ? base.slice(0, -1) : base;
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${trimmed}${suffix}`;
}

function normalizeAuthResponse(payload) {
  if (!payload) return null;
  const user = payload.user || payload.profile || null;
  if (!user || !user.id) return null;
  return {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName || user.email?.split('@')[0] || 'Player',
    },
    token: payload.token || null,
    expiresAt: payload.expiresAt || null,
  };
}

export async function registerAccount({ email, password, repeatPassword, displayName }) {
  const payload = await requestJson(buildUrl('/register'), {
    method: 'POST',
    body: JSON.stringify({ email, password, repeatPassword, displayName }),
  });
  const normalized = normalizeAuthResponse(payload);
  if (normalized?.token) {
    persistSession(normalized);
    setActiveSession(normalized.user.id);
  }
  return normalized;
}

export async function loginAccount({ email, password }) {
  const payload = await requestJson(buildUrl('/login'), {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  const normalized = normalizeAuthResponse(payload);
  if (normalized?.token) {
    persistSession(normalized);
    setActiveSession(normalized.user.id);
  }
  return normalized;
}

export async function logoutCurrent() {
  try {
    await requestJson(buildUrl('/logout'), { method: 'POST' });
  } catch (err) {
    // Игнорируем сетевые сбои при логауте, чтобы не блокировать UI
    console.warn('[auth] Ошибка при попытке выхода', err);
  }
  const active = getActiveSession();
  if (active?.user?.id) {
    clearSession(active.user.id);
  }
}

export async function fetchProfile() {
  const payload = await requestJson(buildUrl('/me'), { method: 'GET' });
  return payload?.user || null;
}

export async function verifyToken(token) {
  if (!token) return null;
  try {
    const payload = await requestJson(buildUrl('/token/verify'), {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
    return normalizeAuthResponse({ ...payload, token });
  } catch (err) {
    return null;
  }
}

export function getSavedSessions() {
  return listSavedSessions();
}

export function activateSession(userId) {
  const session = getSessionByUserId(userId);
  if (!session) return null;
  setActiveSession(userId);
  return session;
}

export function removeSavedSession(userId) {
  clearSession(userId);
}

export { getActiveSession, onSessionChange } from './tokenStorage.js';

export default {
  registerAccount,
  loginAccount,
  logoutCurrent,
  fetchProfile,
  verifyToken,
  getSavedSessions,
  activateSession,
  removeSavedSession,
};


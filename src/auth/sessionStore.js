// Хранилище авторизационных данных на фронтенде
// Держим модуль чистым: только управление токеном, профилями и уведомления слушателей

const STORAGE_KEY_PROFILES = 'eog.auth.profiles';
const STORAGE_KEY_DEFAULT = 'eog.auth.defaultProfile';
const SESSION_KEY_ACTIVE = 'eog.auth.session.activeProfile';

let profiles = new Map();
let activeProfileId = null;
let activeToken = null;
let activeUser = null;
let initialized = false;

const listeners = new Set();
let storageListenerAttached = false;

function notify() {
  const snapshot = {
    profiles: getStoredProfiles(),
    activeProfileId,
    token: activeToken,
    user: activeUser,
    authenticated: !!activeToken,
  };
  listeners.forEach(cb => {
    try { cb(snapshot); } catch (err) { console.warn('[sessionStore] Ошибка слушателя', err); }
  });
}

function refreshProfilesFromStorage() {
  profiles = loadProfiles();
  if (activeProfileId && profiles.has(activeProfileId)) {
    const entry = profiles.get(activeProfileId);
    activeToken = entry?.token || null;
    activeUser = entry?.user || null;
  } else if (profiles.size) {
    const nextId = pickInitialProfileId();
    applyActiveProfile(nextId, { silent: true });
  } else {
    activeProfileId = null;
    activeToken = null;
    activeUser = null;
  }
  notify();
}

function handleStorageChange(event) {
  if (typeof window === 'undefined') return;
  if (!event) return;
  const isLocal = !event.storageArea || event.storageArea === window.localStorage;
  if (!isLocal) return;
  if (event.key === STORAGE_KEY_PROFILES || event.key === STORAGE_KEY_DEFAULT) {
    refreshProfilesFromStorage();
  }
}

function attachStorageListener() {
  if (storageListenerAttached) return;
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
  window.addEventListener('storage', handleStorageChange);
  storageListenerAttached = true;
}

function readLocalStorage(key) {
  if (typeof localStorage === 'undefined') return null;
  try { return localStorage.getItem(key); } catch { return null; }
}

function writeLocalStorage(key, value) {
  if (typeof localStorage === 'undefined') return;
  try {
    if (value === null || value === undefined) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
  } catch {}
}

function readSessionStorage(key) {
  if (typeof sessionStorage === 'undefined') return null;
  try { return sessionStorage.getItem(key); } catch { return null; }
}

function writeSessionStorage(key, value) {
  if (typeof sessionStorage === 'undefined') return;
  try {
    if (value === null || value === undefined) {
      sessionStorage.removeItem(key);
    } else {
      sessionStorage.setItem(key, value);
    }
  } catch {}
}

function loadProfiles() {
  const raw = readLocalStorage(STORAGE_KEY_PROFILES);
  if (!raw) return new Map();
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return new Map();
    const map = new Map();
    for (const [id, entry] of Object.entries(parsed)) {
      if (!id || !entry) continue;
      if (!entry.token || !entry.user || entry.user.id !== id) continue;
      map.set(id, {
        token: String(entry.token),
        user: entry.user,
        updatedAt: Number(entry.updatedAt) || Date.now(),
      });
    }
    return map;
  } catch {
    return new Map();
  }
}

function persistProfiles() {
  const obj = {};
  profiles.forEach((value, key) => {
    obj[key] = {
      token: value.token,
      user: value.user,
      updatedAt: value.updatedAt,
    };
  });
  writeLocalStorage(STORAGE_KEY_PROFILES, JSON.stringify(obj));
}

function pickInitialProfileId() {
  const sessionId = readSessionStorage(SESSION_KEY_ACTIVE);
  if (sessionId && profiles.has(sessionId)) return sessionId;
  const defaultId = readLocalStorage(STORAGE_KEY_DEFAULT);
  if (defaultId && profiles.has(defaultId)) return defaultId;
  let latestId = null;
  let latestTs = -Infinity;
  profiles.forEach((value, key) => {
    if (value.updatedAt > latestTs) {
      latestId = key;
      latestTs = value.updatedAt;
    }
  });
  return latestId;
}

function applyActiveProfile(id, { silent = false } = {}) {
  if (id && !profiles.has(id)) {
    id = null;
  }
  activeProfileId = id;
  if (id) {
    const entry = profiles.get(id);
    activeToken = entry?.token || null;
    activeUser = entry?.user || null;
    writeSessionStorage(SESSION_KEY_ACTIVE, id);
    writeLocalStorage(STORAGE_KEY_DEFAULT, id);
  } else {
    activeToken = null;
    activeUser = null;
    writeSessionStorage(SESSION_KEY_ACTIVE, null);
    writeLocalStorage(STORAGE_KEY_DEFAULT, null);
  }
  if (!silent) notify();
}

export function initSessionStore() {
  if (initialized) return {
    profiles: getStoredProfiles(),
    activeProfileId,
    token: activeToken,
    user: activeUser,
    authenticated: !!activeToken,
  };
  profiles = loadProfiles();
  const initialId = pickInitialProfileId();
  applyActiveProfile(initialId, { silent: true });
  initialized = true;
  attachStorageListener();
  notify();
  return {
    profiles: getStoredProfiles(),
    activeProfileId,
    token: activeToken,
    user: activeUser,
    authenticated: !!activeToken,
  };
}

export function getSessionToken() {
  return activeToken;
}

export function getActiveUser() {
  return activeUser;
}

export function isAuthenticated() {
  return !!activeToken;
}

export function getStoredProfiles() {
  const arr = [];
  profiles.forEach((value, key) => {
    arr.push({ id: key, user: value.user, updatedAt: value.updatedAt });
  });
  arr.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return arr;
}

export function onSessionChange(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setActiveSession({ token, user, remember = true }) {
  if (!user?.id || !token) return;
  const entry = {
    token,
    user,
    updatedAt: Date.now(),
  };
  if (remember) {
    profiles.set(user.id, entry);
    persistProfiles();
  }
  applyActiveProfile(user.id);
}

export function setActiveProfile(profileId) {
  applyActiveProfile(profileId || null);
}

export function clearActiveSession({ keepProfiles = true, dropActiveProfile = false } = {}) {
  if (dropActiveProfile && activeProfileId) {
    profiles.delete(activeProfileId);
    persistProfiles();
  }
  if (!keepProfiles) {
    profiles.clear();
    persistProfiles();
    writeLocalStorage(STORAGE_KEY_DEFAULT, null);
  }
  applyActiveProfile(null);
}

export function removeStoredProfile(profileId) {
  if (!profileId) return;
  profiles.delete(profileId);
  persistProfiles();
  if (activeProfileId === profileId) {
    applyActiveProfile(pickInitialProfileId());
  } else {
    notify();
  }
}

export function handleUnauthorized({ dropProfile = true } = {}) {
  if (!activeProfileId) {
    clearActiveSession({ keepProfiles: !dropProfile });
    return;
  }
  if (dropProfile) {
    profiles.delete(activeProfileId);
    persistProfiles();
  }
  applyActiveProfile(dropProfile ? pickInitialProfileId() : null);
}

export function getStateSnapshot() {
  return {
    profiles: getStoredProfiles(),
    activeProfileId,
    token: activeToken,
    user: activeUser,
    authenticated: !!activeToken,
  };
}

const api = {
  initSessionStore,
  getSessionToken,
  getActiveUser,
  isAuthenticated,
  getStoredProfiles,
  onSessionChange,
  setActiveSession,
  setActiveProfile,
  clearActiveSession,
  removeStoredProfile,
  handleUnauthorized,
  getStateSnapshot,
};

try {
  if (typeof window !== 'undefined') {
    window.__auth = window.__auth || {};
    Object.assign(window.__auth, api);
  }
} catch {}

export default api;

// Управление текущей сессией пользователя
// Здесь нет прямой привязки к DOM, только события и обращения к API

import * as tokenStorage from './tokenStorage.js';
import * as authApi from './authApi.js';

let currentUser = null;
let currentToken = null;
let currentExpiresAt = null;
let initPromise = null;

const sessionListeners = new Set();
const tokenListeners = new Set();
const accountListeners = new Set();

function notifySession() {
  const snapshot = getSession();
  sessionListeners.forEach(cb => {
    try { cb(snapshot); } catch (err) { console.warn('[auth/session] Ошибка обработчика session', err); }
  });
}

function notifyToken() {
  const token = currentToken;
  tokenListeners.forEach(cb => {
    try { cb(token); } catch (err) { console.warn('[auth/session] Ошибка обработчика token', err); }
  });
}

function notifyAccounts() {
  const accounts = getStoredAccounts();
  accountListeners.forEach(cb => {
    try { cb(accounts); } catch (err) { console.warn('[auth/session] Ошибка обработчика accounts', err); }
  });
}

function setSessionInternal({ user, token, expiresAt, remember = true, setActive = true } = {}) {
  currentUser = user || null;
  currentToken = token || null;
  currentExpiresAt = expiresAt || null;

  if (remember && user && token) {
    tokenStorage.saveAccount({
      email: user.email,
      token,
      userId: user.id,
      displayName: user.displayName,
      expiresAt,
    });
    if (setActive) tokenStorage.setSessionActiveEmail(user.email);
  } else if (!token) {
    tokenStorage.clearSessionActiveEmail();
  }

  notifyAccounts();
  notifyToken();
  notifySession();
}

async function activateStoredAccount(email) {
  const stored = tokenStorage.getAccount(email);
  if (!stored) return false;
  try {
    const profile = await authApi.fetchProfile(stored.token);
    const user = profile?.user;
    if (!user) throw new Error('Нет профиля');
    setSessionInternal({ user, token: stored.token, expiresAt: stored.expiresAt, remember: true, setActive: true });
    return true;
  } catch (err) {
    console.warn('[auth/session] Не удалось восстановить сессию для', email, err?.message || err);
    tokenStorage.removeAccount(email);
    const active = tokenStorage.getSessionActiveEmail();
    if (active === email) tokenStorage.clearSessionActiveEmail();
    notifyAccounts();
    return false;
  }
}

export function getSession() {
  return {
    user: currentUser,
    token: currentToken,
    expiresAt: currentExpiresAt,
  };
}

export function getAuthToken() {
  return currentToken;
}

export function isAuthenticated() {
  return Boolean(currentUser && currentToken);
}

export function getStoredAccounts() {
  return tokenStorage.listAccounts().sort((a, b) => (b.lastUsedAt || 0) - (a.lastUsedAt || 0));
}

export function onSessionChange(cb) {
  if (typeof cb !== 'function') return () => {};
  sessionListeners.add(cb);
  return () => sessionListeners.delete(cb);
}

export function onTokenChange(cb) {
  if (typeof cb !== 'function') return () => {};
  tokenListeners.add(cb);
  return () => tokenListeners.delete(cb);
}

export function onAccountsChange(cb) {
  if (typeof cb !== 'function') return () => {};
  accountListeners.add(cb);
  return () => accountListeners.delete(cb);
}

export async function initSession() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const sessionEmail = tokenStorage.getSessionActiveEmail();
    if (sessionEmail) {
      const ok = await activateStoredAccount(sessionEmail);
      if (ok) return true;
    }
    const accounts = getStoredAccounts();
    if (accounts.length === 1) {
      await activateStoredAccount(accounts[0].email);
    }
    notifyAccounts();
    notifySession();
    return true;
  })();
  return initPromise;
}

export async function register({ email, password, passwordConfirm, displayName }) {
  const result = await authApi.register({ email, password, passwordConfirm, displayName });
  const user = result?.user;
  const token = result?.token;
  if (!user || !token) throw new Error('Некорректный ответ сервера при регистрации');
  setSessionInternal({ user, token, expiresAt: result?.expiresAt, remember: true, setActive: true });
  return user;
}

export async function signIn({ email, password }) {
  const result = await authApi.login({ email, password });
  const user = result?.user;
  const token = result?.token;
  if (!user || !token) throw new Error('Некорректный ответ сервера при входе');
  setSessionInternal({ user, token, expiresAt: result?.expiresAt, remember: true, setActive: true });
  return user;
}

export async function switchAccount(email) {
  const key = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!key) throw new Error('Некорректный email для переключения');
  const ok = await activateStoredAccount(key);
  if (!ok) throw new Error('Не удалось активировать выбранный аккаунт');
  return currentUser;
}

export async function signOut({ forget = false } = {}) {
  const token = currentToken;
  const email = currentUser?.email;
  if (forget && token) {
    authApi.logout(token).catch(err => console.warn('[auth/session] Ошибка при выходе', err?.message || err));
  }
  if (forget && email) {
    tokenStorage.removeAccount(email);
  }
  tokenStorage.clearSessionActiveEmail();
  setSessionInternal({ user: null, token: null, expiresAt: null, remember: false, setActive: false });
}


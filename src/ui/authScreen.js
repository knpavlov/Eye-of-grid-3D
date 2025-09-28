// Экран авторизации: регистрация, вход и выбор сохранённых профилей
// Вся логика отделена от визуальных эффектов, чтобы её можно было переносить в другие движки

import { login, register } from '../net/auth.js';
import { refreshDecks } from '../net/decks.js';
import {
  initSessionStore,
  onSessionChange,
  getStateSnapshot,
  getStoredProfiles,
  setActiveSession,
  setActiveProfile,
  clearActiveSession,
  removeStoredProfile,
} from '../auth/sessionStore.js';
import { setDeckStorageNamespace } from '../core/decks.js';

let root = null;
let mode = 'login';
let pending = false;
let errorMessage = '';
let initialized = false;
let unsubscribe = null;
let lastUserId = null;
let lastNotifiedUserId = null;
let optionsRef = {};
let syncingDecks = false;
let stylesInjected = false;
let hideTimer = null;

const BODY_OVERLAY_CLASS = 'auth-overlay-open';

function ensureStyles() {
  if (stylesInjected || typeof document === 'undefined') return;
  // Стили держим в одном месте, чтобы UI-слой можно было отделить от логики при миграции
  const style = document.createElement('style');
  style.id = 'auth-overlay-styles';
  style.textContent = `
    .auth-layer { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 10000; transition: opacity 0.2s ease; }
    .auth-layer.auth-hidden { opacity: 0; pointer-events: none; }
    .auth-layer .auth-backdrop { position: absolute; inset: 0; background: rgba(15, 23, 42, 0.72); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }
    .auth-layer .auth-surface { position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; padding: 20px; pointer-events: none; }
    .auth-layer .auth-card { pointer-events: auto; width: min(400px, 92vw); background: rgba(15, 23, 42, 0.92); border: 1px solid rgba(148, 163, 184, 0.22); border-radius: 20px; padding: 32px 28px; box-shadow: 0 22px 60px rgba(2, 6, 23, 0.55); color: #e2e8f0; font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .auth-card h2.auth-title { font-size: 20px; margin: 0 0 20px; text-align: center; font-weight: 600; color: #f1f5f9; }
    .auth-card .auth-form { display: flex; flex-direction: column; gap: 16px; }
    .auth-card .auth-field { display: flex; flex-direction: column; }
    .auth-card label { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: #cbd5f5; }
    .auth-card input { margin-top: 6px; width: 100%; border-radius: 10px; border: 1px solid rgba(148, 163, 184, 0.2); background: rgba(15, 23, 42, 0.8); color: #e2e8f0; padding: 10px 12px; font-size: 14px; transition: border-color 0.2s ease, box-shadow 0.2s ease; }
    .auth-card input:focus { outline: none; border-color: rgba(16, 185, 129, 0.7); box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.25); }
    .auth-card button.auth-submit { margin-top: 8px; width: 100%; border-radius: 999px; padding: 10px 16px; font-weight: 600; font-size: 14px; border: none; background: linear-gradient(135deg, #0ea5e9, #10b981); color: #0f172a; cursor: pointer; transition: transform 0.2s ease, box-shadow 0.2s ease, filter 0.2s ease; }
    .auth-card button.auth-submit:disabled { filter: grayscale(0.4); opacity: 0.7; cursor: wait; }
    .auth-card button.auth-submit:not(:disabled):hover { transform: translateY(-1px); box-shadow: 0 12px 24px rgba(14, 165, 233, 0.25); }
    .auth-card .auth-toggle { margin-top: 16px; background: none; border: none; color: #94a3b8; font-size: 12px; cursor: pointer; text-decoration: underline; }
    .auth-card .auth-toggle:hover { color: #e2e8f0; }
    .auth-card .auth-error { margin-top: 18px; font-size: 13px; color: #fca5a5; }
    .auth-card .auth-error.hidden { display: none; }
    .auth-card .auth-pending { margin-top: 12px; font-size: 12px; color: #94a3b8; text-align: center; }
    .auth-saved { margin-top: 24px; display: flex; flex-direction: column; gap: 12px; }
    .auth-saved.hidden { display: none; }
    .auth-saved-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.16em; color: #94a3b8; }
    .auth-saved-card { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 14px; background: rgba(30, 41, 59, 0.6); border: 1px solid rgba(148, 163, 184, 0.22); }
    .auth-saved-meta { display: flex; flex-direction: column; gap: 2px; }
    .auth-saved-meta .auth-saved-name { font-size: 13px; font-weight: 600; color: #f8fafc; }
    .auth-saved-meta .auth-saved-email { font-size: 12px; color: #cbd5f5; opacity: 0.8; }
    .auth-saved-meta .auth-saved-time { font-size: 10px; color: #818cf8; opacity: 0.75; }
    .auth-saved-actions { display: flex; align-items: center; gap: 8px; }
    .auth-saved-actions button { padding: 6px 10px; border-radius: 999px; border: none; cursor: pointer; font-size: 12px; font-weight: 600; }
    .auth-saved-use { background: rgba(16, 185, 129, 0.9); color: #0f172a; }
    .auth-saved-use:hover { filter: brightness(1.05); }
    .auth-saved-remove { background: rgba(100, 116, 139, 0.35); color: #e2e8f0; }
    .auth-saved-remove:hover { background: rgba(148, 163, 184, 0.35); }
    body.${BODY_OVERLAY_CLASS} #main-menu-overlay { filter: blur(6px); }
  `;
  document.head.appendChild(style);
  stylesInjected = true;
}

function ensureRoot() {
  if (root || typeof document === 'undefined') return;
  ensureStyles();
  root = document.createElement('div');
  root.id = 'auth-overlay';
  root.className = 'auth-layer auth-hidden';
  root.style.display = 'none';
  document.body.appendChild(root);
}

function renderSavedProfiles(container) {
  if (!container) return;
  const profiles = getStoredProfiles();
  container.innerHTML = '';
  if (!profiles.length) {
    container.classList.add('hidden');
    return;
  }
  container.classList.remove('hidden');
  const title = document.createElement('div');
  title.className = 'auth-saved-title';
  title.textContent = 'Saved profiles';
  container.appendChild(title);
  profiles.forEach(({ id, user, updatedAt }) => {
    const item = document.createElement('div');
    item.className = 'auth-saved-card';

    const info = document.createElement('div');
    info.className = 'auth-saved-meta';

    const nickname = document.createElement('span');
    nickname.className = 'auth-saved-name';
    nickname.textContent = user?.nickname || 'Player';
    info.appendChild(nickname);

    const email = document.createElement('span');
    email.className = 'auth-saved-email';
    email.textContent = user?.email || id;
    info.appendChild(email);

    if (updatedAt) {
      try {
        const ts = new Date(updatedAt);
        const time = document.createElement('span');
        time.className = 'auth-saved-time';
        time.textContent = `Last used: ${ts.toLocaleString()}`;
        info.appendChild(time);
      } catch {}
    }

    const actions = document.createElement('div');
    actions.className = 'auth-saved-actions';

    const useBtn = document.createElement('button');
    useBtn.type = 'button';
    useBtn.className = 'auth-saved-use';
    useBtn.textContent = 'Use';
    useBtn.addEventListener('click', (evt) => {
      evt.preventDefault();
      setActiveProfile(id);
    });

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'auth-saved-remove';
    removeBtn.textContent = '×';
    removeBtn.title = 'Remove';
    removeBtn.addEventListener('click', (evt) => {
      evt.preventDefault();
      removeStoredProfile(id);
      render();
    });

    actions.appendChild(useBtn);
    actions.appendChild(removeBtn);

    item.appendChild(info);
    item.appendChild(actions);
    container.appendChild(item);
  });
}

function render() {
  if (!root) return;
  root.innerHTML = '';

  const backdrop = document.createElement('div');
  backdrop.className = 'auth-backdrop';
  root.appendChild(backdrop);

  const surface = document.createElement('div');
  surface.className = 'auth-surface';
  root.appendChild(surface);

  const card = document.createElement('div');
  card.className = 'auth-card';
  surface.appendChild(card);

  const heading = document.createElement('h2');
  heading.className = 'auth-title';
  heading.textContent = mode === 'login' ? 'Welcome back' : 'Create account';
  card.appendChild(heading);

  const form = document.createElement('form');
  form.id = 'auth-form';
  form.className = 'auth-form';
  card.appendChild(form);

  const emailField = document.createElement('div');
  emailField.className = 'auth-field';
  const emailLabel = document.createElement('label');
  emailLabel.textContent = 'Email';
  const emailInput = document.createElement('input');
  emailInput.type = 'email';
  emailInput.name = 'email';
  emailInput.required = true;
  emailInput.autocomplete = 'email';
  emailField.appendChild(emailLabel);
  emailField.appendChild(emailInput);
  form.appendChild(emailField);

  const passwordField = document.createElement('div');
  passwordField.className = 'auth-field';
  const passwordLabel = document.createElement('label');
  passwordLabel.textContent = 'Password';
  const passwordInput = document.createElement('input');
  passwordInput.type = 'password';
  passwordInput.name = 'password';
  passwordInput.required = true;
  passwordInput.minLength = 6;
  passwordInput.autocomplete = mode === 'login' ? 'current-password' : 'new-password';
  passwordField.appendChild(passwordLabel);
  passwordField.appendChild(passwordInput);
  form.appendChild(passwordField);

  if (mode === 'register') {
    const confirmField = document.createElement('div');
    confirmField.className = 'auth-field';
    const confirmLabel = document.createElement('label');
    confirmLabel.textContent = 'Confirm password';
    const confirmInput = document.createElement('input');
    confirmInput.type = 'password';
    confirmInput.name = 'confirm';
    confirmInput.required = true;
    confirmInput.autocomplete = 'new-password';
    confirmField.appendChild(confirmLabel);
    confirmField.appendChild(confirmInput);
    form.appendChild(confirmField);

    const nicknameField = document.createElement('div');
    nicknameField.className = 'auth-field';
    const nicknameLabel = document.createElement('label');
    nicknameLabel.textContent = 'Nickname';
    const nicknameInput = document.createElement('input');
    nicknameInput.type = 'text';
    nicknameInput.name = 'nickname';
    nicknameInput.required = true;
    nicknameInput.maxLength = 32;
    nicknameInput.placeholder = 'Введите ник';
    nicknameInput.autocomplete = 'nickname';
    nicknameField.appendChild(nicknameLabel);
    nicknameField.appendChild(nicknameInput);
    form.appendChild(nicknameField);
  }

  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.className = 'auth-submit';
  submitBtn.textContent = mode === 'login' ? 'Sign In' : 'Create an Account';
  submitBtn.disabled = pending;
  form.appendChild(submitBtn);

  form.addEventListener('submit', handleSubmit);

  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.id = 'auth-toggle';
  toggleBtn.className = 'auth-toggle';
  toggleBtn.textContent = mode === 'login'
    ? 'Create an Account'
    : 'Return to Sign In Screen';
  toggleBtn.addEventListener('click', (evt) => {
    evt.preventDefault();
    if (pending) return;
    mode = mode === 'login' ? 'register' : 'login';
    errorMessage = '';
    render();
  });
  card.appendChild(toggleBtn);

  const errorBox = document.createElement('div');
  errorBox.className = 'auth-error';
  if (!errorMessage) {
    errorBox.classList.add('hidden');
  } else {
    errorBox.textContent = errorMessage;
  }
  card.appendChild(errorBox);

  if (pending) {
    const pendingBox = document.createElement('div');
    pendingBox.className = 'auth-pending';
    pendingBox.textContent = 'Processing…';
    card.appendChild(pendingBox);
  }

  const savedBlock = document.createElement('div');
  savedBlock.id = 'auth-saved';
  savedBlock.className = 'auth-saved hidden';
  card.appendChild(savedBlock);
  renderSavedProfiles(savedBlock);

  if (pending) {
    const controls = card.querySelectorAll('input, button');
    controls.forEach((node) => {
      if (node !== toggleBtn) {
        node.disabled = true;
      }
    });
  }
}

async function syncDecksForUser(user) {
  if (!user?.id) return;
  if (syncingDecks) return;
  syncingDecks = true;
  try {
    setDeckStorageNamespace(user.id, { fallbackToDefaults: false });
    await refreshDecks({ persistLocal: true });
    if (typeof optionsRef.onAuthenticated === 'function' && lastNotifiedUserId !== user.id) {
      try { optionsRef.onAuthenticated(user); } catch {}
      lastNotifiedUserId = user.id;
    }
  } catch (err) {
    errorMessage = err?.message || 'Failed to sync decks';
    console.warn('[authScreen] Не удалось синхронизировать колоды', err);
  } finally {
    syncingDecks = false;
    render();
  }
}

function show() {
  if (!root) return;
  ensureStyles();
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  root.style.display = '';
  root.classList.remove('auth-hidden');
  try { document.body.classList.add(BODY_OVERLAY_CLASS); } catch {}
  render();
}

function hide() {
  if (!root) return;
  root.classList.add('auth-hidden');
  try { document.body.classList.remove(BODY_OVERLAY_CLASS); } catch {}
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  hideTimer = setTimeout(() => {
    if (!root) return;
    root.style.display = 'none';
    hideTimer = null;
  }, 220);
}

async function handleSubmit(event) {
  event.preventDefault();
  if (pending) return;
  const formData = new FormData(event.currentTarget);
  const email = String(formData.get('email') || '').trim();
  const password = String(formData.get('password') || '');
  const confirm = String(formData.get('confirm') || '');
  const nickname = String(formData.get('nickname') || '').trim();
  if (!email || !password) {
    errorMessage = 'Email и пароль обязательны';
    render();
    return;
  }
  if (mode === 'register' && !nickname) {
    errorMessage = 'Ник обязателен';
    render();
    return;
  }
  if (mode === 'register' && password !== confirm) {
    errorMessage = 'Пароли не совпадают';
    render();
    return;
  }
  pending = true;
  errorMessage = '';
  render();
  try {
    const payload = mode === 'login'
      ? await login({ email, password })
      : await register({ email, password, confirm, nickname });
    if (!payload?.token || !payload?.user) {
      throw new Error('Некорректный ответ сервера');
    }
    setActiveSession({ token: payload.token, user: payload.user, remember: true });
    // дальнейшие действия выполнит handleSessionChange
  } catch (err) {
    console.error('[authScreen] Ошибка авторизации', err);
    errorMessage = err?.message || 'Не удалось выполнить действие';
  } finally {
    pending = false;
    render();
  }
}

function handleSessionChange(state) {
  if (!state) return;
  const authenticated = !!state.authenticated && !!state.user;
  if (authenticated) {
    if (state.user.id !== lastUserId) {
      lastUserId = state.user.id;
      syncDecksForUser(state.user);
    }
    hide();
  } else {
    if (lastUserId) {
      try { setDeckStorageNamespace(null, { fallbackToDefaults: true }); } catch {}
    }
    lastUserId = null;
    lastNotifiedUserId = null;
    show();
  }
  if (!pending) {
    render();
  }
}

export function initAuthScreen(options = {}) {
  if (initialized) {
    optionsRef = options;
    return;
  }
  optionsRef = options;
  initSessionStore();
  ensureRoot();
  render();
  unsubscribe = onSessionChange(handleSessionChange);
  handleSessionChange(getStateSnapshot());
  initialized = true;
}

export function disposeAuthScreen() {
  if (typeof unsubscribe === 'function') {
    unsubscribe();
    unsubscribe = null;
  }
  initialized = false;
}

export function showAuthScreen() {
  ensureRoot();
  show();
}

export function hideAuthScreen() {
  hide();
}

export function logout() {
  clearActiveSession({ keepProfiles: true });
  try { setDeckStorageNamespace(null, { fallbackToDefaults: true }); } catch {}
  show();
}

const api = {
  initAuthScreen,
  disposeAuthScreen,
  showAuthScreen,
  hideAuthScreen,
  logout,
};

try {
  if (typeof window !== 'undefined') {
    window.__ui = window.__ui || {};
    window.__ui.auth = api;
  }
} catch {}

export default api;

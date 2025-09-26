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

function ensureRoot() {
  if (root || typeof document === 'undefined') return;
  root = document.createElement('div');
  root.id = 'auth-overlay';
  root.className = 'fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900 bg-opacity-95 text-slate-100 hidden';
  document.body.appendChild(root);
}

function renderSavedProfiles(container) {
  const profiles = getStoredProfiles();
  if (!profiles.length) {
    container.innerHTML = '';
    return;
  }
  const list = document.createElement('div');
  list.className = 'mt-6 space-y-3';
  const title = document.createElement('div');
  title.className = 'text-sm text-slate-300 uppercase tracking-wide';
  title.textContent = 'Saved profiles';
  list.appendChild(title);
  profiles.forEach(({ id, user, updatedAt }) => {
    const item = document.createElement('div');
    item.className = 'flex items-center justify-between gap-3 bg-slate-800/70 border border-slate-700 rounded-lg px-3 py-2';
    const info = document.createElement('div');
    info.className = 'flex flex-col';
    const nickname = document.createElement('span');
    nickname.className = 'text-sm font-semibold';
    nickname.textContent = user?.nickname || 'Player';
    const email = document.createElement('span');
    email.className = 'text-xs text-slate-400';
    email.textContent = user?.email || id;
    const time = document.createElement('span');
    time.className = 'text-[10px] text-slate-500';
    try {
      const date = new Date(updatedAt || Date.now());
      time.textContent = `Last used: ${date.toLocaleString()}`;
    } catch {
      time.textContent = '';
    }
    info.appendChild(nickname);
    info.appendChild(email);
    if (time.textContent) info.appendChild(time);
    item.appendChild(info);

    const actions = document.createElement('div');
    actions.className = 'flex items-center gap-2';

    const useBtn = document.createElement('button');
    useBtn.className = 'px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-xs rounded';
    useBtn.textContent = 'Use';
    useBtn.addEventListener('click', (evt) => {
      evt.preventDefault();
      setActiveProfile(id);
    });

    const removeBtn = document.createElement('button');
    removeBtn.className = 'px-2 py-1 bg-slate-700 hover:bg-slate-600 text-xs rounded';
    removeBtn.textContent = '×';
    removeBtn.title = 'Remove';
    removeBtn.addEventListener('click', (evt) => {
      evt.preventDefault();
      removeStoredProfile(id);
      render();
    });

    actions.appendChild(useBtn);
    actions.appendChild(removeBtn);
    item.appendChild(actions);
    list.appendChild(item);
  });
  container.innerHTML = '';
  container.appendChild(list);
}

function render() {
  if (!root) return;
  const savedProfilesPlaceholder = '<div id="auth-saved"></div>';
  const buttonLabel = mode === 'login' ? 'Sign In' : 'Create an Account';
  const toggleLabel = mode === 'login'
    ? 'Create an Account'
    : 'Return to Sign In Screen';
  const heading = mode === 'login' ? 'Welcome back' : 'Create account';
  const errorBlock = errorMessage ? `<div class="text-sm text-red-400 mt-3">${errorMessage}</div>` : '';
  const pendingHint = pending ? '<div class="text-xs text-slate-400 mt-2">Processing…</div>' : '';
  const confirmField = mode === 'register'
    ? `<div class="flex flex-col gap-1">
        <label class="text-xs uppercase tracking-wide text-slate-300">Confirm password</label>
        <input type="password" name="confirm" class="bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm" required />
      </div>`
    : '';
  const nicknameField = mode === 'register'
    ? `<div class="flex flex-col gap-1">
        <label class="text-xs uppercase tracking-wide text-slate-300">Nickname</label>
        <input type="text" name="nickname" maxlength="32" class="bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm" placeholder="Optional" />
      </div>`
    : '';

  root.innerHTML = `
    <div class="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl px-6 py-8 shadow-xl">
      <h2 class="text-xl font-semibold mb-6 text-center">${heading}</h2>
      <form id="auth-form" class="flex flex-col gap-4">
        <div class="flex flex-col gap-1">
          <label class="text-xs uppercase tracking-wide text-slate-300">Email</label>
          <input type="email" name="email" class="bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm" required />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs uppercase tracking-wide text-slate-300">Password</label>
          <input type="password" name="password" class="bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm" required minlength="6" />
        </div>
        ${confirmField}
        ${nicknameField}
        <button type="submit" class="mt-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 text-sm font-semibold rounded px-4 py-2" ${pending ? 'disabled' : ''}>${buttonLabel}</button>
      </form>
      <button id="auth-toggle" class="mt-4 w-full text-xs text-slate-400 hover:text-slate-200">${toggleLabel}</button>
      ${errorBlock}
      ${pendingHint}
      ${savedProfilesPlaceholder}
    </div>
  `;

  const form = root.querySelector('#auth-form');
  form.addEventListener('submit', handleSubmit);
  const toggleBtn = root.querySelector('#auth-toggle');
  toggleBtn.addEventListener('click', (evt) => {
    evt.preventDefault();
    mode = mode === 'login' ? 'register' : 'login';
    errorMessage = '';
    render();
  });

  renderSavedProfiles(root.querySelector('#auth-saved'));
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
  root.classList.remove('hidden');
  render();
}

function hide() {
  if (!root) return;
  root.classList.add('hidden');
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

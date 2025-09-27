// Экран авторизации: переключаемый режим входа/регистрации
// Визуальный слой отделён от логики сессии

import { initSession, isAuthenticated, onSessionChange, onAccountsChange, getStoredAccounts, signIn, register, switchAccount } from '../auth/session.js';

let overlay = null;
let mode = 'signIn';
let submitting = false;
let lastError = '';
let accountsSnapshot = [];
let unbindSession = null;
let unbindAccounts = null;

function createInput({ id, type, placeholder, autocomplete }) {
  const input = document.createElement('input');
  input.id = id;
  input.type = type;
  input.placeholder = placeholder;
  input.autocomplete = autocomplete;
  input.required = true;
  input.className = 'auth-input';
  return input;
}

function renderStoredAccounts(container) {
  if (!container) return;
  container.innerHTML = '';
  if (!accountsSnapshot.length) {
    container.classList.add('hidden');
    return;
  }
  container.classList.remove('hidden');
  const title = document.createElement('div');
  title.className = 'auth-subtitle';
  title.textContent = 'Continue as:';
  container.appendChild(title);
  accountsSnapshot.forEach(acc => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'auth-account-btn';
    btn.textContent = acc.displayName || acc.email;
    btn.addEventListener('click', async () => {
      if (submitting) return;
      submitting = true;
      updateSubmitState();
      try {
        await switchAccount(acc.email);
      } catch (err) {
        showError(err?.message || 'Не удалось активировать аккаунт');
      } finally {
        submitting = false;
        updateSubmitState();
      }
    });
    container.appendChild(btn);
  });
}

function showError(message) {
  lastError = message || '';
  const errorEl = overlay?.querySelector('.auth-error');
  if (errorEl) {
    errorEl.textContent = lastError;
    errorEl.classList.toggle('hidden', !lastError);
  }
}

function updateSubmitState() {
  if (!overlay) return;
  const submitBtn = overlay.querySelector('.auth-submit');
  if (submitBtn) {
    submitBtn.disabled = submitting;
    submitBtn.textContent = submitting
      ? (mode === 'signIn' ? 'Signing In…' : 'Creating…')
      : (mode === 'signIn' ? 'Sign In' : 'Create an Account');
  }
  const inputs = overlay.querySelectorAll('input');
  inputs.forEach(input => { input.disabled = submitting; });
}

function buildForm() {
  if (!overlay) return;
  overlay.innerHTML = '';
  const wrapper = document.createElement('div');
  wrapper.className = 'auth-wrapper';
  overlay.appendChild(wrapper);

  const card = document.createElement('div');
  card.className = 'auth-card';
  wrapper.appendChild(card);

  const title = document.createElement('h2');
  title.className = 'auth-title';
  title.textContent = mode === 'signIn' ? 'Sign In' : 'Create an Account';
  card.appendChild(title);

  const errorBox = document.createElement('div');
  errorBox.className = 'auth-error hidden';
  card.appendChild(errorBox);

  const form = document.createElement('form');
  form.className = 'auth-form';
  card.appendChild(form);

  const emailInput = createInput({ id: 'auth-email', type: 'email', placeholder: 'Email', autocomplete: 'email' });
  const passwordInput = createInput({ id: 'auth-password', type: 'password', placeholder: 'Password', autocomplete: mode === 'signIn' ? 'current-password' : 'new-password' });
  form.appendChild(emailInput);
  form.appendChild(passwordInput);

  let confirmInput = null;
  if (mode === 'register') {
    confirmInput = createInput({ id: 'auth-confirm', type: 'password', placeholder: 'Confirm Password', autocomplete: 'new-password' });
    form.appendChild(confirmInput);
  }

  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.className = 'auth-submit';
  submitBtn.textContent = mode === 'signIn' ? 'Sign In' : 'Create an Account';
  form.appendChild(submitBtn);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submitting) return;
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (!email || !password) {
      showError('Введите email и пароль');
      return;
    }
    submitting = true;
    updateSubmitState();
    showError('');
    try {
      if (mode === 'signIn') {
        await signIn({ email, password });
      } else {
        const confirm = confirmInput?.value || '';
        if (confirm !== password) {
          throw new Error('Пароли должны совпадать');
        }
        await register({ email, password, passwordConfirm: confirm });
      }
    } catch (err) {
      showError(err?.message || 'Не удалось выполнить запрос');
    } finally {
      submitting = false;
      updateSubmitState();
    }
  });

  const switchRow = document.createElement('div');
  switchRow.className = 'auth-switch-row';
  const switchLink = document.createElement('button');
  switchLink.type = 'button';
  switchLink.className = 'auth-switch';
  switchLink.textContent = mode === 'signIn' ? 'Create an Account' : 'Return to Sign In Screen';
  switchLink.addEventListener('click', () => {
    if (submitting) return;
    mode = mode === 'signIn' ? 'register' : 'signIn';
    lastError = '';
    buildForm();
    renderStoredAccounts(overlay.querySelector('.auth-accounts'));
  });
  switchRow.appendChild(switchLink);
  card.appendChild(switchRow);

  const accountsContainer = document.createElement('div');
  accountsContainer.className = 'auth-accounts';
  card.appendChild(accountsContainer);
  renderStoredAccounts(accountsContainer);

  showError(lastError);
  updateSubmitState();
}

function ensureOverlay() {
  if (overlay) return;
  overlay = document.createElement('div');
  overlay.className = 'auth-overlay';
  document.body.appendChild(overlay);
}

export function open(newMode = 'signIn') {
  mode = newMode;
  submitting = false;
  lastError = '';
  ensureOverlay();
  buildForm();
}

export function close() {
  if (overlay) {
    overlay.remove();
    overlay = null;
  }
  submitting = false;
  lastError = '';
}

export async function initAuthScreen() {
  await initSession();
  accountsSnapshot = getStoredAccounts();
  unbindAccounts = onAccountsChange((accounts) => {
    accountsSnapshot = accounts;
    if (overlay) {
      renderStoredAccounts(overlay.querySelector('.auth-accounts'));
    }
  });
  unbindSession = onSessionChange(({ user, token }) => {
    if (user && token) {
      close();
    } else {
      open('signIn');
    }
  });
  if (!isAuthenticated()) {
    open('signIn');
  }
}

export function disposeAuthScreen() {
  unbindSession?.();
  unbindAccounts?.();
  unbindSession = null;
  unbindAccounts = null;
}

const api = { open, close };
try {
  if (typeof window !== 'undefined') {
    window.__ui = window.__ui || {};
    window.__ui.auth = api;
  }
} catch {}

export default api;


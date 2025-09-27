// Панель пользователя в правом верхнем углу
// Обновляет отображение без прямой зависимости от других UI модулей

import { onSessionChange, signOut, getSession } from '../auth/session.js';

let container = null;
let unsubscribe = null;

function render(session) {
  if (!container) return;
  container.innerHTML = '';
  const { user } = session || {};
  if (!user) {
    container.classList.add('hidden');
    return;
  }
  container.classList.remove('hidden');
  const name = document.createElement('span');
  name.className = 'user-name-chip';
  name.textContent = user.displayName || user.email || 'Player';
  container.appendChild(name);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'user-logout-btn';
  button.textContent = 'Log Out';
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      await signOut({ forget: false });
    } finally {
      button.disabled = false;
    }
  });
  container.appendChild(button);
}

export function initUserPanel() {
  if (typeof document === 'undefined') return;
  container = document.getElementById('user-panel');
  if (!container) return;
  unsubscribe?.();
  unsubscribe = onSessionChange((session) => render(session));
  render(getSession());
}

export function disposeUserPanel() {
  unsubscribe?.();
  unsubscribe = null;
  container = null;
}

const api = { initUserPanel };
try {
  if (typeof window !== 'undefined') {
    window.__ui = window.__ui || {};
    window.__ui.userPanel = api;
  }
} catch {}

export default api;


// Панель пользователя в правом верхнем углу
let container = null;
let nameEl = null;
let logoutBtn = null;
let logoutHandler = null;

function ensureContainer() {
  if (container) return container;
  const target = document.getElementById('top-right');
  if (!target) return null;
  container = document.createElement('div');
  container.id = 'user-panel';
  container.className = 'flex items-center gap-3 bg-slate-800/80 border border-slate-600 rounded-full px-3 py-1 text-slate-100 shadow-lg';
  nameEl = document.createElement('span');
  nameEl.className = 'text-sm font-medium';
  container.appendChild(nameEl);
  logoutBtn = document.createElement('button');
  logoutBtn.type = 'button';
  logoutBtn.textContent = 'Log Out';
  logoutBtn.className = 'text-xs px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded-full';
  logoutBtn.addEventListener('click', () => {
    if (typeof logoutHandler === 'function') {
      logoutHandler();
    }
  });
  container.appendChild(logoutBtn);
  target.appendChild(container);
  return container;
}

export function initUserPanel({ onLogout } = {}) {
  logoutHandler = onLogout || null;
  ensureContainer();
  updateUserPanel(null);
}

export function updateUserPanel(user) {
  const root = ensureContainer();
  if (!root) return;
  if (!user) {
    root.classList.add('hidden');
    return;
  }
  nameEl.textContent = user.displayName || user.email || 'Player';
  root.classList.remove('hidden');
}

export default { initUserPanel, updateUserPanel };


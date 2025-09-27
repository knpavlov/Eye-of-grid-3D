// Экран входа/регистрации: чистый UI без привязки к сцене
import auth, {
  getActiveSession,
  onSessionChange,
  verifyToken,
  getSavedSessions,
  activateSession,
  removeSavedSession,
} from '../net/auth.js';

let overlay = null;
let currentMode = 'login';
let onSuccessCb = null;
let statusEl = null;
let formEl = null;
let toggleLink = null;
let secondaryLink = null;
let savedListEl = null;
let savedBlockEl = null;

function createOverlay() {
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = 'auth-overlay';
  overlay.className = 'fixed inset-0 z-50 flex items-center justify-center bg-slate-900';

  const panel = document.createElement('div');
  panel.className = 'bg-slate-800 border border-slate-700 rounded-xl p-8 w-full max-w-md shadow-2xl flex flex-col gap-6';
  overlay.appendChild(panel);

  const title = document.createElement('h2');
  title.id = 'auth-title';
  title.className = 'text-2xl font-semibold text-slate-100 text-center';
  panel.appendChild(title);

  statusEl = document.createElement('div');
  statusEl.id = 'auth-status';
  statusEl.className = 'text-sm text-rose-400 text-center min-h-[1.5rem]';
  panel.appendChild(statusEl);

  formEl = document.createElement('form');
  formEl.className = 'flex flex-col gap-4';
  panel.appendChild(formEl);

  savedBlockEl = document.createElement('div');
  savedBlockEl.className = 'flex flex-col gap-2';
  const savedTitle = document.createElement('div');
  savedTitle.textContent = 'Сохранённые аккаунты';
  savedTitle.className = 'text-sm text-slate-300';
  savedBlockEl.appendChild(savedTitle);
  savedListEl = document.createElement('div');
  savedListEl.id = 'auth-saved-list';
  savedListEl.className = 'flex flex-wrap gap-2';
  savedBlockEl.appendChild(savedListEl);
  panel.appendChild(savedBlockEl);

  toggleLink = document.createElement('button');
  toggleLink.type = 'button';
  toggleLink.className = 'text-sm text-slate-300 hover:text-slate-100 underline self-center';
  panel.appendChild(toggleLink);

  secondaryLink = document.createElement('button');
  secondaryLink.type = 'button';
  secondaryLink.className = 'text-xs text-slate-400 hover:text-slate-200 underline self-center';
  panel.appendChild(secondaryLink);

  toggleLink.addEventListener('click', () => {
    if (currentMode === 'login') {
      switchMode('register');
    } else {
      switchMode('login');
    }
  });

  secondaryLink.addEventListener('click', () => {
    switchMode('login');
  });

  document.body.appendChild(overlay);
  overlay.classList.add('hidden');
  return overlay;
}

function clearStatus() {
  if (statusEl) statusEl.textContent = '';
}

function setStatus(message, success = false) {
  if (!statusEl) return;
  statusEl.textContent = message || '';
  statusEl.classList.toggle('text-emerald-400', success);
  statusEl.classList.toggle('text-rose-400', !success);
}

function createInput({ id, label, type = 'text', autocomplete = '', required = false }) {
  const wrapper = document.createElement('label');
  wrapper.className = 'flex flex-col gap-1 text-slate-200 text-sm';
  wrapper.setAttribute('for', id);
  wrapper.textContent = label;
  const input = document.createElement('input');
  input.id = id;
  input.type = type;
  input.required = !!required;
  input.autocomplete = autocomplete;
  input.className = 'rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100 focus:outline-none focus:ring focus:ring-sky-500/40';
  wrapper.appendChild(input);
  return { wrapper, input };
}

function renderSavedSessions() {
  if (!savedListEl) return;
  savedListEl.innerHTML = '';
  const sessions = getSavedSessions();
  if (!sessions?.length) {
    const empty = document.createElement('div');
    empty.className = 'text-xs text-slate-500';
    empty.textContent = 'Нет сохранённых аккаунтов';
    savedListEl.appendChild(empty);
    return;
  }
  sessions.forEach((session) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'px-3 py-2 bg-slate-700 hover:bg-slate-600 text-sm rounded-lg text-slate-100 flex items-center gap-2';
    const label = document.createElement('span');
    label.textContent = session.user?.displayName || session.user?.email || 'Игрок';
    btn.appendChild(label);
    const remove = document.createElement('span');
    remove.className = 'text-xs text-slate-400 hover:text-rose-300 cursor-pointer';
    remove.textContent = '×';
    remove.addEventListener('click', (ev) => {
      ev.stopPropagation();
      removeSavedSession(session.user?.id);
      renderSavedSessions();
    });
    btn.appendChild(remove);
    btn.addEventListener('click', async () => {
      try {
        setStatus('Проверяем токен…', true);
        const verified = await verifyToken(session.token);
        if (!verified) {
          setStatus('Сессия устарела, выполните вход заново');
          removeSavedSession(session.user?.id);
          renderSavedSessions();
          return;
        }
        activateSession(session.user?.id);
        handleAuthSuccess(verified);
      } catch (err) {
        console.warn('[authScreen] Не удалось активировать сессию', err);
        setStatus('Не удалось активировать сессию');
      }
    });
    savedListEl.appendChild(btn);
  });
}

function buildForm(mode) {
  if (!formEl) return;
  formEl.innerHTML = '';
  clearStatus();
  const isRegister = mode === 'register';
  const emailField = createInput({ id: 'auth-email', label: 'Email', type: 'email', autocomplete: 'email', required: true });
  const passwordField = createInput({ id: 'auth-password', label: 'Пароль', type: 'password', autocomplete: isRegister ? 'new-password' : 'current-password', required: true });
  const repeatField = createInput({ id: 'auth-repeat', label: 'Повторите пароль', type: 'password', autocomplete: 'new-password', required: true });
  const nameField = createInput({ id: 'auth-display-name', label: 'Отображаемое имя', type: 'text', autocomplete: 'nickname', required: false });

  formEl.appendChild(emailField.wrapper);
  formEl.appendChild(passwordField.wrapper);
  if (isRegister) {
    formEl.appendChild(repeatField.wrapper);
    formEl.appendChild(nameField.wrapper);
  }

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'mt-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg py-2 font-semibold';
  submit.textContent = isRegister ? 'Create an Account' : 'Sign In';
  formEl.appendChild(submit);

  formEl.onsubmit = async (ev) => {
    ev.preventDefault();
    clearStatus();
    submit.disabled = true;
    submit.classList.add('opacity-70');
    try {
      const email = emailField.input.value.trim();
      const password = passwordField.input.value;
      if (!email || !password) {
        setStatus('Укажите email и пароль');
        return;
      }
      if (isRegister) {
        const repeat = repeatField.input.value;
        if (repeat !== password) {
          setStatus('Пароли не совпадают');
          return;
        }
        const displayName = nameField.input.value.trim();
        const response = await auth.registerAccount({ email, password, repeatPassword: repeat, displayName });
        if (!response) {
          setStatus('Регистрация не удалась');
          return;
        }
        setStatus('Аккаунт создан!', true);
        handleAuthSuccess(response);
      } else {
        const response = await auth.loginAccount({ email, password });
        if (!response) {
          setStatus('Вход не удался');
          return;
        }
        handleAuthSuccess(response);
      }
    } catch (err) {
      console.error('[authScreen] Ошибка при авторизации', err);
      const message = err?.message || 'Ошибка авторизации';
      setStatus(message);
    } finally {
      submit.disabled = false;
      submit.classList.remove('opacity-70');
    }
  };
}

function updateTexts(mode) {
  if (!overlay) return;
  const title = overlay.querySelector('#auth-title');
  if (title) {
    title.textContent = mode === 'register' ? 'Create an Account' : 'Sign In';
  }
  if (toggleLink) {
    toggleLink.textContent = mode === 'register' ? 'Return to Sign In Screen' : 'Create an Account';
  }
  if (secondaryLink) {
    secondaryLink.textContent = mode === 'register' ? 'Уже есть аккаунт? Вернуться к входу' : 'Нужен новый аккаунт? Создайте его';
  }
}

function switchMode(mode) {
  currentMode = mode;
  updateTexts(mode);
  buildForm(mode);
  renderSavedSessions();
}

function handleAuthSuccess(payload) {
  if (!payload?.user) return;
  try { setStatus('', true); } catch {}
  closeAuthScreen();
  if (typeof onSuccessCb === 'function') {
    onSuccessCb(payload);
  }
}

export function openAuthScreen({ mode = 'login', onSuccess } = {}) {
  createOverlay();
  onSuccessCb = onSuccess || null;
  switchMode(mode);
  overlay.classList.remove('hidden');
}

export function closeAuthScreen() {
  if (overlay) {
    overlay.classList.add('hidden');
  }
}

export async function ensureAuthenticated({ onSuccess } = {}) {
  const active = getActiveSession();
  if (active?.token && active?.user?.id) {
    onSuccess?.(active);
    return active;
  }
  return new Promise((resolve) => {
    openAuthScreen({
      mode: 'login',
      onSuccess: (session) => {
        onSuccess?.(session);
        resolve(session);
      },
    });
  });
}

onSessionChange((session) => {
  if (!session && overlay) {
    // если сессия пропала — показываем экран заново
    openAuthScreen({ mode: 'login', onSuccess: onSuccessCb });
  }
});


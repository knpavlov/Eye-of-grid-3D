// Долговременное хранение токенов авторизации в localStorage
// Отдельный модуль, чтобы при переносе на другой движок заменить реализацию

const STORAGE_KEY = 'mpAuth.accounts.v1';
const LAST_ACTIVE_KEY = 'mpAuth.lastActiveEmail';
const SESSION_ACTIVE_KEY = 'mpAuth.sessionActiveEmail';
const MAX_ACCOUNTS = 8;

function safeParse(json) {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function readStorage() {
  if (typeof window === 'undefined') return { accounts: {} };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = safeParse(raw);
    if (parsed && typeof parsed === 'object' && parsed.accounts && typeof parsed.accounts === 'object') {
      return { accounts: parsed.accounts };
    }
  } catch {}
  return { accounts: {} };
}

function writeStorage(data) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ accounts: data.accounts || {} }));
  } catch {}
}

function buildAccountKey(email) {
  if (typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

export function listAccounts() {
  const { accounts } = readStorage();
  return Object.entries(accounts).map(([email, info]) => ({
    email,
    token: info.token,
    userId: info.userId,
    displayName: info.displayName,
    expiresAt: info.expiresAt,
    lastUsedAt: info.lastUsedAt,
  })).filter(entry => typeof entry.token === 'string' && entry.token);
}

export function getAccount(email) {
  const key = buildAccountKey(email);
  if (!key) return null;
  const { accounts } = readStorage();
  const info = accounts[key];
  if (!info || !info.token) return null;
  return {
    email: key,
    token: info.token,
    userId: info.userId,
    displayName: info.displayName,
    expiresAt: info.expiresAt,
    lastUsedAt: info.lastUsedAt,
  };
}

export function saveAccount({ email, token, userId, displayName, expiresAt }) {
  const key = buildAccountKey(email);
  if (!key || !token) return;
  const snapshot = readStorage();
  const accounts = snapshot.accounts || {};
  accounts[key] = {
    token,
    userId,
    displayName,
    expiresAt: expiresAt || null,
    lastUsedAt: Date.now(),
  };
  const entries = Object.entries(accounts)
    .sort((a, b) => (b[1].lastUsedAt || 0) - (a[1].lastUsedAt || 0))
    .slice(0, MAX_ACCOUNTS);
  writeStorage({ accounts: Object.fromEntries(entries) });
  try { localStorage.setItem(LAST_ACTIVE_KEY, key); } catch {}
}

export function removeAccount(email) {
  const key = buildAccountKey(email);
  if (!key) return;
  const snapshot = readStorage();
  if (!snapshot.accounts[key]) return;
  delete snapshot.accounts[key];
  writeStorage(snapshot);
}

export function getSessionActiveEmail() {
  if (typeof window === 'undefined') return null;
  try {
    const value = sessionStorage.getItem(SESSION_ACTIVE_KEY);
    if (typeof value === 'string' && value.trim()) return value.trim().toLowerCase();
  } catch {}
  return null;
}

export function setSessionActiveEmail(email) {
  if (typeof window === 'undefined') return;
  const key = buildAccountKey(email);
  try {
    if (key) {
      sessionStorage.setItem(SESSION_ACTIVE_KEY, key);
      localStorage.setItem(LAST_ACTIVE_KEY, key);
    } else {
      sessionStorage.removeItem(SESSION_ACTIVE_KEY);
    }
  } catch {}
}

export function clearSessionActiveEmail() {
  if (typeof window === 'undefined') return;
  try { sessionStorage.removeItem(SESSION_ACTIVE_KEY); } catch {}
}


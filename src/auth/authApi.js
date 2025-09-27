// HTTP-запросы для авторизации
// Отделено от UI, чтобы можно было переиспользовать в других движках

import { getServerBase } from '../net/config.js';

function buildUrl(path = '') {
  const base = getServerBase().replace(/\/+$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}/auth${suffix}`;
}

async function request(path, { method = 'GET', body, token } = {}) {
  const headers = { Accept: 'application/json' };
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const response = await fetch(buildUrl(path), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let payload = {};
  if (text) {
    try { payload = JSON.parse(text); } catch { payload = {}; }
  }
  if (!response.ok) {
    const err = new Error(payload.error || `HTTP ${response.status}`);
    err.status = response.status;
    throw err;
  }
  return payload;
}

export async function register({ email, password, passwordConfirm, displayName }) {
  return request('/register', {
    method: 'POST',
    body: { email, password, passwordConfirm, displayName },
  });
}

export async function login({ email, password }) {
  return request('/login', {
    method: 'POST',
    body: { email, password },
  });
}

export async function fetchProfile(token) {
  return request('/profile', { method: 'GET', token });
}

export async function logout(token) {
  try {
    await request('/logout', { method: 'POST', token });
  } catch (err) {
    // При разрыве соединения или просроченном токене просто игнорируем
  }
}


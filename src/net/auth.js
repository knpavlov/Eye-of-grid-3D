// HTTP-клиент для регистрации и входа
// Оставляем модуль без зависимостей от DOM

import { getServerBase } from './config.js';

function buildUrl(path = '') {
  const base = getServerBase().replace(/\/+$/, '');
  const suffix = path ? (path.startsWith('/') ? path : `/${path}`) : '';
  return `${base}/auth${suffix}`;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });
  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    if (isJson) {
      try {
        const payload = await response.json();
        if (payload?.error) message = payload.error;
      } catch {}
    }
    const err = new Error(message);
    err.status = response.status;
    throw err;
  }
  if (!isJson) return {};
  try {
    return await response.json();
  } catch {
    return {};
  }
}

export async function login({ email, password } = {}) {
  const body = JSON.stringify({ email, password });
  const data = await requestJson(buildUrl('/login'), { method: 'POST', body });
  return data;
}

export async function register({ email, password, confirm, nickname } = {}) {
  const body = JSON.stringify({ email, password, confirm, nickname });
  const data = await requestJson(buildUrl('/register'), { method: 'POST', body });
  return data;
}

export async function fetchProfile(token) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const data = await requestJson(buildUrl('/profile'), { method: 'GET', headers });
  return data;
}

export default { login, register, fetchProfile };

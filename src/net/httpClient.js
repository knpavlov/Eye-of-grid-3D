// Базовый HTTP-клиент: отвечает за добавление токена и разбор JSON
import { getAuthToken, onSessionChange } from './tokenStorage.js';

let cachedToken = null;

function refreshToken() {
  cachedToken = getAuthToken();
}

refreshToken();
onSessionChange(() => refreshToken());

export function setTemporaryToken(token) {
  cachedToken = token || null;
}

function buildHeaders(options = {}) {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (cachedToken) {
    headers.set('Authorization', `Bearer ${cachedToken}`);
  }
  return headers;
}

export async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: buildHeaders(options),
  });
  const contentType = response.headers?.get?.('content-type') || '';
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

export default { requestJson };


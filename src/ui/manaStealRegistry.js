// Общий реестр уже обработанных событий кражи/потери маны
const MAX_HISTORY = 60;

const fallbackRegistry = { keys: [], map: {} };

function ensureRegistry() {
  try {
    if (typeof window === 'undefined') {
      return fallbackRegistry;
    }
    const root = window.__seenManaStealRegistry;
    if (!root || typeof root !== 'object') {
      window.__seenManaStealRegistry = { keys: [], map: {} };
      return window.__seenManaStealRegistry;
    }
    const reg = window.__seenManaStealRegistry;
    if (!Array.isArray(reg.keys)) {
      reg.keys = [];
    }
    if (!reg.map || typeof reg.map !== 'object') {
      reg.map = {};
    }
    return reg;
  } catch {
    return fallbackRegistry;
  }
}

export function manaStealKeyFromEvent(event) {
  if (!event) return null;
  const id = Number(event.id);
  if (Number.isFinite(id)) return `id:${id}`;
  const ts = Number(event.ts) || 0;
  const from = Number.isFinite(event.from) ? event.from : -1;
  const amount = Number.isFinite(event.amount) ? event.amount : Number(event.amount) || 0;
  return `ts:${ts}|from:${from}|amt:${amount}`;
}

export function hasManaStealKey(key) {
  if (!key) return false;
  const registry = ensureRegistry();
  return !!registry.map[key];
}

export function hasManaStealEvent(event) {
  return hasManaStealKey(manaStealKeyFromEvent(event));
}

export function markManaStealKey(key) {
  if (!key) return;
  const registry = ensureRegistry();
  if (registry.map[key]) return;
  registry.map[key] = true;
  registry.keys.push(key);
  if (registry.keys.length > MAX_HISTORY) {
    const excess = registry.keys.length - MAX_HISTORY;
    const removed = registry.keys.splice(0, excess);
    for (const item of removed) {
      if (item) delete registry.map[item];
    }
  }
}

export function rememberManaStealEvent(event) {
  const key = manaStealKeyFromEvent(event);
  if (!key) return null;
  markManaStealKey(key);
  return key;
}

export default {
  manaStealKeyFromEvent,
  hasManaStealKey,
  hasManaStealEvent,
  markManaStealKey,
  rememberManaStealEvent,
};

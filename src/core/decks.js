// Логика работы с колодами: хранение, сериализация, локальный кэш
// Отделяем чистые данные от UI, чтобы можно было переиспользовать в Unity
import { CARDS } from './cards.js';
import { DEFAULT_DECK_BLUEPRINTS } from './defaultDecks.js';

const LOCAL_STORAGE_KEY = 'customDecks';

const subscribers = new Set();

function notify() {
  subscribers.forEach(cb => {
    try { cb(DECKS); } catch (err) { console.warn('[decks] Ошибка слушателя', err); }
  });
}

function syncWindow() {
  try {
    if (typeof window !== 'undefined') {
      window.DECKS = DECKS;
    }
  } catch {}
}

function normalizeId(rawId) {
  if (typeof rawId === 'string' && rawId.trim()) return rawId.trim();
  return `deck_${Math.random().toString(36).slice(2, 10)}`;
}

export function hydrateDeck(raw) {
  if (!raw) return null;
  const id = normalizeId(raw.id);
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Untitled';
  const description = typeof raw.description === 'string' ? raw.description : '';
  const version = typeof raw.version === 'number' ? raw.version : Number(raw.version) || 1;
  const ownerId = typeof raw.ownerId === 'string' && raw.ownerId.trim() ? raw.ownerId.trim() : null;
  const updatedAt = raw.updatedAt || raw.updated_at || null;
  const cardsSource = Array.isArray(raw.cards) ? raw.cards : [];
  const cards = cardsSource
    .map(card => {
      if (typeof card === 'string') return CARDS[card];
      if (card && typeof card.id === 'string') return CARDS[card.id] || card;
      return null;
    })
    .filter(Boolean);
  return { id, name, description, cards, version, ownerId, updatedAt };
}

export function serializeDeck(deck) {
  if (!deck) return null;
  const cards = Array.isArray(deck.cards)
    ? deck.cards.map(card => (typeof card === 'string' ? card : card?.id)).filter(Boolean)
    : [];
  const payload = {
    id: deck.id,
    name: deck.name,
    description: deck.description || '',
    cards,
  };
  if (deck.ownerId) payload.ownerId = deck.ownerId;
  if (typeof deck.version === 'number') payload.version = deck.version;
  if (deck.updatedAt) payload.updatedAt = deck.updatedAt;
  return payload;
}

function loadLocalDecks() {
  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return null;
    return parsed.map(hydrateDeck).filter(Boolean);
  } catch {
    return null;
  }
}

function persistLocalDecks() {
  try {
    const payload = DECKS.map(serializeDeck);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(payload));
  } catch {}
}

function buildInitialDecks() {
  const hydratedDefaults = DEFAULT_DECK_BLUEPRINTS.map(hydrateDeck).filter(Boolean);
  const fromStorage = loadLocalDecks();
  if (fromStorage?.length) return fromStorage;
  return hydratedDefaults;
}

export let DECKS = buildInitialDecks();

syncWindow();

export function onDecksChanged(cb) {
  if (typeof cb !== 'function') return () => {};
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

export function setDecks(decks, { persistLocal = false } = {}) {
  const hydrated = Array.isArray(decks) ? decks.map(hydrateDeck).filter(Boolean) : [];
  DECKS = hydrated;
  syncWindow();
  if (persistLocal) persistLocalDecks();
  notify();
  return DECKS;
}

export function upsertDeck(deck, { persistLocal = false } = {}) {
  const hydrated = hydrateDeck(deck);
  if (!hydrated) return null;
  const idx = DECKS.findIndex(d => d.id === hydrated.id);
  if (idx >= 0) {
    DECKS[idx] = { ...DECKS[idx], ...hydrated, cards: hydrated.cards };
  } else {
    DECKS = [...DECKS, hydrated];
  }
  syncWindow();
  if (persistLocal) persistLocalDecks();
  notify();
  return hydrated;
}

export function addDeck(deck, options = {}) {
  return upsertDeck(deck, { persistLocal: true, ...options });
}

export function updateDeck(id, patch, { persistLocal = false } = {}) {
  const existing = DECKS.find(d => d.id === id);
  if (!existing) return null;
  const merged = { ...existing, ...patch, id };
  const hydrated = hydrateDeck(merged);
  const idx = DECKS.findIndex(d => d.id === id);
  if (idx >= 0) {
    DECKS[idx] = { ...existing, ...hydrated, cards: hydrated.cards };
  }
  syncWindow();
  if (persistLocal) persistLocalDecks();
  notify();
  return DECKS[idx];
}

export function removeDeck(id, { persistLocal = true } = {}) {
  const idx = DECKS.findIndex(d => d.id === id);
  if (idx < 0) return false;
  DECKS = [...DECKS.slice(0, idx), ...DECKS.slice(idx + 1)];
  syncWindow();
  if (persistLocal) persistLocalDecks();
  notify();
  return true;
}

export function saveDecks() {
  persistLocalDecks();
}

export function getDeckById(id) {
  return DECKS.find(d => d.id === id) || null;
}

const api = {
  DECKS,
  addDeck,
  updateDeck,
  removeDeck,
  saveDecks,
  hydrateDeck,
  serializeDeck,
  setDecks,
  upsertDeck,
  onDecksChanged,
};

try {
  if (typeof window !== 'undefined') {
    window.DECKS = DECKS;
  }
} catch {}

export default api;

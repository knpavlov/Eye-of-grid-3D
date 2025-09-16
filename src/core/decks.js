// Структурированное описание всех доступных колод и управление локальным хранилищем колод
// Модуль держит только чистую логику без DOM, что упрощает перенос на другие движки

import { CARDS } from './cards.js';
import { normalizeDeckInput, generateDeckId } from '../shared/decks/validation.js';

// Список базовых колод (id карт указываются строками)
export const RAW_DECKS = [
  {
    id: 'FIRE_STARTER',
    name: 'Fire Awakening',
    description: 'Baseline set of fiery spells and units.',
    cards: [
      'FIRE_FLAME_MAGUS',
      'FIRE_HELLFIRE_SPITTER',
      'FIRE_FREEDONIAN_WANDERER',
      'FIRE_PARTMOLE_FLAME_LIZARD',
      'FIRE_GREAT_MINOS',
      'FIRE_FLAME_ASCETIC',
      'FIRE_TRICEPTAUR_BEHEMOTH',
      'FIRE_PURSUER_OF_SAINT_DHEES',
      'FIRE_FLAME_MAGUS',
      'FIRE_HELLFIRE_SPITTER',
      'FIRE_PARTMOLE_FLAME_LIZARD',
      'FIRE_FREEDONIAN_WANDERER',
      'RAISE_STONE',
      'SPELL_PARMTETIC_HOLY_FEAST',
      'SPELL_PARMTETIC_HOLY_FEAST',
      'SPELL_GOGHLIE_ALTAR',
      'SPELL_BEGUILING_FOG',
      'SPELL_CLARE_WILS_BANNER',
      'SPELL_SUMMONER_MESMERS_ERRAND',
      'SPELL_FISSURES_OF_GOGHLIE',
    ],
  },
  {
    id: 'ARCANE_MIX',
    name: 'Arcane Arsenal',
    description: 'Balanced mix of creatures and tricks.',
    cards: [
      'FIRE_FLAME_MAGUS',
      'FIRE_HELLFIRE_SPITTER',
      'FIRE_FREEDONIAN_WANDERER',
      'FIRE_PARTMOLE_FLAME_LIZARD',
      'FIRE_GREAT_MINOS',
      'FIRE_FLAME_ASCETIC',
      'FIRE_TRICEPTAUR_BEHEMOTH',
      'FIRE_PURSUER_OF_SAINT_DHEES',
      'FIRE_FLAME_MAGUS',
      'FIRE_HELLFIRE_SPITTER',
      'FIRE_PARTMOLE_FLAME_LIZARD',
      'FIRE_FREEDONIAN_WANDERER',
      'RAISE_STONE',
      'SPELL_PARMTETIC_HOLY_FEAST',
      'SPELL_PARMTETIC_HOLY_FEAST',
      'SPELL_GOGHLIE_ALTAR',
      'SPELL_BEGUILING_FOG',
      'SPELL_CLARE_WILS_BANNER',
      'SPELL_SUMMONER_MESMERS_ERRAND',
      'SPELL_FISSURES_OF_GOGHLIE',
    ],
  },
  {
    id: 'BEAST_HORDE',
    name: 'Beast Horde',
    description: 'All creature rush with no spells.',
    cards: [
      'FIRE_FLAME_MAGUS',
      'FIRE_HELLFIRE_SPITTER',
      'FIRE_FREEDONIAN_WANDERER',
      'FIRE_PARTMOLE_FLAME_LIZARD',
      'FIRE_GREAT_MINOS',
      'FIRE_FLAME_ASCETIC',
      'FIRE_TRICEPTAUR_BEHEMOTH',
      'FIRE_PURSUER_OF_SAINT_DHEES',
      'FIRE_FLAME_MAGUS',
      'FIRE_HELLFIRE_SPITTER',
      'FIRE_PARTMOLE_FLAME_LIZARD',
      'FIRE_FREEDONIAN_WANDERER',
    ],
  },
  {
    id: 'COMING_SOON',
    name: 'Coming Soon',
    description: 'Another deck is on the way.',
    cards: [
      'FIRE_FLAME_MAGUS',
      'FIRE_HELLFIRE_SPITTER',
      'FIRE_FREEDONIAN_WANDERER',
      'FIRE_PARTMOLE_FLAME_LIZARD',
      'FIRE_GREAT_MINOS',
      'FIRE_FLAME_ASCETIC',
      'FIRE_TRICEPTAUR_BEHEMOTH',
      'FIRE_PURSUER_OF_SAINT_DHEES',
      'FIRE_FLAME_MAGUS',
      'FIRE_HELLFIRE_SPITTER',
      'FIRE_PARTMOLE_FLAME_LIZARD',
      'FIRE_FREEDONIAN_WANDERER',
      'RAISE_STONE',
      'SPELL_PARMTETIC_HOLY_FEAST',
      'SPELL_PARMTETIC_HOLY_FEAST',
      'SPELL_GOGHLIE_ALTAR',
      'SPELL_BEGUILING_FOG',
      'SPELL_CLARE_WILS_BANNER',
      'SPELL_SUMMONER_MESMERS_ERRAND',
      'SPELL_FISSURES_OF_GOGHLIE',
    ],
  },
  {
    id: 'FIRE_LOCK_TEST',
    name: 'Fire Lock Test',
    description: 'New fire units and fieldquake spells.',
    cards: [
      'FIRE_PARTMOLE_FLAME_GUARD',
      'FIRE_LESSER_GRANVENOA',
      'FIRE_PARTMOLE_FIRE_ORACLE',
      'FIRE_INFERNAL_SCIONDAR_DRAGON',
      'FIRE_DIDI_THE_ENLIGHTENED',
      'SPELL_FISSURES_OF_GOGHLIE',
      'SPELL_FISSURES_OF_GOGHLIE',
    ],
  },
];

const STORAGE_KEY = 'customDecks';
const listeners = new Set();

function toCardObject(id) {
  const card = CARDS[id];
  return card || null;
}

function deserializeDeckInternal(raw) {
  const normalized = normalizeDeckInput(raw || {});
  const id = normalized.id || generateDeckId('DECK');
  const createdAt = normalized.createdAt || new Date().toISOString();
  const updatedAt = normalized.updatedAt || createdAt;
  const cards = normalized.cards.map(toCardObject).filter(Boolean);
  return {
    id,
    name: normalized.name || 'Untitled',
    description: normalized.description || '',
    cards,
    version: normalized.version > 0 ? normalized.version : 1,
    createdAt,
    updatedAt,
    ownerId: normalized.ownerId || null,
  };
}

function serializeDeckInternal(deck) {
  return {
    id: deck.id,
    name: deck.name,
    description: deck.description || '',
    cards: (deck.cards || []).map(card => (typeof card === 'string' ? card : card?.id)).filter(Boolean),
    version: Number(deck.version) || 1,
    createdAt: deck.createdAt || new Date().toISOString(),
    updatedAt: deck.updatedAt || new Date().toISOString(),
    ownerId: deck.ownerId || null,
  };
}

function cloneDeck(deck) {
  return {
    ...deck,
    cards: [...(deck.cards || [])],
  };
}

let deckList = RAW_DECKS.map(deserializeDeckInternal);
export let DECKS = deckList;

function notify() {
  const snapshot = getDecks();
  listeners.forEach(listener => {
    try { listener(snapshot); } catch (err) { console.warn('[decks] Ошибка обработчика подписки', err); }
  });
}

function commit(newDecks, { skipPersist } = {}) {
  deckList = newDecks.map(cloneDeck);
  DECKS = deckList;
  if (!skipPersist) saveDecks();
  notify();
  return getDecks();
}

export function getDecks() {
  return deckList.map(cloneDeck);
}

export function getDeckById(id) {
  const deck = deckList.find(d => d.id === id);
  return deck ? cloneDeck(deck) : null;
}

export function subscribeToDecks(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function replaceDecksFromSerialized(serializedDecks, options = {}) {
  if (!Array.isArray(serializedDecks)) return getDecks();
  if (!serializedDecks.length && !options.allowEmpty) return getDecks();
  const normalized = serializedDecks.map(deserializeDeckInternal);
  return commit(normalized, options);
}

export function upsertSerializedDeck(serializedDeck, options = {}) {
  if (!serializedDeck) return null;
  const normalized = deserializeDeckInternal(serializedDeck);
  const idx = deckList.findIndex(d => d.id === normalized.id);
  const next = [...deckList];
  if (idx >= 0) next[idx] = normalized; else next.push(normalized);
  commit(next, options);
  return cloneDeck(normalized);
}

export function addDeck(deck, options = {}) {
  const normalized = deserializeDeckInternal(deck);
  commit([...deckList, normalized], options);
  return cloneDeck(normalized);
}

export function updateDeck(id, patch, options = {}) {
  const idx = deckList.findIndex(d => d.id === id);
  if (idx < 0) return null;
  const base = serializeDeckInternal(deckList[idx]);
  const normalized = deserializeDeckInternal({ ...base, ...patch, id });
  const next = [...deckList];
  next[idx] = normalized;
  commit(next, options);
  return cloneDeck(normalized);
}

export function removeDeck(id, options = {}) {
  const next = deckList.filter(d => d.id !== id);
  if (next.length === deckList.length) return null;
  commit(next, options);
  return getDecks();
}

export function saveDecks() {
  if (typeof localStorage === 'undefined') return;
  try {
    const payload = deckList.map(serializeDeckInternal);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn('[decks] Не удалось сохранить колоды', err);
  }
}

export function loadDecksFromStorage() {
  if (typeof localStorage === 'undefined') return getDecks();
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(raw) && raw.length) {
      return replaceDecksFromSerialized(raw, { skipPersist: true, allowEmpty: true });
    }
  } catch (err) {
    console.warn('[decks] Не удалось прочитать localStorage', err);
  }
  return getDecks();
}

export function serializeDeck(deck) {
  return serializeDeckInternal(deck);
}

export function deserializeDeck(serializedDeck) {
  return deserializeDeckInternal(serializedDeck);
}

export function getDefaultDeckCards() {
  const first = deckList[0];
  return first ? [...first.cards] : [];
}

const api = {
  getDecks,
  getDeckById,
  subscribeToDecks,
  addDeck,
  updateDeck,
  removeDeck,
  replaceDecksFromSerialized,
  upsertSerializedDeck,
  saveDecks,
  loadDecksFromStorage,
  serializeDeck,
  deserializeDeck,
  getDefaultDeckCards,
};

try {
  loadDecksFromStorage();
} catch {}

try {
  if (typeof window !== 'undefined') {
    window.__deckStore = api;
  }
} catch {}

export default api;

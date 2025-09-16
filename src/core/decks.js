// Структурированное описание всех доступных колод и операции с ними.
// Вся логика остаётся чистой и не зависит от DOM, чтобы её можно было перенести в Unity.
import { CARDS } from './cards.js';

const LOCAL_STORAGE_KEY = 'customDecks';

// Список колод с перечислением карт по ID (фолбэк на случай отсутствия бэкенда).
const RAW_DECKS = [
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
      // временно повторяем стартовую колоду
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

function resolveCardId(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value.id) return value.id;
  return null;
}

function expandToObjects(cardIds) {
  return cardIds
    .map(id => CARDS[id])
    .filter(Boolean);
}

function normalizeUpdatedAt(raw) {
  const input = raw?.updatedAt || raw?.updated_at;
  if (!input) return null;
  const dt = new Date(input);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

function hydrateDeck(raw = {}, prev = null) {
  const idCandidate = (typeof raw.id === 'string' && raw.id.trim()) ? raw.id.trim() : null;
  const id = idCandidate ?? prev?.id ?? `deck_${Date.now()}`;
  const name = typeof raw.name === 'string' && raw.name.trim()
    ? raw.name.trim()
    : (prev?.name ?? 'Untitled');
  const description = typeof raw.description === 'string'
    ? raw.description.trim()
    : (prev?.description ?? '');

  const sourceCards = Array.isArray(raw.cards) && raw.cards.length
    ? raw.cards
    : (prev?.cardIds ?? prev?.cards?.map(resolveCardId) ?? []);
  const cardIds = sourceCards
    .map(resolveCardId)
    .filter(Boolean);
  const cards = expandToObjects(cardIds);

  const versionCandidate = Number(raw.version);
  const prevVersion = Number(prev?.version);
  const version = Number.isFinite(versionCandidate)
    ? versionCandidate
    : (Number.isFinite(prevVersion) ? prevVersion : 1);
  const updatedAt = normalizeUpdatedAt(raw) ?? prev?.updatedAt ?? null;
  const ownerId = raw.ownerId ?? raw.owner_id ?? prev?.ownerId ?? null;

  return {
    id,
    name,
    description,
    cards,
    cardIds,
    version,
    updatedAt,
    ownerId: ownerId || null,
  };
}

let DECKS = RAW_DECKS.map(d => hydrateDeck(d));
const listeners = new Set();

function syncWindow() {
  try { if (typeof window !== 'undefined') window.DECKS = DECKS; } catch {}
}

function emitChange() {
  syncWindow();
  listeners.forEach(fn => {
    try { fn([...DECKS]); } catch {}
  });
}

function persistLocal(decks = DECKS) {
  try {
    const payload = decks.map(toSerializableDeck);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(payload));
    }
  } catch {}
}

function loadFromLocalStorage() {
  try {
    if (typeof localStorage === 'undefined') return;
    const saved = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY));
    if (Array.isArray(saved) && saved.length) {
      DECKS = saved.map(d => hydrateDeck(d));
      emitChange();
    }
  } catch {}
}

loadFromLocalStorage();
if (!DECKS.length) {
  DECKS = RAW_DECKS.map(d => hydrateDeck(d));
}
emitChange();

export const getDecks = () => DECKS;

export function toSerializableDeck(deck) {
  if (!deck) return null;
  const cardIds = Array.isArray(deck.cardIds) && deck.cardIds.length
    ? [...deck.cardIds]
    : (Array.isArray(deck.cards) ? deck.cards.map(resolveCardId).filter(Boolean) : []);
  return {
    id: deck.id,
    name: deck.name,
    description: deck.description || '',
    cards: cardIds,
    version: Number.isFinite(deck.version) ? Number(deck.version) : null,
    ownerId: deck.ownerId ?? null,
    updatedAt: deck.updatedAt || null,
  };
}

export function saveDecks() {
  persistLocal();
}

export function addDeck(deck) {
  const normalized = hydrateDeck(deck);
  DECKS.push(normalized);
  persistLocal();
  emitChange();
  return normalized;
}

export function updateDeck(id, data) {
  const idx = DECKS.findIndex(d => d.id === id);
  if (idx < 0) return null;
  const merged = hydrateDeck({ ...DECKS[idx], ...data }, DECKS[idx]);
  DECKS[idx] = merged;
  persistLocal();
  emitChange();
  return merged;
}

export function removeDeck(id) {
  const idx = DECKS.findIndex(d => d.id === id);
  if (idx < 0) return false;
  DECKS.splice(idx, 1);
  persistLocal();
  emitChange();
  return true;
}

export function replaceDecksFromRemote(rawDecks = [], { persist = true } = {}) {
  if (Array.isArray(rawDecks) && rawDecks.length) {
    DECKS = rawDecks.map(d => hydrateDeck(d));
  } else {
    DECKS = RAW_DECKS.map(d => hydrateDeck(d));
  }
  if (persist) persistLocal();
  emitChange();
  return DECKS;
}

export function upsertDeckFromRemote(rawDeck, { persist = true } = {}) {
  const normalized = hydrateDeck(rawDeck);
  const idx = DECKS.findIndex(d => d.id === normalized.id);
  if (idx >= 0) {
    DECKS[idx] = normalized;
  } else {
    DECKS.push(normalized);
  }
  if (persist) persistLocal();
  emitChange();
  return normalized;
}

export function subscribe(listener) {
  if (typeof listener === 'function') {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }
  return () => {};
}

export function getDeckById(id) {
  return DECKS.find(d => d.id === id) || null;
}

const api = {
  DECKS,
  getDecks,
  addDeck,
  updateDeck,
  removeDeck,
  saveDecks,
  replaceDecksFromRemote,
  upsertDeckFromRemote,
  toSerializableDeck,
  subscribe,
  getDeckById,
};

try {
  if (typeof window !== 'undefined') {
    window.DECKS = DECKS;
  }
} catch {}

export { DECKS };
export default api;

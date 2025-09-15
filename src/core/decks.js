// Структурированное описание всех доступных колод
// Каждая колода задаётся списком ID карт, которые затем разворачиваются в объекты
import { CARDS } from './cards.js';

// Список колод с перечислением карт по ID
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
      "SPELL_SUMMONER_MESMERS_ERRAND",
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
      "SPELL_SUMMONER_MESMERS_ERRAND",
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
      "SPELL_SUMMONER_MESMERS_ERRAND",
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

// Преобразуем ID карт в сами объекты карт
function expand(ids) {
  return ids.map(id => CARDS[id]).filter(Boolean);
}

// Текущий список колод. Делается let, чтобы можно было модифицировать в рантайме.
export let DECKS = RAW_DECKS.map(d => ({ ...d, cards: expand(d.cards) }));

// Сохраняем колоды в localStorage
export function saveDecks() {
  try {
    const payload = DECKS.map(d => ({ ...d, cards: d.cards.map(c => c.id) }));
    localStorage.setItem('customDecks', JSON.stringify(payload));
  } catch {}
}

// Пытаемся загрузить сохранённые колоды
try {
  const saved = JSON.parse(localStorage.getItem('customDecks'));
  if (Array.isArray(saved) && saved.length) {
    DECKS = saved.map(d => ({ ...d, cards: expand(d.cards || []) }));
  }
} catch {}

export function addDeck(deck) {
  DECKS.push(deck);
  saveDecks();
}

export function updateDeck(id, data) {
  const idx = DECKS.findIndex(d => d.id === id);
  if (idx >= 0) {
    DECKS[idx] = { ...DECKS[idx], ...data };
    saveDecks();
  }
}

export function removeDeck(id) {
  const idx = DECKS.findIndex(d => d.id === id);
  if (idx >= 0) {
    DECKS.splice(idx, 1);
    saveDecks();
  }
}

const api = { DECKS, addDeck, updateDeck, removeDeck, saveDecks };
try {
  if (typeof window !== 'undefined') { window.DECKS = DECKS; }
} catch {}
export default api;

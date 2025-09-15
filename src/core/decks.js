// Структурированное описание всех доступных колод
// Каждая колода задаётся списком ID карт и может редактироваться на клиенте
// В перспективе данные будут храниться в БД, но пока используем localStorage
import { CARDS } from './cards.js';

// Базовый набор колод по умолчанию (неизменяемый)
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

// Преобразуем массив ID в сами объекты карт
function expand(ids) {
  return (ids || []).map(id => CARDS[id]).filter(Boolean);
}

// Текущий список колод (мутабельный массив, чтобы ссылки сохранялись)
export const DECKS = [];

// Загрузка пользовательских колод из localStorage
function loadUserDecks() {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = JSON.parse(localStorage.getItem('userDecks') || '[]');
    return raw.map(d => ({ ...d, cards: expand(d.cards) }));
  } catch {
    return [];
  }
}

// Сохранение пользовательских колод в localStorage
function saveUserDecks() {
  if (typeof localStorage === 'undefined') return;
  try {
    const baseIds = new Set(RAW_DECKS.map(d => d.id));
    const userDecks = DECKS
      .filter(d => !baseIds.has(d.id))
      .map(d => ({ id: d.id, name: d.name, description: d.description, cards: d.cards.map(c => c.id) }));
    localStorage.setItem('userDecks', JSON.stringify(userDecks));
  } catch {}
}

// Полная перезагрузка списка колод
export function loadDecks() {
  DECKS.length = 0;
  RAW_DECKS.forEach(d => DECKS.push({ ...d, cards: expand(d.cards) }));
  loadUserDecks().forEach(d => DECKS.push(d));
}

// Добавление новой колоды
export function addDeck(deck) {
  DECKS.push({ ...deck, cards: expand(deck.cards) });
  saveUserDecks();
}

// Обновление существующей колоды
export function updateDeck(id, deck) {
  const idx = DECKS.findIndex(d => d.id === id);
  if (idx !== -1) {
    DECKS[idx] = { ...DECKS[idx], ...deck, cards: expand(deck.cards || DECKS[idx].cards.map(c => c.id)) };
    saveUserDecks();
  }
}

// Удаление колоды
export function deleteDeck(id) {
  const idx = DECKS.findIndex(d => d.id === id);
  if (idx !== -1) {
    DECKS.splice(idx, 1);
    saveUserDecks();
  }
}

// При первом подключении загружаем все колоды
loadDecks();

// API для использования в других модулях
const api = { DECKS, loadDecks, addDeck, updateDeck, deleteDeck };
try {
  if (typeof window !== 'undefined') {
    window.DECKS = DECKS;
    window.deckManager = api;
  }
} catch {}

export default api;

// Списки колод и состав каждой из них
import { CARDS } from './cards.js';

// Вспомогательный конструктор: по массиву ID возвращает карточные объекты
function makeDeck(id, name, description, cardIds) {
  return {
    id,
    name,
    description,
    cardIds,
    // Превращаем ID в объекты карт при инициализации
    cards: cardIds.map(cid => CARDS[cid]).filter(Boolean),
  };
}

// Стартовый набор огненных заклинаний и существ
const FIRE_STARTER_IDS = [
  'FIRE_FLAME_MAGUS',
  'FIRE_HELLFIRE_SPITTER',
  'FIRE_FREEDONIAN',
  'FIRE_FLAME_LIZARD',
  'FIRE_GREAT_MINOS',
  'FIRE_FLAME_ASCETIC',
  'FIRE_TRICEPTAUR',
  'FIRE_PURSUER',
  'FIRE_FLAME_MAGUS',
  'FIRE_HELLFIRE_SPITTER',
  'FIRE_FLAME_LIZARD',
  'FIRE_FREEDONIAN',
  'RAISE_STONE',
  'SPELL_PARMTETIC_HOLY_FEAST',
  'SPELL_PARMTETIC_HOLY_FEAST',
  'SPELL_GOGHLIE_ALTAR',
  'SPELL_BEGUILING_FOG',
  'SPELL_CLARE_WILS_BANNER',
  'SPELL_SUMMONER_MESMERS_ERRAND',
  'SPELL_FISSURES_OF_GOGHLIE',
];

// Колода без заклинаний — только существа
const BEAST_HORDE_IDS = [
  'FIRE_FLAME_MAGUS',
  'FIRE_HELLFIRE_SPITTER',
  'FIRE_FREEDONIAN',
  'FIRE_FLAME_LIZARD',
  'FIRE_GREAT_MINOS',
  'FIRE_FLAME_ASCETIC',
  'FIRE_TRICEPTAUR',
  'FIRE_PURSUER',
  'FIRE_FLAME_MAGUS',
  'FIRE_HELLFIRE_SPITTER',
  'FIRE_FLAME_LIZARD',
  'FIRE_FREEDONIAN',
];

// Пока что вторая колода повторяет стартовую
const ARCANE_MIX_IDS = FIRE_STARTER_IDS.slice();
const COMING_SOON_IDS = FIRE_STARTER_IDS.slice();

export const DECKS = [
  makeDeck('FIRE_STARTER', 'Fire Awakening', 'Baseline set of fiery spells and units.', FIRE_STARTER_IDS),
  makeDeck('ARCANE_MIX', 'Arcane Arsenal', 'Balanced mix of creatures and tricks.', ARCANE_MIX_IDS),
  makeDeck('BEAST_HORDE', 'Beast Horde', 'All creature rush with no spells.', BEAST_HORDE_IDS),
  makeDeck('COMING_SOON', 'Coming Soon', 'Another deck is on the way.', COMING_SOON_IDS),
];

export function getDeckCards(id) {
  const deck = DECKS.find(d => d.id === id);
  return deck ? deck.cards.slice() : [];
}

export const STARTER_FIRESET = getDeckCards('FIRE_STARTER');

const api = { DECKS, getDeckCards };
try {
  if (typeof window !== 'undefined') {
    window.DECKS = DECKS;
    window.getDeckCards = getDeckCards;
    window.STARTER_FIRESET = STARTER_FIRESET;
  }
} catch {}
export default api;

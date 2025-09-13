// Определение всех колод и их составов
import { CARDS } from './cards.js';

// Помощник: превращает список id карт в массив объектов карт
function build(ids) {
  return ids.map(id => CARDS[id]).filter(Boolean);
}

// Базовая колода со спеллами
const FIRE_AWAKENING_IDS = [
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

// Пока что вторая колода дублирует первую
const ARCANE_ARSENAL_IDS = [...FIRE_AWAKENING_IDS];

// Колода только из существ
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
  'FIRE_FLAME_MAGUS',
  'FIRE_HELLFIRE_SPITTER',
  'FIRE_FLAME_LIZARD',
  'FIRE_FREEDONIAN',
  'FIRE_GREAT_MINOS',
  'FIRE_FLAME_ASCETIC',
  'FIRE_TRICEPTAUR',
  'FIRE_PURSUER',
];

// Сборка фактических колод
const FIRE_AWAKENING = build(FIRE_AWAKENING_IDS);
const ARCANE_ARSENAL = build(ARCANE_ARSENAL_IDS);
const BEAST_HORDE = build(BEAST_HORDE_IDS);
const COMING_SOON = FIRE_AWAKENING;

export const DECKS = [
  {
    id: 'FIRE_STARTER',
    name: 'Fire Awakening',
    description: 'Baseline set of fiery spells and units.',
    cards: FIRE_AWAKENING,
  },
  {
    id: 'ARCANE_MIX',
    name: 'Arcane Arsenal',
    description: 'Balanced mix of creatures and tricks.',
    cards: ARCANE_ARSENAL,
  },
  {
    id: 'BEAST_HORDE',
    name: 'Beast Horde',
    description: 'All creature rush with no spells.',
    cards: BEAST_HORDE,
  },
  {
    id: 'COMING_SOON',
    name: 'Coming Soon',
    description: 'Another deck is on the way.',
    cards: COMING_SOON,
  },
];

// Колода по умолчанию — первая
export const DEFAULT_DECK = FIRE_AWAKENING;

const api = { DECKS, DEFAULT_DECK };
try {
  if (typeof window !== 'undefined') {
    window.DECKS = DECKS;
    window.DEFAULT_DECK = DEFAULT_DECK;
  }
} catch {}
export default api;

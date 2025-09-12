// Определение доступных колод
// Каждая колода включает id, имя, описание и список карт

import { CARDS, STARTER_FIRESET } from './cards.js';

// Колода, состоящая только из существ — без заклинаний
const CREATURE_ONLY = [
  CARDS.FIRE_FLAME_MAGUS,
  CARDS.FIRE_HELLFIRE_SPITTER,
  CARDS.FIRE_FREEDONIAN,
  CARDS.FIRE_FLAME_LIZARD,
  CARDS.FIRE_GREAT_MINOS,
  CARDS.FIRE_FLAME_ASCETIC,
  CARDS.FIRE_TRICEPTAUR,
  CARDS.FIRE_PURSUER,
  CARDS.FIRE_FLAME_MAGUS,
  CARDS.FIRE_HELLFIRE_SPITTER,
  CARDS.FIRE_FLAME_LIZARD,
  CARDS.FIRE_FREEDONIAN,
].filter(Boolean);

// Экспериментальная колода — пока использует стартовый набор
const ARCANE_MIX = STARTER_FIRESET.slice();

export const DECKS = [
  {
    id: 'FIRE_STARTER',
    name: 'Fire Awakening',
    description: 'Baseline set of fiery spells and units.',
    cards: STARTER_FIRESET,
  },
  {
    id: 'ARCANE_MIX',
    name: 'Arcane Arsenal',
    description: 'Balanced mix of creatures and tricks.',
    cards: ARCANE_MIX,
  },
  {
    id: 'BEAST_HORDE',
    name: 'Beast Horde',
    description: 'All creature rush with no spells.',
    cards: CREATURE_ONLY,
  },
  {
    id: 'COMING_SOON',
    name: 'Coming Soon',
    description: 'Another deck is on the way.',
    cards: STARTER_FIRESET,
  },
];

const api = { DECKS };
try { if (typeof window !== 'undefined') { window.DECKS = DECKS; } } catch {}
export default api;

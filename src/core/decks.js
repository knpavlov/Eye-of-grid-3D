// Определение доступных колод
// Каждая колода включает id, имя, описание и список карт

import { STARTER_FIRESET, CARDS } from './cards.js';

export const DECKS = [
  {
    id: 'FIRE_STARTER',
    name: 'Fire Awakening',
    description: 'Starter mix of fiery spells and creatures.',
    cards: STARTER_FIRESET,
  },
  {
    id: 'BLAZE_RUSH',
    name: 'Blaze Rush',
    description: 'Aggressive deck with extra creatures.',
    // немного изменённый набор карт
    cards: [
      CARDS.FIRE_FLAME_MAGUS,
      CARDS.FIRE_FLAME_MAGUS,
      CARDS.FIRE_HELLFIRE_SPITTER,
      CARDS.FIRE_HELLFIRE_SPITTER,
      CARDS.FIRE_FREEDONIAN,
      CARDS.FIRE_FREEDONIAN,
      CARDS.FIRE_FLAME_LIZARD,
      CARDS.FIRE_FLAME_LIZARD,
      CARDS.FIRE_GREAT_MINOS,
      CARDS.FIRE_FLAME_ASCETIC,
      CARDS.FIRE_TRICEPTAUR,
      CARDS.FIRE_PURSUER,
      CARDS.RAISE_STONE,
      CARDS.SPELL_CLARE_WILS_BANNER,
      CARDS.SPELL_SUMMONER_MESMERS_ERRAND,
      CARDS.SPELL_FISSURES_OF_GOGHLIE,
      CARDS.SPELL_BEGUILING_FOG,
      CARDS.SPELL_PARMTETIC_HOLY_FEAST,
      CARDS.SPELL_PARMTETIC_HOLY_FEAST,
      CARDS.SPELL_GOGHLIE_ALTAR,
    ].filter(Boolean),
  },
  {
    id: 'PURE_BEASTS',
    name: 'Pure Beasts',
    description: 'Creature-only build with no spells.',
    cards: STARTER_FIRESET.filter(c => c.type === 'UNIT'),
  },
  {
    id: 'SPELLFIRE_STORM',
    name: 'Spellfire Storm',
    description: 'Experimental list packed with conjurations.',
    cards: [
      CARDS.RAISE_STONE,
      CARDS.SPELL_FISSURES_OF_GOGHLIE,
      CARDS.SPELL_BEGUILING_FOG,
      CARDS.SPELL_CLARE_WILS_BANNER,
      CARDS.SPELL_SUMMONER_MESMERS_ERRAND,
      CARDS.SPELL_GOGHLIE_ALTAR,
      CARDS.SPELL_PARMTETIC_HOLY_FEAST,
      CARDS.SPELL_PARMTETIC_HOLY_FEAST,
      CARDS.SPELL_FISSURES_OF_GOGHLIE,
      CARDS.SPELL_BEGUILING_FOG,
      CARDS.SPELL_SUMMONER_MESMERS_ERRAND,
      CARDS.SPELL_CLARE_WILS_BANNER,
      CARDS.SPELL_GOGHLIE_ALTAR,
      CARDS.RAISE_STONE,
      CARDS.SPELL_PARMTETIC_HOLY_FEAST,
      CARDS.SPELL_FISSURES_OF_GOGHLIE,
      CARDS.SPELL_BEGUILING_FOG,
      CARDS.SPELL_SUMMONER_MESMERS_ERRAND,
      CARDS.SPELL_CLARE_WILS_BANNER,
      CARDS.SPELL_GOGHLIE_ALTAR,
    ].filter(Boolean),
  },
];

const api = { DECKS };
try { if (typeof window !== 'undefined') { window.DECKS = DECKS; } } catch {}
export default api;

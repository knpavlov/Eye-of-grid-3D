// Определение доступных колод
// Каждая колода включает id, имя, описание и список карт

import { STARTER_FIRESET, BLAZING_TRIAL_SET, CREATURES_ONLY_SET, ARCANE_GAMBIT_SET } from './cards.js';

export const DECKS = [
  {
    id: 'FIRE_STARTER',
    name: 'Fire Awakening',
    description: 'A basic mix of fire spells and units.',
    cards: STARTER_FIRESET,
  },
  {
    id: 'BLAZING_TRIAL',
    name: 'Blazing Trial',
    description: 'Aggressive flames with light spell support.',
    cards: BLAZING_TRIAL_SET,
  },
  {
    id: 'CREATURE_SWARM',
    name: 'Creature Swarm',
    description: 'All creatures, no spells.',
    cards: CREATURES_ONLY_SET,
  },
  {
    id: 'ARCANE_GAMBIT',
    name: 'Arcane Gambit',
    description: 'Experimental spell-heavy deck.',
    cards: ARCANE_GAMBIT_SET,
  },
];

const api = { DECKS };
try { if (typeof window !== 'undefined') { window.DECKS = DECKS; } } catch {}
export default api;

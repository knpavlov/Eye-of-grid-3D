// Определение доступных колод
// Каждая колода включает id, имя, описание и список карт

import { STARTER_FIRESET } from './cards.js';

export const DECKS = [
  {
    id: 'FIRE_STARTER',
    name: 'Огненное пробуждение',
    description: 'Базовый набор огненных заклинаний и существ.',
    cards: STARTER_FIRESET,
  },
  {
    id: 'PLACEHOLDER_2',
    name: 'Заготовка 2',
    description: 'В разработке — скоро здесь появится колода.',
    cards: STARTER_FIRESET,
  },
  {
    id: 'PLACEHOLDER_3',
    name: 'Заготовка 3',
    description: 'Ещё одна будущая колода.',
    cards: STARTER_FIRESET,
  },
];

const api = { DECKS };
try { if (typeof window !== 'undefined') { window.DECKS = DECKS; } } catch {}
export default api;

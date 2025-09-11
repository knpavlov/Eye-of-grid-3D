// Описание доступных колод
// Каждая колода: id, name, desc, cards[]
import { CARDS, STARTER_FIRESET } from './cards.js';

// Первая колода — реальная
const DECK_FIRE_START = {
  id: 'fire-starter',
  name: 'Огненное пробуждение',
  desc: 'Быстрая агрессия и немного магии.',
  cards: STARTER_FIRESET,
};

// Заглушки для будущих колод
const DECK_PLACEHOLDER_1 = {
  id: 'placeholder-1',
  name: 'Колода грядущего',
  desc: 'Здесь скоро появится новая стратегия.',
  cards: [CARDS.FIRE_FLAME_MAGUS],
};

const DECK_PLACEHOLDER_2 = {
  id: 'placeholder-2',
  name: 'Тайны в разработке',
  desc: 'Разработчики работают над этим набором.',
  cards: [CARDS.FIRE_FLAME_MAGUS],
};

export const DECKS = [DECK_FIRE_START, DECK_PLACEHOLDER_1, DECK_PLACEHOLDER_2];
export const DEFAULT_DECK_ID = DECK_FIRE_START.id;

export function getDeckById(id) {
  return DECKS.find(d => d.id === id) || DECK_FIRE_START;
}

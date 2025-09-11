// Определения доступных колод
// Каждая колода содержит id, имя, описание и список карт
import { STARTER_FIRESET, CARDS } from './cards.js';

// Функция для выбора самой дорогой карты колоды
export function getDeckCoverCard(deck) {
  // Определяем максимальную стоимость карты в колоде
  const maxCost = Math.max(...deck.cards.map(c => c.cost || 0));
  // Отбираем все карты с этой стоимостью
  const candidates = deck.cards.filter(c => (c.cost || 0) === maxCost);
  // Если несколько карт — выбираем случайную
  return candidates[Math.floor(Math.random() * candidates.length)];
}

// Список колод; позже сюда можно добавлять новые записи
export const DECKS = [
  {
    id: 'starter-fire',
    name: 'Пламенный натиск',
    description: 'Агрессивная колода огня для быстрого старта.',
    cards: STARTER_FIRESET,
  },
  {
    id: 'placeholder-2',
    name: 'Заготовка 2',
    description: 'Скоро будет доступна новая стратегия.',
    cards: STARTER_FIRESET,
  },
  {
    id: 'placeholder-3',
    name: 'Заготовка 3',
    description: 'Ещё одна будущая колода.',
    cards: STARTER_FIRESET,
  },
];

// Экспортируем карты для удобства (может пригодиться при динамическом добавлении)
export { CARDS };

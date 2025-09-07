/**
 * Индексы карт в руке, которые временно скрываются (например, для анимаций).
 */
export const pendingHideHandCards = [];

/** Задать список скрываемых индексов. */
export function setPendingHideHandCards(indices) {
  pendingHideHandCards.length = 0;
  if (Array.isArray(indices)) pendingHideHandCards.push(...indices);
}

/** Очистить список скрываемых карт. */
export function clearPendingHideHandCards() {
  pendingHideHandCards.length = 0;
}

// Совместимость со старым глобальным кодом
try {
  if (typeof window !== 'undefined') window.PENDING_HIDE_HAND_CARDS = pendingHideHandCards;
} catch {}

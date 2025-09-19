// Утилиты для последовательного воспроизведения анимаций добора карт
// Сосредоточены только на визуальной части, чтобы в будущем их можно было перенести в отдельный UI-слой
export async function playDrawEvents(drawEvents, options = {}) {
  const list = Array.isArray(drawEvents) ? drawEvents.filter(Boolean) : [];
  if (!list.length) return;

  const animateCard = typeof options.animateCard === 'function'
    ? options.animateCard
    : (typeof window !== 'undefined' ? window.animateDrawnCardToHand : null);
  const updateHand = typeof options.updateHand === 'function'
    ? options.updateHand
    : (typeof window !== 'undefined' ? window.updateHand : null);
  const logFn = typeof options.log === 'function'
    ? options.log
    : (typeof window !== 'undefined' ? window.addLog : null);
  const stateRef = options.state ?? (typeof window !== 'undefined' ? window.gameState : undefined);
  const defaultSource = options.sourceName || null;

  for (const draw of list) {
    const cards = Array.isArray(draw.cards) ? draw.cards.filter(Boolean) : [];
    for (const cardTpl of cards) {
      if (typeof animateCard !== 'function') break;
      try {
        await animateCard(cardTpl);
      } catch (err) {
        console.warn('[drawEvents] Ошибка анимации добора', err);
      }
    }
    if (cards.length > 0 && typeof logFn === 'function') {
      const label = draw.sourceName || defaultSource;
      const amount = draw.amount ?? cards.length;
      const message = label
        ? `${label}: добор ${amount} карт(ы).`
        : `Добор ${amount} карт(ы).`;
      try { logFn(message); } catch (err) { console.warn('[drawEvents] Не удалось записать лог', err); }
    }
  }

  if (typeof updateHand === 'function') {
    try {
      await updateHand(stateRef);
    } catch (err) {
      console.warn('[drawEvents] Не удалось обновить руку после добора', err);
    }
  }
}

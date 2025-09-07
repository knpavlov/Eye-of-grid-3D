// Отложенный перерисовщик карт и юнитов
export function requestCardsRedraw() {
  clearTimeout(window.__cardsRedrawT);
  window.__cardsRedrawT = setTimeout(() => {
    try { window.updateUnits?.(); } catch {}
    try { window.updateHand?.(); } catch {}
  }, 10);
}

const api = { requestCardsRedraw };
try { if (typeof window !== 'undefined') {
  window.requestCardsRedraw = requestCardsRedraw;
  window.__ui = window.__ui || {};
  window.__ui.redraw = api;
} } catch {}

export default api;

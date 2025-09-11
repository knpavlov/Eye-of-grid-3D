// Принудительное ограничение размера руки
import { interactionState } from '../scene/interactions.js';
import { discardHandCard } from '../scene/discard.js';

/**
 * Заставляет игрока сбросить лишние карты, пока в руке не останется limit.
 * Возвращает Promise, который завершается после окончания сбросов.
 * @param {object} player - объект игрока из gameState.
 * @param {number} [limit=7] - максимальный размер руки.
 */
export function enforceHandLimit(player, limit = 7) {
  return new Promise(resolve => {
    if (!player) { resolve(); return; }
    const w = typeof window !== 'undefined' ? window : {};

    function step() {
      const excess = (player.hand?.length || 0) - limit;
      if (excess <= 0) {
        try { w.__ui?.panels?.hidePrompt(); } catch {}
        resolve();
        return;
      }
      const msg = `Выберите карту для сброса (лишних: ${excess})`;
      try {
        w.__ui?.panels?.showPrompt(msg, () => {
          discardHandCard(player, 0);
          setTimeout(step, 0);
        });
      } catch {}
      interactionState.pendingDiscardSelection = {
        force: true,
        onPicked: idx => { discardHandCard(player, idx); setTimeout(step, 0); },
      };
    }

    step();
  });
}

const api = { enforceHandLimit };
try { if (typeof window !== 'undefined') { window.__ui = window.__ui || {}; window.__ui.handLimit = api; } } catch {}
export default api;

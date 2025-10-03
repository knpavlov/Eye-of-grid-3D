// Помощник для ограничения размера руки
import { interactionState } from '../scene/interactions.js';
import { discardHandCard } from '../scene/discard.js';

/**
 * Запрашивает у игрока сброс лишних карт до указанного лимита.
 * @param {object} player - объект игрока из gameState.
 * @param {number} [limit=7] - максимальное число карт в руке.
 */
export async function enforceHandLimit(player, limit = 7) {
  if (typeof window === 'undefined' || !player) return;
  const w = window;
  while ((player.hand?.length || 0) > limit) {
    const need = player.hand.length - limit;
    // Вызываем промпт без возможности отмены
    w.__ui?.panels?.showPrompt?.(`Сбросьте ${need} карт(ы)`, null, false);
    await new Promise(resolve => {
      interactionState.pendingDiscardSelection = {
        forced: true,
        ignoreSummoningLock: true,
        onPicked: handIdx => {
          discardHandCard(player, handIdx);
          // синхронизация с сервером, чтобы он знал о сбросе карты
          try { w.schedulePush?.('forced-discard', { force: true }); } catch {}
          interactionState.pendingDiscardSelection = null;
          resolve();
        }
      };
    });
  }
  w.__ui?.panels?.hidePrompt?.();
}

const api = { enforceHandLimit };
try { if (typeof window !== 'undefined') window.enforceHandLimit = enforceHandLimit; } catch {}
export default api;

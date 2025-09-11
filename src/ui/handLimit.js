// Проверка и соблюдение лимита карт в руке
import { discardHandCard } from '../scene/discard.js';
import { interactionState } from '../scene/interactions.js';

/**
 * Предлагает игроку сбрасывать лишние карты до заданного лимита.
 * @param {object} gameState - текущее состояние игры.
 * @param {number} limit - максимально допустимое число карт.
 * @returns {Promise<boolean>} - true, если лимит соблюдён; false при отмене.
 */
export async function enforceHandLimit(gameState, limit = 7) {
  if (typeof window === 'undefined') return true;
  const w = window;
  const pl = gameState?.players?.[gameState.active];
  if (!pl) return true;

  while (pl.hand.length > limit) {
    const excess = pl.hand.length - limit;
    const msg = excess === 1
      ? 'В руке больше 7 карт. Выберите карту для сброса.'
      : `В руке больше 7 карт. Сбросьте ${excess} карты.`;
    const canceled = await new Promise(resolve => {
      w.__ui?.panels?.showPrompt(msg, () => {
        w.__ui?.panels?.hidePrompt();
        interactionState.pendingDiscardSelection = null;
        resolve(true);
      });
      interactionState.pendingDiscardSelection = {
        onPicked: idx => {
          discardHandCard(pl, idx);
          w.__ui?.panels?.hidePrompt();
          interactionState.pendingDiscardSelection = null;
          w.updateHand?.(gameState);
          w.updateUI?.(gameState);
          resolve(false);
        },
      };
    });
    if (canceled) return false;
  }
  return true;
}

export default { enforceHandLimit };

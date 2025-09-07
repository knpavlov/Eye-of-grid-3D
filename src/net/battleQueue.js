/**
 * Очереди отложенных анимаций боя и контратак.
 */
export const pendingBattleAnims = [];
export const pendingRetaliations = [];

/** Полностью очистить очереди. */
export function clearBattleQueues() {
  pendingBattleAnims.length = 0;
  pendingRetaliations.length = 0;
}

// Делаем доступным из консоли для отладки
try {
  if (typeof window !== 'undefined') {
    window.PENDING_BATTLE_ANIMS = pendingBattleAnims;
    window.PENDING_RETALIATIONS = pendingRetaliations;
  }
} catch {}

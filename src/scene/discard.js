// Универсальные функции для сброса карты в кладбище с анимацией
import { getCtx } from './context.js';
import { updateHand } from './hand.js';

/**
 * Универсально сбрасывает карту в кладбище с эффектом растворения.
 * @param {object} player - объект игрока.
 * @param {object} cardTpl - шаблон карты.
 * @param {object} [mesh] - соответствующий 3D-меш для анимации.
 */
export function discardCard(player, cardTpl, mesh) {
  if (!player || !cardTpl) return;

  // Перемещение карты в кладбище
  try {
    player.graveyard = Array.isArray(player.graveyard) ? player.graveyard : [];
    player.graveyard.push(cardTpl);
  } catch {}

  // Анимация исчезновения при наличии меша
  if (mesh) {
    try { mesh.userData.isInHand = false; } catch {}
    const ctx = getCtx();
    const THREE = ctx.THREE || (typeof window !== 'undefined' ? window.THREE : undefined);
    if (THREE) {
      window.__fx?.dissolveAndAsh(mesh, new THREE.Vector3(0, 0.6, 0), 0.9);
    }
  }
}

/**
 * Сбрасывает карту из руки игрока и применяет анимацию.
 * @param {object} player - объект игрока из gameState.
 * @param {number} handIdx - индекс карты в руке.
 * @returns {object|null} - шаблон сброшенной карты или null.
 */
export function discardHandCard(player, handIdx) {
  if (!player || typeof handIdx !== 'number' || handIdx < 0) return null;
  const cardTpl = player.hand?.[handIdx];
  if (!cardTpl) return null;

  // Удаляем карту из руки
  try { player.hand.splice(handIdx, 1); } catch {}

  // Ищем меш и запускаем универсальный дискард
  let mesh = null;
  try {
    const ctx = getCtx();
    mesh = ctx.handCardMeshes?.find(m => m.userData?.handIndex === handIdx);
  } catch {}
  discardCard(player, cardTpl, mesh);

  // Обновляем визуализацию руки
  try { updateHand(window.gameState); } catch {}

  return cardTpl;
}

const api = { discardCard, discardHandCard };
try { if (typeof window !== 'undefined') window.__discard = api; } catch {}
export default api;

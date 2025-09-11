// Универсальная функция для сброса карты из руки в кладбище с анимацией
import { getCtx } from './context.js';
import { updateHand } from './hand.js';

/**
 * Сбрасывает карту из руки игрока в кладбище.
 * @param {object} player - объект игрока из gameState.
 * @param {number} handIdx - индекс карты в руке.
 * @returns {object|null} - шаблон сброшенной карты или null, если сброс не удался.
 */
export function discardHandCard(player, handIdx) {
  if (!player || typeof handIdx !== 'number' || handIdx < 0) return null;
  const cardTpl = player.hand?.[handIdx];
  if (!cardTpl) return null;

  // Перемещаем карту в кладбище
  try {
    player.graveyard = Array.isArray(player.graveyard) ? player.graveyard : [];
    player.graveyard.push(cardTpl);
  } catch {}

  // Удаляем карту из руки
  try { player.hand.splice(handIdx, 1); } catch {}

  // Анимация исчезновения карты из руки
  try {
    const ctx = getCtx();
    const mesh = ctx.handCardMeshes?.find(m => m.userData?.handIndex === handIdx);
    if (mesh) {
      try { mesh.userData.isInHand = false; } catch {}
      dissolveMesh(mesh);
    }
  } catch {}

  // Обновляем визуализацию руки
  try { updateHand(window.gameState); } catch {}

  return cardTpl;
}

/**
 * Универсальный шейдерный эффект растворения, пригодный для любых объектов.
 * @param {THREE.Object3D} mesh - цель для эффекта.
 * @param {THREE.Vector3} [offset] - смещение точки происхождения эффекта.
 * @param {number} [duration] - длительность анимации.
 */
export function dissolveMesh(mesh, offset, duration = 0.9) {
  try {
    const ctx = getCtx();
    const THREE = ctx.THREE || (typeof window !== 'undefined' ? window.THREE : undefined);
    if (!mesh || !THREE) return;
    const off = offset || new THREE.Vector3(0, 0.6, 0);
    window.__fx?.dissolveAndAsh(mesh, off, duration);
  } catch {}
}

const api = { discardHandCard, dissolveMesh };
try { if (typeof window !== 'undefined') window.__discard = api; } catch {}

export default api;

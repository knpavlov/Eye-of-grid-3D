// Универсальная функция для сброса карты из руки в кладбище с анимацией
import { getCtx } from './context.js';
import { updateHand } from './hand.js';
import { applyHandDiscard } from '../core/abilityHandlers/discard.js';

/**
 * Универсальная анимация "растворения" меша.
 * Позволяет переиспользовать эффект для любых объектов.
 * @param {object} mesh - трёхмерный объект, который нужно растворить.
 * @param {object} [awayVec] - направление смещения пепла.
 * @param {number} [duration] - длительность эффекта в секундах.
 */
export function discardMesh(mesh, awayVec, duration = 0.9) {
  try {
    const ctx = getCtx();
    const THREE = ctx.THREE || (typeof window !== 'undefined' ? window.THREE : undefined);
    if (!mesh || !THREE) return;
    window.__fx?.dissolveAndAsh(mesh, awayVec || new THREE.Vector3(0, 0.6, 0), duration);
    setTimeout(() => { try { mesh.parent?.remove(mesh); } catch {} }, duration * 1000 + 50);
  } catch {}
}

/**
 * Сбрасывает карту из руки игрока в кладбище.
 * @param {object} player - объект игрока из gameState.
 * @param {number} handIdx - индекс карты в руке.
 * @returns {object|null} - шаблон сброшенной карты или null, если сброс не удался.
 */
export function discardHandCard(player, handIdx) {
  if (!player || typeof handIdx !== 'number' || handIdx < 0) return null;
  const cardTpl = applyHandDiscard(player, handIdx);
  if (!cardTpl) return null;

  // Анимация исчезновения карты из руки
  try {
    const ctx = getCtx();
    const mesh = ctx.handCardMeshes?.find(m => m.userData?.handIndex === handIdx);
    if (mesh) {
      try { mesh.userData.isInHand = false; } catch {}
      discardMesh(mesh);
    }
  } catch {}

  // Обновляем визуализацию руки
  try { updateHand(window.gameState); } catch {}

  return cardTpl;
}

const api = { discardHandCard, discardMesh };
try { if (typeof window !== 'undefined') window.__discard = api; } catch {}

export default api;

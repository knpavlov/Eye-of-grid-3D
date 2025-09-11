// Универсальная функция для сброса карты из руки в кладбище с анимацией
import { getCtx } from './context.js';
import { updateHand } from './hand.js';

/**
 * Универсально применяет эффект исчезновения к переданному мешу.
 * Можно использовать как для карт в руке, так и для существ на поле.
 * @param {THREE.Object3D} mesh - объект, который нужно "растворить".
 * @param {THREE.Vector3} [awayVec=new THREE.Vector3(0, 0.6, 0)] - направление вылета пепла.
 */
export function discardMesh(mesh, awayVec) {
  try {
    if (!mesh) return;
    const ctx = getCtx();
    const THREE = ctx.THREE || (typeof window !== 'undefined' ? window.THREE : undefined);
    if (!THREE) return;
    const vec = awayVec || new THREE.Vector3(0, 0.6, 0);
    window.__fx?.dissolveAndAsh(mesh, vec, 0.9);
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
  const cardTpl = player.hand?.[handIdx];
  if (!cardTpl) return null;

  // Перемещение карты в кладбище
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

// Утилиты для сброса карт из руки
import { getCtx } from '../scene/context.js';

/**
 * Сбрасывает карту из руки игрока с анимацией.
 * @param {Object} player - объект игрока
 * @param {number} handIdx - индекс карты в руке
 * @param {Object} opts - дополнительные опции
 * @param {('graveyard'|'discard')} opts.to - куда помещать карту
 * @param {boolean} opts.skipAnim - пропустить анимацию
 * @returns {Object|null} возвращает шаблон сброшенной карты
 */
export function discardFromHand(player, handIdx, opts = {}) {
  if (!player || !Array.isArray(player.hand)) return null;
  const { to = 'graveyard', skipAnim = false } = opts;
  const tpl = player.hand[handIdx];
  if (!tpl) return null;

  const { handCardMeshes, THREE } = getCtx();
  const mesh = handCardMeshes.find(m => m.userData?.handIndex === handIdx);
  if (mesh && !skipAnim) {
    try { mesh.userData.isInHand = false; } catch {}
    try { window.__fx?.dissolveAndAsh(mesh, new THREE.Vector3(0, 0.6, 0), 0.9); } catch {}
  }

  player.hand.splice(handIdx, 1);
  try {
    if (!player[to]) player[to] = [];
    player[to].push(tpl);
  } catch {}
  return tpl;
}

export default { discardFromHand };

// Общие функции для сброса карт из руки
import { getCtx } from '../scene/context.js';

// Сбрасывает карту из руки игрока в указанное место (по умолчанию в кладбище)
// и воспроизводит анимацию исчезновения карты.
export function discardHandCard(player, handIndex, pile = 'graveyard') {
  try {
    if (!player || typeof handIndex !== 'number') return null;
    const card = player.hand?.[handIndex];
    if (!card) return null;
    const ctx = getCtx();
    const mesh = ctx?.handCardMeshes?.find(m => m.userData?.handIndex === handIndex);
    if (mesh) {
      try { mesh.userData.isInHand = false; } catch {}
      try { window.__fx?.dissolveAndAsh(mesh, new window.THREE.Vector3(0, 0.6, 0), 0.9); } catch {}
    }
    try { (player[pile] = player[pile] || []).push(card); } catch {}
    player.hand.splice(handIndex, 1);
    try { if (typeof window.updateHand === 'function') window.updateHand(); } catch {}
    return card;
  } catch {
    return null;
  }
}

const api = { discardHandCard };
try {
  if (typeof window !== 'undefined') {
    window.__ui = window.__ui || {};
    window.__ui.discard = api;
  }
} catch {}

export default api;

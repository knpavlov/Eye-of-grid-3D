// Utility helpers for spell casting to reduce duplication in index.html
// These functions rely on existing globals to interact with scene and state.

export function spendAndDiscardSpell(player, handIndex) {
  try {
    if (!player || typeof handIndex !== 'number') return null;
    const card = player.hand?.[handIndex];
    if (!card) return null;
    player.mana -= card.cost || 0;
    try { player.discard.push(card); } catch {}
    player.hand.splice(handIndex, 1);
    return card;
  } catch {
    return null;
  }
}

// «Принесение карты Оку» — карта покидает игру после розыгрыша
export function offerSpellToEye(player, handIndex) {
  try {
    if (!player || typeof handIndex !== 'number') return null;
    const card = player.hand?.[handIndex];
    if (!card) return null;
    player.mana -= card.cost || 0;
    player.hand.splice(handIndex, 1);
    try {
      player.offeredToEye = Array.isArray(player.offeredToEye) ? player.offeredToEye : [];
      player.offeredToEye.push(card);
    } catch {}
    return card;
  } catch {
    return null;
  }
}

export function burnSpellCard(tpl, tileMesh, cardMesh) {
  try {
    if (typeof window === 'undefined' || !tpl) return;
    const createCard3D = window.__cards?.createCard3D;
    const THREE = window.THREE;
    const boardGroup = window.boardGroup;
    const scene = window.scene || window.__scene?.getCtx()?.scene;
    if (!createCard3D || !THREE || !(boardGroup || scene)) return;
    const big = createCard3D(tpl, false);
    const pos = tileMesh
      ? tileMesh.position.clone().add(new THREE.Vector3(0, 1.0, 0))
      : new THREE.Vector3(0, 1.0, 0);
    big.position.copy(pos);
    (boardGroup || scene).add(big);
    try { window.__fx?.dissolveAndAsh(big, new THREE.Vector3(0, 0.6, 0), 0.9); } catch {}
    try { if (cardMesh) cardMesh.visible = false; } catch {}
    try { window.spellDragHandled = true; } catch {}
  } catch {}
}

const api = { spendAndDiscardSpell, offerSpellToEye, burnSpellCard };
try { if (typeof window !== 'undefined') { window.__ui = window.__ui || {}; window.__ui.spellUtils = api; } } catch {}
export default api;

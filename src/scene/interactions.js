import { getCtx } from './context.js';

// Pointer and drag interactions for cards and units
// Uses window-scoped state variables for compatibility.

function onMouseMove(event) {
  const ctx = getCtx();
  const { renderer, raycaster, camera, mouse, tileMeshes, handCardMeshes, unitMeshes } = ctx;
  if (!renderer) return;
  try {
    if (window.isInputLocked && window.isInputLocked()) return;
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    if (window.draggedCard) {
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(tileMeshes.flat());
      if (window.hoveredTile) {
        window.hoveredTile.material.emissiveIntensity = 0.1;
      }
      if (intersects.length > 0) {
        window.hoveredTile = intersects[0].object;
        window.hoveredTile.material.emissiveIntensity = 0.3;
        const targetPos = window.hoveredTile.position.clone();
        targetPos.y = 2;
        window.gsap?.to(window.draggedCard.position, {
          x: targetPos.x,
          y: targetPos.y,
          z: targetPos.z,
          duration: 0.1,
        });
      } else {
        window.hoveredTile = null;
      }
    } else {
      raycaster.setFromCamera(mouse, camera);
      const handHits = window.drawAnimationActive ? [] : raycaster.intersectObjects(handCardMeshes, true);
      const newHover = handHits.length > 0 ? (handHits[0].object.userData?.isInHand ? handHits[0].object : handHits[0].object.parent) : null;
      if (window.hoveredHandCard && window.hoveredHandCard !== newHover) {
        window.gsap?.to(window.hoveredHandCard.scale, { x: 0.54, y: 1, z: 0.54, duration: 0.18 });
        if (typeof window.setHandCardHoverVisual === 'function') window.setHandCardHoverVisual(window.hoveredHandCard, false);
        window.hoveredHandCard = null;
      }
      if (newHover && newHover.userData && newHover.userData.isInHand) {
        window.hoveredHandCard = newHover;
        window.gsap?.to(newHover.scale, { x: 0.675, y: 1, z: 0.675, duration: 0.18 });
        if (typeof window.setHandCardHoverVisual === 'function') window.setHandCardHoverVisual(newHover, true);
      }
    }
    if (window.selectedUnit) {
      const r = window.selectedUnit.userData.row; const c = window.selectedUnit.userData.col;
      const hits = typeof window.computeHits === 'function' ? window.computeHits(window.gameState, r, c) : [];
      for (const h of hits) {
        const m = unitMeshes.find(m => m.userData.row === h.r && m.userData.col === h.c);
        if (m) window.gsap?.to(m.position, { y: 0.7, yoyo: true, repeat: 1, duration: 0.2 });
      }
    }
    raycaster.setFromCamera(mouse, camera);
    const metaHits = raycaster.intersectObjects([... (window.deckMeshes||[]), ...(window.graveyardMeshes||[])], true);
    const tip = document.getElementById('hover-tooltip');
    if (metaHits.length > 0) {
      const obj = metaHits[0].object;
      const data = obj.userData || obj.parent?.userData || {};
      if (data && data.metaType) {
        const p = data.player ?? 0;
        window.hoveredMeta = { metaType: data.metaType, player: p };
        if (tip) {
          const deckCount = window.gameState?.players?.[p]?.deck?.length ?? 0;
          const gyCount = window.gameState?.players?.[p]?.graveyard?.length ?? 0;
          tip.textContent = data.metaType === 'deck' ? `Deck - Player ${p===0? '1':'2'}: ${deckCount}` : `Graveyard - Player ${p===0? '1':'2'}: ${gyCount}`;
          tip.style.left = (event.clientX + 16) + 'px';
          tip.style.top = (event.clientY + 16) + 'px';
          tip.classList.remove('hidden');
        }
      }
    } else {
      window.hoveredMeta = null;
      if (tip) tip.classList.add('hidden');
    }
  } catch {}
}

function onMouseDown(event) {
  const ctx = getCtx();
  const { renderer, raycaster, camera, mouse, handCardMeshes, unitMeshes } = ctx;
  if (!window.gameState || window.gameState.winner !== null) return;
  try { if (window.isInputLocked && window.isInputLocked()) return; } catch {}
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const handIntersects = raycaster.intersectObjects(handCardMeshes, true);
  if (handIntersects.length > 0) {
    const hitObj = handIntersects[0].object;
    const card = hitObj.userData?.isInHand ? hitObj : hitObj.parent;
    const cardData = card.userData.cardData;
    if (window.pendingDiscardSelection && cardData && cardData.type === (window.pendingDiscardSelection.requiredType || cardData.type)) {
      const handIdx = card.userData.handIndex;
      try { window.pendingDiscardSelection.onPicked(handIdx); } catch {}
      window.pendingDiscardSelection = null;
      return;
    }
    if (cardData.type === 'UNIT' || cardData.type === 'SPELL') {
      startCardDrag(card);
    }
    return;
  }
  const unitIntersects = raycaster.intersectObjects(unitMeshes, true);
  if (unitIntersects.length > 0) {
    let unit = unitIntersects[0].object;
    while (unit && (!unit.userData || unit.userData.type !== 'unit')) unit = unit.parent;
    if (!unit) return;
    if (window.magicFrom) {
      if (typeof window.performMagicAttack === 'function') window.performMagicAttack(window.magicFrom, unit);
      window.magicFrom = null;
      return;
    }
    if (window.selectedCard && window.selectedCard.userData.cardData.type === 'SPELL') {
      if (typeof window.castSpellOnUnit === 'function') window.castSpellOnUnit(window.selectedCard, unit);
    } else if (unit.userData.unitData.owner === window.gameState.active) {
      window.selectedUnit = unit;
      try { window.__ui?.panels?.showUnitActionPanel(unit); } catch {}
    }
    return;
  }
  if (window.selectedCard) {
    resetCardSelection();
  }
  if (window.pendingDiscardSelection) {
    try { window.__ui?.panels?.hidePrompt(); } catch {}
    window.pendingDiscardSelection = null;
    if (window.draggedCard && window.draggedCard.userData?.cardData?.type === 'SPELL') {
      returnCardToHand(window.draggedCard);
    }
  }
}

function onMouseUp(event) {
  const ctx = getCtx();
  const { renderer, raycaster, camera, mouse, unitMeshes } = ctx;
  if (window.isInputLocked && window.isInputLocked()) { endCardDrag(); return; }
  if (window.draggedCard) {
    const cardData = window.draggedCard.userData.cardData;
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const unitIntersects = raycaster.intersectObjects(unitMeshes, true);
    let unitMesh = null;
    if (unitIntersects.length > 0) {
      let u = unitIntersects[0].object;
      while (u && (!u.userData || u.userData.type !== 'unit')) u = u.parent;
      unitMesh = u;
    }
    if (cardData.type === 'SPELL') {
      try { window.castSpellByDrag(window.draggedCard, unitMesh, window.hoveredTile); } catch {}
      if (!window.spellDragHandled) {
        returnCardToHand(window.draggedCard);
      }
      window.spellDragHandled = false;
    } else if (cardData.type === 'UNIT') {
      if (window.hoveredTile) {
        const row = window.hoveredTile.userData.row;
        const col = window.hoveredTile.userData.col;
        if (window.gameState.board[row][col].unit) {
          window.showNotification?.('Cell is already occupied!', 'error');
          returnCardToHand(window.draggedCard);
        } else {
          window.pendingPlacement = {
            card: window.draggedCard,
            row,
            col,
            handIndex: window.draggedCard.userData.handIndex,
          };
          try { window.__ui?.panels?.showOrientationPanel(); } catch {}
        }
      } else {
        returnCardToHand(window.draggedCard);
      }
    }
    endCardDrag();
    return;
  }
  endCardDrag();
}

function startCardDrag(card) {
  window.draggedCard = card;
  if (window.hoveredHandCard) {
    window.gsap?.to(window.hoveredHandCard.scale, { x: 0.54, y: 1, z: 0.54, duration: 0.1 });
    if (typeof window.setHandCardHoverVisual === 'function') window.setHandCardHoverVisual(window.hoveredHandCard, false);
    window.hoveredHandCard = null;
  }
  window.gsap?.to(card.position, {
    y: card.position.y + 1,
    duration: 0.2,
    ease: 'power2.out',
  });
  window.gsap?.to(card.rotation, { x: 0, z: 0, duration: 0.2 });
  window.gsap?.to(card.scale, { x: 1.1, y: 1.1, z: 1.1, duration: 0.2 });
}

function endCardDrag() {
  if (window.hoveredTile) {
    window.hoveredTile.material.emissiveIntensity = 0.1;
    window.hoveredTile = null;
  }
  window.draggedCard = null;
}

function returnCardToHand(card) {
  if (!card) return;
  window.gsap?.to(card.position, {
    x: card.userData.originalPosition.x,
    y: card.userData.originalPosition.y,
    z: card.userData.originalPosition.z,
    duration: 0.3,
    ease: 'power2.inOut',
  });
  window.gsap?.to(card.rotation, {
    x: card.userData.originalRotation.x,
    y: card.userData.originalRotation.y,
    z: card.userData.originalRotation.z,
    duration: 0.3,
  });
  window.gsap?.to(card.scale, {
    x: card.userData && card.userData.isInHand ? 0.54 : 1,
    y: 1,
    z: card.userData && card.userData.isInHand ? 0.54 : 1,
    duration: 0.3,
  });
}

function resetCardSelection() {
  if (window.selectedCard) {
    returnCardToHand(window.selectedCard);
    try {
      window.selectedCard.material[2].emissive = new window.THREE.Color(0x000000);
      window.selectedCard.material[2].emissiveIntensity = 0;
    } catch {}
    window.selectedCard = null;
  }
}

function attachPointerHandlers() {
  const { renderer } = getCtx();
  if (!renderer) return;
  const el = renderer.domElement;
  el.addEventListener('mousemove', onMouseMove);
  el.addEventListener('mousedown', onMouseDown);
  el.addEventListener('mouseup', onMouseUp);
  el.addEventListener('mouseleave', () => {
    if (window.hoveredHandCard) {
      window.gsap?.to(window.hoveredHandCard.scale, { x: 0.54, y: 1, z: 0.54, duration: 0.18 });
      if (typeof window.setHandCardHoverVisual === 'function') window.setHandCardHoverVisual(window.hoveredHandCard, false);
      window.hoveredHandCard = null;
    }
  });
}

const api = { onMouseMove, onMouseDown, onMouseUp, startCardDrag, endCardDrag, returnCardToHand, resetCardSelection, attachPointerHandlers };
try {
  if (typeof window !== 'undefined') {
    window.__scene = window.__scene || {};
    window.__scene.interactions = api;
    Object.assign(window, { onMouseMove, onMouseDown, onMouseUp, startCardDrag, endCardDrag, returnCardToHand, resetCardSelection });
  }
} catch {}

export default api;

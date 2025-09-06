// Pointer and drag interactions for 3D scene
// Extracted from inline script in index.html for modular reuse

let draggedCard = null;
let hoveredTile = null;
let hoveredHandCard = null;
let hoveredMeta = null;
let deckMeshes = [];
let graveyardMeshes = [];

// Allow other modules to update meta objects for tooltip support
export function setMetaMeshes(decks, graves) {
  deckMeshes = decks || [];
  graveyardMeshes = graves || [];
}
export function getMetaMeshes() {
  return { deckMeshes, graveyardMeshes };
}

function onMouseMove(event) {
  const { renderer, raycaster, camera, mouse, tileMeshes, handCardMeshes, unitMeshes, gameState, computeHits } = window;
  if (!renderer || !raycaster || !camera || !mouse) return;
  if (typeof window.isInputLocked === 'function' && window.isInputLocked()) return;
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  if (draggedCard) {
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(tileMeshes.flat());
    if (hoveredTile) hoveredTile.material.emissiveIntensity = 0.1;
    if (intersects.length > 0) {
      hoveredTile = intersects[0].object;
      hoveredTile.material.emissiveIntensity = 0.3;
      const targetPos = hoveredTile.position.clone();
      targetPos.y = 2;
      gsap.to(draggedCard.position, { x: targetPos.x, y: targetPos.y, z: targetPos.z, duration: 0.1 });
    } else {
      hoveredTile = null;
    }
  } else {
    raycaster.setFromCamera(mouse, camera);
    const handHits = window.drawAnimationActive ? [] : raycaster.intersectObjects(handCardMeshes, true);
    const newHover = handHits.length > 0 ? (handHits[0].object.userData?.isInHand ? handHits[0].object : handHits[0].object.parent) : null;
    if (hoveredHandCard && hoveredHandCard !== newHover) {
      gsap.to(hoveredHandCard.scale, { x: 0.54, y: 1, z: 0.54, duration: 0.18 });
      try { window.__hand?.setHandCardHoverVisual(hoveredHandCard, false); } catch {}
      hoveredHandCard = null;
    }
    if (newHover && newHover.userData && newHover.userData.isInHand) {
      hoveredHandCard = newHover;
      gsap.to(newHover.scale, { x: 0.675, y: 1, z: 0.675, duration: 0.18 });
      try { window.__hand?.setHandCardHoverVisual(newHover, true); } catch {}
    }
  }

  if (window.selectedUnit) {
    const r = window.selectedUnit.userData.row; const c = window.selectedUnit.userData.col;
    const hits = typeof computeHits === 'function' ? computeHits(gameState, r, c) : [];
    for (const h of hits) {
      const m = unitMeshes.find(m => m.userData.row === h.r && m.userData.col === h.c);
      if (m) gsap.to(m.position, { y: 0.7, yoyo: true, repeat: 1, duration: 0.2 });
    }
  }

  raycaster.setFromCamera(mouse, camera);
  const metaHits = raycaster.intersectObjects([...deckMeshes, ...graveyardMeshes], true);
  const tip = document.getElementById('hover-tooltip');
  if (metaHits.length > 0) {
    const obj = metaHits[0].object;
    const data = obj.userData || obj.parent?.userData || {};
    if (data && data.metaType) {
      const p = data.player ?? 0;
      hoveredMeta = { metaType: data.metaType, player: p };
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
    hoveredMeta = null;
    if (tip) tip.classList.add('hidden');
  }
}

function onMouseDown(event) {
  const { renderer, raycaster, camera, mouse, handCardMeshes, unitMeshes, gameState } = window;
  if (!renderer || !raycaster || !camera || !mouse) return;
  if (!gameState || gameState.winner !== null) return;
  if (typeof window.isInputLocked === 'function' && window.isInputLocked()) return;

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
      const owner = gameState.players[gameState.active];
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
      try { window.performMagicAttack(window.magicFrom, unit); } catch {}
      window.magicFrom = null;
      return;
    }
    if (window.selectedCard && window.selectedCard.userData.cardData.type === 'SPELL') {
      try { window.castSpellOnUnit(window.selectedCard, unit); } catch {}
    } else if (unit.userData.unitData.owner === gameState.active) {
      window.selectedUnit = unit;
      try { window.__ui?.panels.showUnitActionPanel(unit); } catch {}
    }
    return;
  }

  if (window.selectedCard) {
    try { window.__ui?.game.resetCardSelection(); } catch {}
  }
  if (window.pendingDiscardSelection) {
    try { window.__ui?.panels.hidePrompt(); } catch {}
    window.pendingDiscardSelection = null;
    if (draggedCard && draggedCard.userData && draggedCard.userData.cardData && draggedCard.userData.cardData.type === 'SPELL') {
      returnCardToHand(draggedCard);
    }
  }
}

function onMouseUp(event) {
  const { renderer, raycaster, camera, mouse, unitMeshes, gameState } = window;
  if (!renderer || !raycaster || !camera || !mouse) return;
  if (typeof window.isInputLocked === 'function' && window.isInputLocked()) { endCardDrag(); return; }
  if (draggedCard) {
    const cardData = draggedCard.userData.cardData;
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
      try { window.castSpellByDrag(draggedCard, unitMesh, hoveredTile); } catch {}
      if (!window.spellDragHandled) {
        returnCardToHand(draggedCard);
      }
      window.spellDragHandled = false;
    } else if (cardData.type === 'UNIT') {
      if (hoveredTile) {
        const row = hoveredTile.userData.row;
        const col = hoveredTile.userData.col;
        if (gameState.board[row][col].unit) {
          try { window.showNotification('Cell is already occupied!', 'error'); } catch {}
          returnCardToHand(draggedCard);
        } else {
          window.pendingPlacement = {
            card: draggedCard,
            row,
            col,
            handIndex: draggedCard.userData.handIndex,
          };
          try { window.__ui?.panels.showOrientationPanel(); } catch {}
        }
      } else {
        returnCardToHand(draggedCard);
      }
    }
    endCardDrag();
    return;
  }
  endCardDrag();
}

function onMouseLeave() {
  if (hoveredHandCard) {
    gsap.to(hoveredHandCard.scale, { x: 0.54, y: 1, z: 0.54, duration: 0.18 });
    try { window.__hand?.setHandCardHoverVisual(hoveredHandCard, false); } catch {}
    hoveredHandCard = null;
  }
}

function startCardDrag(card) {
  draggedCard = card;
  if (hoveredHandCard) {
    gsap.to(hoveredHandCard.scale, { x: 0.54, y: 1, z: 0.54, duration: 0.1 });
    try { window.__hand?.setHandCardHoverVisual(hoveredHandCard, false); } catch {}
    hoveredHandCard = null;
  }
  gsap.to(card.position, { y: card.position.y + 1, duration: 0.2, ease: 'power2.out' });
  gsap.to(card.rotation, { x: 0, z: 0, duration: 0.2 });
  gsap.to(card.scale, { x: 1.1, y: 1.1, z: 1.1, duration: 0.2 });
}

function endCardDrag() {
  if (hoveredTile) {
    hoveredTile.material.emissiveIntensity = 0.1;
    hoveredTile = null;
  }
  draggedCard = null;
}

function returnCardToHand(card) {
  gsap.to(card.position, {
    x: card.userData.originalPosition.x,
    y: card.userData.originalPosition.y,
    z: card.userData.originalPosition.z,
    duration: 0.3,
    ease: 'power2.inOut',
  });
  gsap.to(card.rotation, {
    x: card.userData.originalRotation.x,
    y: card.userData.originalRotation.y,
    z: card.userData.originalRotation.z,
    duration: 0.3,
  });
  gsap.to(card.scale, {
    x: card.userData && card.userData.isInHand ? 0.54 : 1,
    y: 1,
    z: card.userData && card.userData.isInHand ? 0.54 : 1,
    duration: 0.3,
  });
}

export function attach(renderer) {
  if (!renderer) return;
  renderer.domElement.addEventListener('mousemove', onMouseMove);
  renderer.domElement.addEventListener('mousedown', onMouseDown);
  renderer.domElement.addEventListener('mouseup', onMouseUp);
  renderer.domElement.addEventListener('mouseleave', onMouseLeave);
}

export const state = {
  get draggedCard() { return draggedCard; },
  get hoveredTile() { return hoveredTile; },
  get hoveredHandCard() { return hoveredHandCard; },
  get hoveredMeta() { return hoveredMeta; },
};

export { onMouseMove, onMouseDown, onMouseUp, startCardDrag, endCardDrag, returnCardToHand };

try {
  if (typeof window !== 'undefined') {
    window.__scene = window.__scene || {};
    window.__scene.interactions = {
      attach,
      startCardDrag,
      endCardDrag,
      returnCardToHand,
      setMetaMeshes,
      getMetaMeshes,
      state,
    };
  }
} catch {}

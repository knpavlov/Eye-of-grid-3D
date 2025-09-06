// UI interaction and drag/drop handlers extracted from index.html
// Relies on global state exposed on window to minimize coupling.

export function onMouseMove(event) {
  const w = window;
  if (w.isInputLocked && w.isInputLocked()) return;
  const rect = w.renderer.domElement.getBoundingClientRect();
  w.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  w.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  if (w.draggedCard) {
    w.raycaster.setFromCamera(w.mouse, w.camera);
    const intersects = w.raycaster.intersectObjects(w.tileMeshes.flat());

    if (w.hoveredTile) {
      w.hoveredTile.material.emissiveIntensity = 0.1;
    }

    if (intersects.length > 0) {
      w.hoveredTile = intersects[0].object;
      w.hoveredTile.material.emissiveIntensity = 0.3;

      const targetPos = w.hoveredTile.position.clone();
      targetPos.y = 2;
      w.gsap.to(w.draggedCard.position, {
        x: targetPos.x,
        y: targetPos.y,
        z: targetPos.z,
        duration: 0.1
      });
    } else {
      w.hoveredTile = null;
    }
  } else {
    w.raycaster.setFromCamera(w.mouse, w.camera);
    const handHits = w.drawAnimationActive ? [] : w.raycaster.intersectObjects(w.handCardMeshes, true);
    const newHover = handHits.length > 0 ? (handHits[0].object.userData?.isInHand ? handHits[0].object : handHits[0].object.parent) : null;
    if (w.hoveredHandCard && w.hoveredHandCard !== newHover) {
      w.gsap.to(w.hoveredHandCard.scale, { x: 0.54, y: 1, z: 0.54, duration: 0.18 });
      w.setHandCardHoverVisual && w.setHandCardHoverVisual(w.hoveredHandCard, false);
      w.hoveredHandCard = null;
    }
    if (newHover && newHover.userData && newHover.userData.isInHand) {
      w.hoveredHandCard = newHover;
      w.gsap.to(newHover.scale, { x: 0.675, y: 1, z: 0.675, duration: 0.18 });
      w.setHandCardHoverVisual && w.setHandCardHoverVisual(newHover, true);
    }
  }

  if (w.selectedUnit) {
    const r = w.selectedUnit.userData.row; const c = w.selectedUnit.userData.col;
    const hits = w.computeHits ? w.computeHits(w.gameState, r, c) : [];
    w.unitMeshes.forEach(m => { if (m.material && m.material[2]) { } });
    for (const h of hits) {
      const m = w.unitMeshes.find(m => m.userData.row === h.r && m.userData.col === h.c);
      if (m) w.gsap.to(m.position, { y: 0.7, yoyo: true, repeat: 1, duration: 0.2 });
    }
  }

  {
    w.raycaster.setFromCamera(w.mouse, w.camera);
    const metaHits = w.raycaster.intersectObjects([...(w.deckMeshes || []), ...(w.graveyardMeshes || [])], true);
    const tip = document.getElementById('hover-tooltip');
    if (metaHits.length > 0) {
      const obj = metaHits[0].object;
      const data = obj.userData || obj.parent?.userData || {};
      if (data && data.metaType) {
        const p = data.player ?? 0;
        w.hoveredMeta = { metaType: data.metaType, player: p };
        if (tip) {
          const deckCount = w.gameState?.players?.[p]?.deck?.length ?? 0;
          const gyCount = w.gameState?.players?.[p]?.graveyard?.length ?? 0;
          tip.textContent = data.metaType === 'deck' ? `Deck - Player ${p===0? '1':'2'}: ${deckCount}` : `Graveyard - Player ${p===0? '1':'2'}: ${gyCount}`;
          tip.style.left = (event.clientX + 16) + 'px';
          tip.style.top = (event.clientY + 16) + 'px';
          tip.classList.remove('hidden');
        }
      }
    } else {
      w.hoveredMeta = null;
      const tipEl = document.getElementById('hover-tooltip');
      if (tipEl) tipEl.classList.add('hidden');
    }
  }
}

export function onMouseDown(event) {
  const w = window;
  if (!w.gameState || w.gameState.winner !== null) return;
  if (w.isInputLocked && w.isInputLocked()) return;

  const rect = w.renderer.domElement.getBoundingClientRect();
  w.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  w.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  w.raycaster.setFromCamera(w.mouse, w.camera);

  const handIntersects = w.raycaster.intersectObjects(w.handCardMeshes, true);
  if (handIntersects.length > 0) {
    const hitObj = handIntersects[0].object;
    const card = hitObj.userData?.isInHand ? hitObj : hitObj.parent;
    const cardData = card.userData.cardData;
    if (w.pendingDiscardSelection && cardData && cardData.type === (w.pendingDiscardSelection.requiredType || cardData.type)) {
      const owner = w.gameState.players[w.gameState.active];
      const handIdx = card.userData.handIndex;
      try { w.pendingDiscardSelection.onPicked(handIdx); } catch (e) { console.error(e); }
      w.pendingDiscardSelection = null;
      return;
    }
    if (cardData.type === 'UNIT' || cardData.type === 'SPELL') {
      startCardDrag(card);
    }
    return;
  }

  const unitIntersects = w.raycaster.intersectObjects(w.unitMeshes, true);
  if (unitIntersects.length > 0) {
    let unit = unitIntersects[0].object;
    while (unit && (!unit.userData || unit.userData.type !== 'unit')) unit = unit.parent;
    if (!unit) return;
    if (w.magicFrom) {
      w.performMagicAttack && w.performMagicAttack(w.magicFrom, unit);
      w.magicFrom = null;
      return;
    }
    if (w.selectedCard && w.selectedCard.userData.cardData.type === 'SPELL') {
      w.castSpellOnUnit && w.castSpellOnUnit(w.selectedCard, unit);
    } else if (unit.userData.unitData.owner === w.gameState.active) {
      w.selectedUnit = unit;
      w.__ui?.panels?.showUnitActionPanel(unit);
    }
    return;
  }

  if (w.selectedCard) {
    resetCardSelection();
  }
  if (w.pendingDiscardSelection) {
    try { w.__ui?.panels?.hidePrompt(); } catch {}
    w.pendingDiscardSelection = null;
    if (w.draggedCard && w.draggedCard.userData?.cardData?.type === 'SPELL') {
      returnCardToHand(w.draggedCard);
    }
  }
}

export function onMouseUp(event) {
  const w = window;
  if (w.isInputLocked && w.isInputLocked()) { endCardDrag(); return; }
  if (w.draggedCard) {
    const cardData = w.draggedCard.userData.cardData;
    const rect = w.renderer.domElement.getBoundingClientRect();
    w.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    w.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    w.raycaster.setFromCamera(w.mouse, w.camera);
    const unitIntersects = w.raycaster.intersectObjects(w.unitMeshes, true);
    let unitMesh = null;
    if (unitIntersects.length > 0) {
      let u = unitIntersects[0].object;
      while (u && (!u.userData || u.userData.type !== 'unit')) u = u.parent;
      unitMesh = u;
    }
    if (cardData.type === 'SPELL') {
      try { w.castSpellByDrag && w.castSpellByDrag(w.draggedCard, unitMesh, w.hoveredTile); } catch {}
      if (!w.spellDragHandled) {
        returnCardToHand(w.draggedCard);
      }
      w.spellDragHandled = false;
    } else if (cardData.type === 'UNIT') {
      if (w.hoveredTile) {
        const row = w.hoveredTile.userData.row;
        const col = w.hoveredTile.userData.col;
        if (w.gameState.board[row][col].unit) {
          w.showNotification && w.showNotification('Cell is already occupied!', 'error');
          returnCardToHand(w.draggedCard);
        } else {
          w.pendingPlacement = { card: w.draggedCard, row, col, handIndex: w.draggedCard.userData.handIndex };
          w.__ui?.panels?.showOrientationPanel();
        }
      } else {
        returnCardToHand(w.draggedCard);
      }
    }
    endCardDrag();
    return;
  }
  endCardDrag();
}

export function startCardDrag(card) {
  const w = window;
  w.draggedCard = card;
  if (w.hoveredHandCard) {
    w.gsap.to(w.hoveredHandCard.scale, { x: 0.54, y: 1, z: 0.54, duration: 0.1 });
    w.setHandCardHoverVisual && w.setHandCardHoverVisual(w.hoveredHandCard, false);
    w.hoveredHandCard = null;
  }
  w.gsap.to(card.position, {
    y: card.position.y + 1,
    duration: 0.2,
    ease: 'power2.out'
  });
  w.gsap.to(card.rotation, {
    x: 0,
    z: 0,
    duration: 0.2
  });
  w.gsap.to(card.scale, {
    x: 1.1,
    y: 1.1,
    z: 1.1,
    duration: 0.2
  });
}

export function endCardDrag() {
  const w = window;
  if (w.hoveredTile) {
    w.hoveredTile.material.emissiveIntensity = 0.1;
    w.hoveredTile = null;
  }
  w.draggedCard = null;
}

export function returnCardToHand(card) {
  const w = window;
  w.gsap.to(card.position, {
    x: card.userData.originalPosition.x,
    y: card.userData.originalPosition.y,
    z: card.userData.originalPosition.z,
    duration: 0.3,
    ease: 'power2.inOut'
  });
  w.gsap.to(card.rotation, {
    x: card.userData.originalRotation.x,
    y: card.userData.originalRotation.y,
    z: card.userData.originalRotation.z,
    duration: 0.3
  });
  w.gsap.to(card.scale, {
    x: card.userData && card.userData.isInHand ? 0.54 : 1,
    y: 1,
    z: card.userData && card.userData.isInHand ? 0.54 : 1,
    duration: 0.3
  });
}

export function resetCardSelection() {
  const w = window;
  if (w.selectedCard) {
    returnCardToHand(w.selectedCard);
    try {
      w.selectedCard.material[2].emissive = new w.THREE.Color(0x000000);
      w.selectedCard.material[2].emissiveIntensity = 0;
    } catch {}
    w.selectedCard = null;
  }
}

const api = { onMouseMove, onMouseDown, onMouseUp, startCardDrag, endCardDrag, returnCardToHand, resetCardSelection };
try { if (typeof window !== 'undefined') { window.__ui = window.__ui || {}; window.__ui.interaction = api; } } catch {}
export default api;

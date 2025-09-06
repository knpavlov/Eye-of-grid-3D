// Модуль для управления указателем и перетаскиванием карт в 3D-сцене
// Извлечён из index.html для повторного использования и упрощения поддержки

const g = typeof window !== 'undefined' ? window : globalThis;

// Состояние взаимодействия
let draggedCard = null;
let hoveredTile = null;
let hoveredHandCard = null;
let selectedCard = null;

function startCardDrag(card) {
  draggedCard = card;
  // если карта была увеличена ховером — вернём к стандартному масштабу руки
  if (hoveredHandCard) {
    g.gsap.to(hoveredHandCard.scale, { x: 0.54, y: 1, z: 0.54, duration: 0.1 });
    if (typeof g.setHandCardHoverVisual === 'function') {
      g.setHandCardHoverVisual(hoveredHandCard, false);
    }
    hoveredHandCard = null;
  }

  g.gsap.to(card.position, {
    y: card.position.y + 1,
    duration: 0.2,
    ease: 'power2.out'
  });

  g.gsap.to(card.rotation, {
    x: 0,
    z: 0,
    duration: 0.2
  });

  g.gsap.to(card.scale, {
    x: 1.1,
    y: 1.1,
    z: 1.1,
    duration: 0.2
  });
}

function endCardDrag() {
  if (hoveredTile) {
    hoveredTile.material.emissiveIntensity = 0.1;
    hoveredTile = null;
  }
  draggedCard = null;
}

function returnCardToHand(card) {
  g.gsap.to(card.position, {
    x: card.userData.originalPosition.x,
    y: card.userData.originalPosition.y,
    z: card.userData.originalPosition.z,
    duration: 0.3,
    ease: 'power2.inOut'
  });

  g.gsap.to(card.rotation, {
    x: card.userData.originalRotation.x,
    y: card.userData.originalRotation.y,
    z: card.userData.originalRotation.z,
    duration: 0.3
  });

  g.gsap.to(card.scale, {
    x: card.userData && card.userData.isInHand ? 0.54 : 1,
    y: 1,
    z: card.userData && card.userData.isInHand ? 0.54 : 1,
    duration: 0.3
  });
}

function resetCardSelection() {
  if (selectedCard) {
    returnCardToHand(selectedCard);
    try {
      selectedCard.material[2].emissive = new g.THREE.Color(0x000000);
      selectedCard.material[2].emissiveIntensity = 0;
    } catch {}
    selectedCard = null;
  }
}

function onMouseMove(event) {
  if (typeof g.isInputLocked === 'function' && g.isInputLocked()) return;
  const renderer = g.renderer;
  const mouse = g.mouse;
  const raycaster = g.raycaster;
  const camera = g.camera;
  const tileMeshes = g.tileMeshes || [];
  const handCardMeshes = g.handCardMeshes || [];
  const unitMeshes = g.unitMeshes || [];
  const gameState = g.gameState;

  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  if (draggedCard) {
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(tileMeshes.flat());

    if (hoveredTile) {
      hoveredTile.material.emissiveIntensity = 0.1;
    }

    if (intersects.length > 0) {
      hoveredTile = intersects[0].object;
      hoveredTile.material.emissiveIntensity = 0.3;

      const targetPos = hoveredTile.position.clone();
      targetPos.y = 2;
      g.gsap.to(draggedCard.position, {
        x: targetPos.x,
        y: targetPos.y,
        z: targetPos.z,
        duration: 0.1
      });
    } else {
      hoveredTile = null;
    }
  } else {
    raycaster.setFromCamera(mouse, camera);
    const handHits = g.drawAnimationActive ? [] : raycaster.intersectObjects(handCardMeshes, true);
    const newHover = handHits.length > 0 ? (handHits[0].object.userData?.isInHand ? handHits[0].object : handHits[0].object.parent) : null;
    if (hoveredHandCard && hoveredHandCard !== newHover) {
      g.gsap.to(hoveredHandCard.scale, { x: 0.54, y: 1, z: 0.54, duration: 0.18 });
      if (typeof g.setHandCardHoverVisual === 'function') g.setHandCardHoverVisual(hoveredHandCard, false);
      hoveredHandCard = null;
    }
    if (newHover && newHover.userData && newHover.userData.isInHand) {
      hoveredHandCard = newHover;
      g.gsap.to(newHover.scale, { x: 0.675, y: 1, z: 0.675, duration: 0.18 });
      if (typeof g.setHandCardHoverVisual === 'function') g.setHandCardHoverVisual(newHover, true);
    }
  }

  if (g.selectedUnit) {
    const r = g.selectedUnit.userData.row;
    const c = g.selectedUnit.userData.col;
    const hits = g.computeHits(gameState, r, c);
    for (const h of hits) {
      const m = unitMeshes.find(m => m.userData.row === h.r && m.userData.col === h.c);
      if (m) g.gsap.to(m.position, { y: 0.7, yoyo: true, repeat: 1, duration: 0.2 });
    }
  }

  raycaster.setFromCamera(mouse, camera);
  const metaHits = raycaster.intersectObjects([...(g.deckMeshes || []), ...(g.graveyardMeshes || [])], true);
  const tip = g.document.getElementById('hover-tooltip');
  if (metaHits.length > 0) {
    const obj = metaHits[0].object;
    const data = obj.userData || obj.parent?.userData || {};
    if (data && data.metaType) {
      const p = data.player ?? 0;
      g.hoveredMeta = { metaType: data.metaType, player: p };
      if (tip) {
        const deckCount = gameState?.players?.[p]?.deck?.length ?? 0;
        const gyCount = gameState?.players?.[p]?.graveyard?.length ?? 0;
        tip.textContent = data.metaType === 'deck' ? `Deck - Player ${p===0? '1':'2'}: ${deckCount}` : `Graveyard - Player ${p===0? '1':'2'}: ${gyCount}`;
        tip.style.left = (event.clientX + 16) + 'px';
        tip.style.top = (event.clientY + 16) + 'px';
        tip.classList.remove('hidden');
      }
    }
  } else {
    g.hoveredMeta = null;
    if (tip) tip.classList.add('hidden');
  }
}

function onMouseDown(event) {
  if (!g.gameState || g.gameState.winner !== null) return;
  if (typeof g.isInputLocked === 'function' && g.isInputLocked()) return;
  const renderer = g.renderer;
  const raycaster = g.raycaster;
  const mouse = g.mouse;
  const camera = g.camera;
  const handCardMeshes = g.handCardMeshes || [];
  const tileMeshes = g.tileMeshes || [];
  const unitMeshes = g.unitMeshes || [];

  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects([...handCardMeshes, ...tileMeshes.flat(), ...unitMeshes], true);
  if (intersects.length === 0) {
    if (g.pendingDiscardSelection) {
      g.__ui?.panels?.hidePrompt?.();
      g.pendingDiscardSelection = null;
      if (selectedCard && selectedCard.userData?.cardData?.type === 'SPELL') {
        returnCardToHand(selectedCard);
      }
    }
    if (selectedCard) resetCardSelection();
    return;
  }

  let obj = intersects[0].object;
  while (obj && !obj.userData) obj = obj.parent;
  if (!obj || !obj.userData) return;

  if (obj.userData.isInHand) {
    startCardDrag(obj);
    return;
  }

  if (obj.userData.type === 'tile') {
    if (selectedCard && selectedCard.userData.cardData.type === 'SPELL') {
      g.castSpellOnTile(selectedCard, obj);
      return;
    }
    if (g.pendingDiscardSelection) {
      g.__ui?.panels?.hidePrompt?.();
      g.pendingDiscardSelection.onPicked?.({ type: 'TILE', row: obj.userData.row, col: obj.userData.col });
      g.pendingDiscardSelection = null;
      return;
    }
    if (g.magicFrom) {
      const unit = g.gameState.board?.[obj.userData.row]?.[obj.userData.col]?.unit;
      if (unit) {
        g.performMagicAttack(g.magicFrom, unit);
        g.magicFrom = null;
      }
      return;
    }
    if (selectedCard) resetCardSelection();
    return;
  }

  if (obj.userData.type === 'unit') {
    const unitMesh = obj;
    const unit = unitMesh.userData.unitData;
    if (selectedCard && selectedCard.userData.cardData.type === 'SPELL') {
      g.castSpellOnUnit(selectedCard, unitMesh);
    } else if (unit.owner === g.gameState.active) {
      g.selectedUnit = unitMesh;
      g.__ui?.panels?.showUnitActionPanel?.(unitMesh);
    }
    return;
  }

  if (selectedCard) resetCardSelection();
}

function onMouseUp(event) {
  if (typeof g.isInputLocked === 'function' && g.isInputLocked()) { endCardDrag(); return; }
  if (draggedCard) {
    const renderer = g.renderer;
    const camera = g.camera;
    const raycaster = g.raycaster;
    const mouse = g.mouse;
    const unitMeshes = g.unitMeshes || [];
    const gameState = g.gameState;

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
      try { g.castSpellByDrag(draggedCard, unitMesh, hoveredTile); } catch {}
      if (!g.spellDragHandled) {
        returnCardToHand(draggedCard);
      }
      g.spellDragHandled = false;
    } else if (cardData.type === 'UNIT') {
      if (hoveredTile) {
        const row = hoveredTile.userData.row;
        const col = hoveredTile.userData.col;
        if (gameState.board[row][col].unit) {
          g.showNotification('Cell is already occupied!', 'error');
          returnCardToHand(draggedCard);
        } else {
          g.__ui?.game?.startPlacement?.(draggedCard, row, col, draggedCard.userData.handIndex);
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
    g.gsap.to(hoveredHandCard.scale, { x: 0.54, y: 1, z: 0.54, duration: 0.18 });
    if (typeof g.setHandCardHoverVisual === 'function') {
      g.setHandCardHoverVisual(hoveredHandCard, false);
    }
    hoveredHandCard = null;
  }
}

export { onMouseMove, onMouseDown, onMouseUp, onMouseLeave, startCardDrag, endCardDrag, returnCardToHand, resetCardSelection };
export default { onMouseMove, onMouseDown, onMouseUp, onMouseLeave, startCardDrag, endCardDrag, returnCardToHand, resetCardSelection };


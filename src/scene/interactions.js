// Pointer and drag interaction handlers for the 3D scene
// Перенесено из index.html для изоляции и переиспользования

import { getCtx } from './context.js';
import { setHandCardHoverVisual } from './hand.js';
import { computeHits } from '../core/rules.js';

// Состояние взаимодействия
const state = {
  draggedCard: null,
  hoveredTile: null,
  hoveredHandCard: null,
  selectedCard: null,
  pendingPlacement: null,
  selectedUnit: null,
  magicFrom: null,
  pendingSpellOrientation: null,
  pendingDiscardSelection: null,
  pendingRitualBoardMesh: null,
  spellDragHandled: false,
  hoveredMeta: null,
};

function onMouseMove(event) {
  if (typeof window.isInputLocked === 'function' && window.isInputLocked()) return;
  const ctx = getCtx();
  const { renderer, camera, raycaster, mouse, tileMeshes, unitMeshes, handCardMeshes, deckMeshes, graveyardMeshes } = ctx;
  const gameState = window.gameState;
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  if (state.draggedCard) {
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(tileMeshes.flat());

    if (state.hoveredTile) {
      state.hoveredTile.material.emissiveIntensity = 0.1;
    }

    if (intersects.length > 0) {
      state.hoveredTile = intersects[0].object;
      state.hoveredTile.material.emissiveIntensity = 0.3;

      const targetPos = state.hoveredTile.position.clone();
      targetPos.y = 2;
      gsap.to(state.draggedCard.position, {
        x: targetPos.x,
        y: targetPos.y,
        z: targetPos.z,
        duration: 0.1,
      });
    } else {
      state.hoveredTile = null;
    }
  } else {
    // Ховер по картам в руке: увеличиваем наведённую, уменьшаем предыдущую
    raycaster.setFromCamera(mouse, camera);
    const handHits = window.drawAnimationActive ? [] : raycaster.intersectObjects(handCardMeshes, true);
    const newHover = handHits.length > 0 ? (handHits[0].object.userData?.isInHand ? handHits[0].object : handHits[0].object.parent) : null;
    if (state.hoveredHandCard && state.hoveredHandCard !== newHover) {
      gsap.to(state.hoveredHandCard.scale, { x: 0.54, y: 1, z: 0.54, duration: 0.18 });
      setHandCardHoverVisual(state.hoveredHandCard, false);
      state.hoveredHandCard = null;
    }
    if (newHover && newHover.userData && newHover.userData.isInHand) {
      state.hoveredHandCard = newHover;
      gsap.to(newHover.scale, { x: 0.675, y: 1, z: 0.675, duration: 0.18 });
      setHandCardHoverVisual(newHover, true);
    }
  }

  if (state.selectedUnit) {
    const r = state.selectedUnit.userData.row; const c = state.selectedUnit.userData.col;
    const hits = computeHits(gameState, r, c);
    unitMeshes.forEach(m => { if (m.material && m.material[2]) { } });
    for (const h of hits) {
      const m = unitMeshes.find(m => m.userData.row === h.r && m.userData.col === h.c);
      if (m) gsap.to(m.position, { y: 0.7, yoyo: true, repeat: 1, duration: 0.2 });
    }
  }

  // Tooltip для колод/кладбищ
  raycaster.setFromCamera(mouse, camera);
  const metaHits = raycaster.intersectObjects([...deckMeshes, ...graveyardMeshes], true);
  const tip = document.getElementById('hover-tooltip');
  if (metaHits.length > 0) {
    const obj = metaHits[0].object;
    const data = obj.userData || obj.parent?.userData || {};
    if (data && data.metaType) {
      const p = data.player ?? 0;
      state.hoveredMeta = { metaType: data.metaType, player: p };
      if (tip) {
        const deckCount = gameState?.players?.[p]?.deck?.length ?? 0;
        const gyCount = gameState?.players?.[p]?.graveyard?.length ?? 0;
        tip.textContent = data.metaType === 'deck'
          ? `Deck - Player ${p === 0 ? '1' : '2'}: ${deckCount}`
          : `Graveyard - Player ${p === 0 ? '1' : '2'}: ${gyCount}`;
        tip.style.left = (event.clientX + 16) + 'px';
        tip.style.top = (event.clientY + 16) + 'px';
        tip.classList.remove('hidden');
      }
    }
  } else {
    state.hoveredMeta = null;
    const tipEl = document.getElementById('hover-tooltip');
    if (tipEl) tipEl.classList.add('hidden');
  }
}

function onMouseDown(event) {
  const gameState = window.gameState;
  if (!gameState || gameState.winner !== null) return;
  if (typeof window.isInputLocked === 'function' && window.isInputLocked()) return;

  const ctx = getCtx();
  const { renderer, camera, raycaster, mouse, handCardMeshes, unitMeshes } = ctx;
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  const handIntersects = raycaster.intersectObjects(handCardMeshes, true);
  if (handIntersects.length > 0) {
    const hitObj = handIntersects[0].object;
    const card = hitObj.userData?.isInHand ? hitObj : hitObj.parent;
    const cardData = card.userData.cardData;

    if (state.pendingDiscardSelection && cardData && cardData.type === (state.pendingDiscardSelection.requiredType || cardData.type)) {
      const owner = gameState.players[gameState.active];
      const handIdx = card.userData.handIndex;
      try { state.pendingDiscardSelection.onPicked(handIdx); } catch {}
      state.pendingDiscardSelection = null;
      return;
    }

    if (cardData.type === 'UNIT' || cardData.type === 'SPELL') {
      startCardDrag(card);
    }
    return;
  }

  const unitIntersects = raycaster.intersectObjects(unitMeshes, true);
  if (unitIntersects.length > 0) {
    const hitObj = unitIntersects[0].object;
    let unit = hitObj;
    while (unit && (!unit.userData || unit.userData.type !== 'unit')) unit = unit.parent;
    if (!unit) return;
    if (state.magicFrom) {
      window.performMagicAttack(state.magicFrom, unit);
      state.magicFrom = null;
      return;
    }
    if (state.selectedCard && state.selectedCard.userData.cardData.type === 'SPELL') {
      window.castSpellOnUnit(state.selectedCard, unit);
    } else if (unit.userData.unitData.owner === gameState.active) {
      state.selectedUnit = unit;
      window.__ui.panels.showUnitActionPanel(unit);
    }
    return;
  }

  if (state.selectedCard) {
    resetCardSelection();
  }
  if (state.pendingDiscardSelection) {
    try { window.__ui.panels.hidePrompt(); } catch {}
    state.pendingDiscardSelection = null;
    if (state.draggedCard && state.draggedCard.userData && state.draggedCard.userData.cardData && state.draggedCard.userData.cardData.type === 'SPELL') {
      returnCardToHand(state.draggedCard);
    }
  }
}

function onMouseUp(event) {
  if (typeof window.isInputLocked === 'function' && window.isInputLocked()) { endCardDrag(); return; }
  if (state.draggedCard) {
    const ctx = getCtx();
    const { renderer, camera, raycaster, mouse, unitMeshes } = ctx;
    const cardData = state.draggedCard.userData.cardData;
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
      try { window.castSpellByDrag(state.draggedCard, unitMesh, state.hoveredTile); } catch {}
      if (!state.spellDragHandled) {
        returnCardToHand(state.draggedCard);
      }
      state.spellDragHandled = false;
    } else if (cardData.type === 'UNIT') {
      if (state.hoveredTile) {
        const row = state.hoveredTile.userData.row;
        const col = state.hoveredTile.userData.col;
        if (window.gameState.board[row][col].unit) {
          window.showNotification('Cell is already occupied!', 'error');
          returnCardToHand(state.draggedCard);
        } else {
          state.pendingPlacement = {
            card: state.draggedCard,
            row,
            col,
            handIndex: state.draggedCard.userData.handIndex,
          };
          window.__ui.panels.showOrientationPanel();
        }
      } else {
        returnCardToHand(state.draggedCard);
      }
    }
    endCardDrag();
    return;
  }
  endCardDrag();
}

function startCardDrag(card) {
  state.draggedCard = card;
  if (state.hoveredHandCard) {
    gsap.to(state.hoveredHandCard.scale, { x: 0.54, y: 1, z: 0.54, duration: 0.1 });
    setHandCardHoverVisual(state.hoveredHandCard, false);
    state.hoveredHandCard = null;
  }
  gsap.to(card.position, { y: card.position.y + 1, duration: 0.2, ease: 'power2.out' });
  gsap.to(card.rotation, { x: 0, z: 0, duration: 0.2 });
  gsap.to(card.scale, { x: 1.1, y: 1.1, z: 1.1, duration: 0.2 });
}

function endCardDrag() {
  if (state.hoveredTile) {
    state.hoveredTile.material.emissiveIntensity = 0.1;
    state.hoveredTile = null;
  }
  state.draggedCard = null;
}

export function returnCardToHand(card) {
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

export function resetCardSelection() {
  const { THREE } = getCtx();
  if (state.selectedCard) {
    returnCardToHand(state.selectedCard);
    state.selectedCard.material[2].emissive = new THREE.Color(0x000000);
    state.selectedCard.material[2].emissiveIntensity = 0;
    state.selectedCard = null;
  }
}

export function getPendingPlacement() { return state.pendingPlacement; }
export function setPendingPlacement(v) { state.pendingPlacement = v; }
export function getSelectedUnit() { return state.selectedUnit; }
export function setSelectedUnit(v) { state.selectedUnit = v; }
export function getPendingSpellOrientation() { return state.pendingSpellOrientation; }
export function setPendingSpellOrientation(v) { state.pendingSpellOrientation = v; }

export function attach() {
  const ctx = getCtx();
  const { renderer } = ctx;
  if (!renderer) return;
  renderer.domElement.addEventListener('mousemove', onMouseMove);
  renderer.domElement.addEventListener('mousedown', onMouseDown);
  renderer.domElement.addEventListener('mouseup', onMouseUp);
  renderer.domElement.addEventListener('mouseleave', () => {
    if (state.hoveredHandCard) {
      gsap.to(state.hoveredHandCard.scale, { x: 0.54, y: 1, z: 0.54, duration: 0.18 });
      setHandCardHoverVisual(state.hoveredHandCard, false);
      state.hoveredHandCard = null;
    }
  });
}

export { state };


import { getCtx } from '../scene/context.js';

let draggedCard = null;
let hoveredTile = null;
let hoveredHandCard = null;
let selectedCard = null;
let pendingPlacement = null;
let selectedUnit = null;
let magicFrom = null; // { r, c }
let pendingSpellOrientation = null; // { spellCardMesh, unitMesh }
let pendingDiscardSelection = null; // { requiredType: 'UNIT', onPicked: function }
let pendingRitualBoardMesh = null; // temporary mesh
let hoveredMeta = null; // { metaType: 'deck'|'grave', player: 0|1 }
let spellDragHandled = false;

function setHandCardHoverVisual(mesh, hovered){
  try { window.__hand?.setHandCardHoverVisual(mesh, hovered); } catch {}
}

function onMouseMove(event) {
  try {
    const ctx = getCtx();
    const { renderer, raycaster, camera, mouse } = ctx;
    const tileMeshes = ctx.tileMeshes || [];
    const handCardMeshes = ctx.handCardMeshes || [];
    const unitMeshes = ctx.unitMeshes || [];
    const deckMeshes = window.__scene?.meta?.getDeckMeshes?.() || [];
    const graveyardMeshes = window.__scene?.meta?.getGraveyardMeshes?.() || [];
    if (window.isInputLocked && window.isInputLocked()) return;
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
        window.gsap.to(draggedCard.position, { x: targetPos.x, y: targetPos.y, z: targetPos.z, duration: 0.1 });
      } else {
        hoveredTile = null;
      }
    } else {
      raycaster.setFromCamera(mouse, camera);
      const handHits = (window.drawAnimationActive ? [] : raycaster.intersectObjects(handCardMeshes, true));
      const newHover = handHits.length > 0 ? (handHits[0].object.userData?.isInHand ? handHits[0].object : handHits[0].object.parent) : null;
      if (hoveredHandCard && hoveredHandCard !== newHover) {
        window.gsap.to(hoveredHandCard.scale, { x: 0.54, y: 1, z: 0.54, duration: 0.18 });
        setHandCardHoverVisual(hoveredHandCard, false);
        hoveredHandCard = null;
      }
      if (newHover && newHover.userData && newHover.userData.isInHand) {
        hoveredHandCard = newHover;
        window.gsap.to(newHover.scale, { x: 0.675, y: 1, z: 0.675, duration: 0.18 });
        setHandCardHoverVisual(newHover, true);
      }
    }

    if (selectedUnit) {
      const r = selectedUnit.userData.row; const c = selectedUnit.userData.col;
      const hits = window.computeHits ? window.computeHits(window.gameState, r, c) : [];
      unitMeshes.forEach(m => { if (m.material && m.material[2]) { } });
      for (const h of hits) {
        const m = unitMeshes.find(m => m.userData.row === h.r && m.userData.col === h.c);
        if (m) window.gsap.to(m.position, { y: 0.7, yoyo: true, repeat: 1, duration: 0.2 });
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
      const tipEl = document.getElementById('hover-tooltip');
      if (tipEl) tipEl.classList.add('hidden');
    }
  } catch {}
}

function onMouseDown(event) {
  if (!window.gameState || window.gameState.winner !== null) return;
  if (window.isInputLocked && window.isInputLocked()) return;
  const ctx = getCtx();
  const { renderer, raycaster, camera, mouse } = ctx;
  const tileMeshes = ctx.tileMeshes || [];
  const handCardMeshes = ctx.handCardMeshes || [];
  const unitMeshes = ctx.unitMeshes || [];
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const handIntersects = raycaster.intersectObjects(handCardMeshes, true);
  if (handIntersects.length > 0) {
    const hitObj = handIntersects[0].object;
    const card = hitObj.userData?.isInHand ? hitObj : hitObj.parent;
    const cardData = card.userData.cardData;
    if (pendingDiscardSelection && cardData && cardData.type === (pendingDiscardSelection.requiredType || cardData.type)) {
      const owner = window.gameState.players[window.gameState.active];
      const handIdx = card.userData.handIndex;
      try { pendingDiscardSelection.onPicked(handIdx); } catch {}
      pendingDiscardSelection = null;
      return;
    }
    if (cardData.type === 'SPELL') {
      selectedCard = card;
      card.material[2].emissive = new window.THREE.Color(0x22c55e);
      card.material[2].emissiveIntensity = 0.4;
      return;
    }
    startCardDrag(card);
    return;
  }
  const unitHits = raycaster.intersectObjects(unitMeshes, true);
  if (unitHits.length > 0) {
    const unit = unitHits[0].object.userData?.isUnit ? unitHits[0].object : unitHits[0].object.parent;
    if (magicFrom) {
      performMagicAttack(magicFrom, unit);
      magicFrom = null;
      return;
    }
    if (selectedCard && selectedCard.userData.cardData.type === 'SPELL') {
      castSpellOnUnit(selectedCard, unit);
      return;
    }
    selectedUnit = unit;
    window.__ui?.panels?.showUnitActionPanel(unit);
    return;
  }
  if (selectedCard) {
    window.__ui?.panels?.hideOrientationPanel?.();
    resetCardSelection();
  }
}

function onMouseUp(event) {
  const ctx = getCtx();
  const { raycaster, camera, mouse } = ctx;
  if (draggedCard) {
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(ctx.tileMeshes.flat());
    if (intersects.length > 0) {
      hoveredTile = intersects[0].object;
      const row = hoveredTile.userData.row;
      const col = hoveredTile.userData.col;
      const cardData = draggedCard.userData.cardData;
      if (cardData.type === 'SPELL') {
        spellDragHandled = false;
        try { castSpellByDrag(draggedCard, null, hoveredTile); } catch {}
        if (!spellDragHandled) returnCardToHand(draggedCard);
        spellDragHandled = false;
      } else {
        if (window.gameState.board[row][col].unit) {
          showNotification('Cell is already occupied!', 'error');
          returnCardToHand(draggedCard);
        } else {
          pendingPlacement = {
            card: draggedCard,
            row: row,
            col: col,
            handIndex: draggedCard.userData.handIndex
          };
          window.__ui?.panels?.showOrientationPanel();
        }
      }
    } else {
      returnCardToHand(draggedCard);
    }
    endCardDrag();
    return;
  }
  endCardDrag();
}

function startCardDrag(card) {
  draggedCard = card;
  if (hoveredHandCard) {
    window.gsap.to(hoveredHandCard.scale, { x: 0.54, y: 1, z: 0.54, duration: 0.1 });
    setHandCardHoverVisual(hoveredHandCard, false);
    hoveredHandCard = null;
  }
  window.gsap.to(card.position, { y: card.position.y + 1, duration: 0.2, ease: 'power2.out' });
  window.gsap.to(card.rotation, { x: 0, z: 0, duration: 0.2 });
  window.gsap.to(card.scale, { x: 1.1, y: 1.1, z: 1.1, duration: 0.2 });
}

function endCardDrag() {
  if (hoveredTile) {
    hoveredTile.material.emissiveIntensity = 0.1;
    hoveredTile = null;
  }
  draggedCard = null;
}

function returnCardToHand(card) {
  window.gsap.to(card.position, {
    x: card.userData.originalPosition.x,
    y: card.userData.originalPosition.y,
    z: card.userData.originalPosition.z,
    duration: 0.3,
    ease: 'power2.inOut'
  });
  window.gsap.to(card.rotation, {
    x: card.userData.originalRotation.x,
    y: card.userData.originalRotation.y,
    z: card.userData.originalRotation.z,
    duration: 0.3
  });
  window.gsap.to(card.scale, {
    x: card.userData && card.userData.isInHand ? 0.54 : 1,
    y: 1,
    z: card.userData && card.userData.isInHand ? 0.54 : 1,
    duration: 0.3
  });
}

export function resetCardSelection() {
  if (selectedCard) {
    returnCardToHand(selectedCard);
    selectedCard.material[2].emissive = new window.THREE.Color(0x000000);
    selectedCard.material[2].emissiveIntensity = 0;
    selectedCard = null;
  }
}

export function getSelectedUnit(){ return selectedUnit; }
export function clearSelectedUnit(){ selectedUnit = null; }
export function getPendingPlacement(){ return pendingPlacement; }
export function clearPendingPlacement(){ pendingPlacement = null; }
export function setPendingSpellOrientation(v){ pendingSpellOrientation = v; }
export function getPendingSpellOrientation(){ return pendingSpellOrientation; }
export function clearPendingSpellOrientation(){ pendingSpellOrientation = null; }
export function returnCardToHandPublic(card){ returnCardToHand(card); }

export function attach(domElement){
  domElement.addEventListener('mousemove', onMouseMove);
  domElement.addEventListener('mousedown', onMouseDown);
  domElement.addEventListener('mouseup', onMouseUp);
  domElement.addEventListener('mouseleave', () => {
    if (hoveredHandCard) {
      window.gsap.to(hoveredHandCard.scale, { x: 0.54, y: 1, z: 0.54, duration: 0.18 });
      setHandCardHoverVisual(hoveredHandCard, false);
      hoveredHandCard = null;
    }
  });
}

const api = {
  attach,
  resetCardSelection,
  getSelectedUnit,
  clearSelectedUnit,
  getPendingPlacement,
  clearPendingPlacement,
  setPendingSpellOrientation,
  getPendingSpellOrientation,
  clearPendingSpellOrientation,
  returnCardToHand: returnCardToHandPublic,
};
try {
  if (typeof window !== 'undefined') {
    window.__ui = window.__ui || {};
    window.__ui.interactions = api;
  }
} catch {}

export default api;

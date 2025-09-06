// Pointer and drag interaction handlers for 3D scene
// Перенесено из index.html для модульности и переиспользования

import { getCtx } from './context.js';

// --- Глобальные состояния взаимодействия ---
let deckMeshes = [];
let graveyardMeshes = [];
let hoveredMeta = null; // { metaType: 'deck'|'grave', player: 0|1 }

let draggedCard = null;
let hoveredTile = null;
let hoveredHandCard = null;
let selectedCard = null;
let pendingPlacement = null;
let selectedUnit = null;
let magicFrom = null; // { r, c }
let pendingDiscardSelection = null; // { requiredType: 'UNIT', onPicked: function }
let pendingRitualBoardMesh = null; // временный меш спелла на поле
let spellDragHandled = false; // возврат карты в руку не требуется

// Пробрасываем состояния в window для совместимости
try {
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'deckMeshes', { get: () => deckMeshes, set: v => { deckMeshes = v; }, configurable: true });
    Object.defineProperty(window, 'graveyardMeshes', { get: () => graveyardMeshes, set: v => { graveyardMeshes = v; }, configurable: true });
    Object.defineProperty(window, 'hoveredMeta', { get: () => hoveredMeta, set: v => { hoveredMeta = v; }, configurable: true });
    Object.defineProperty(window, 'draggedCard', { get: () => draggedCard, set: v => { draggedCard = v; }, configurable: true });
    Object.defineProperty(window, 'hoveredTile', { get: () => hoveredTile, set: v => { hoveredTile = v; }, configurable: true });
    Object.defineProperty(window, 'hoveredHandCard', { get: () => hoveredHandCard, set: v => { hoveredHandCard = v; }, configurable: true });
    Object.defineProperty(window, 'selectedCard', { get: () => selectedCard, set: v => { selectedCard = v; }, configurable: true });
    Object.defineProperty(window, 'pendingPlacement', { get: () => pendingPlacement, set: v => { pendingPlacement = v; }, configurable: true });
    Object.defineProperty(window, 'selectedUnit', { get: () => selectedUnit, set: v => { selectedUnit = v; }, configurable: true });
    Object.defineProperty(window, 'magicFrom', { get: () => magicFrom, set: v => { magicFrom = v; }, configurable: true });
    Object.defineProperty(window, 'pendingDiscardSelection', { get: () => pendingDiscardSelection, set: v => { pendingDiscardSelection = v; }, configurable: true });
    Object.defineProperty(window, 'pendingRitualBoardMesh', { get: () => pendingRitualBoardMesh, set: v => { pendingRitualBoardMesh = v; }, configurable: true });
    Object.defineProperty(window, 'spellDragHandled', { get: () => spellDragHandled, set: v => { spellDragHandled = v; }, configurable: true });
  }
} catch {}

// Делегатор к модулю руки для визуального ховера карты
function setHandCardHoverVisual(mesh, hovered) {
  try {
    if (window.__hand && typeof window.__hand.setHandCardHoverVisual === 'function') {
      window.__hand.setHandCardHoverVisual(mesh, hovered);
    }
  } catch {}
}

// ====== POINTER INTERACTION HANDLERS ======
// Mouse move: update drag position and hand hover.
function onMouseMove(event) {
  if (typeof isInputLocked === 'function' ? isInputLocked() : false) return;

  const { renderer, raycaster, mouse, camera, tileMeshes, unitMeshes, handCardMeshes } = getCtx();
  if (!renderer || !raycaster || !mouse || !camera) return;

  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  if (draggedCard) {
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(tileMeshes.flat());

    if (hoveredTile) {
      try { hoveredTile.material.emissiveIntensity = 0.1; } catch {}
    }

    if (intersects.length > 0) {
      hoveredTile = intersects[0].object;
      try { hoveredTile.material.emissiveIntensity = 0.3; } catch {}

      const targetPos = hoveredTile.position.clone();
      targetPos.y = 2;
      try {
        gsap.to(draggedCard.position, {
          x: targetPos.x,
          y: targetPos.y,
          z: targetPos.z,
          duration: 0.1,
        });
      } catch {}
    } else {
      hoveredTile = null;
    }
  } else {
    // Ховер по картам в руке: увеличиваем наведённую, уменьшаем предыдущую, поднимаем над стеком
    raycaster.setFromCamera(mouse, camera);
    const handHits = (typeof window !== 'undefined' && window.drawAnimationActive) ? [] : raycaster.intersectObjects(handCardMeshes, true);
    const newHover = handHits.length > 0 ? (handHits[0].object.userData?.isInHand ? handHits[0].object : handHits[0].object.parent) : null;
    if (hoveredHandCard && hoveredHandCard !== newHover) {
      try { gsap.to(hoveredHandCard.scale, { x: 0.54, y: 1, z: 0.54, duration: 0.18 }); } catch {}
      setHandCardHoverVisual(hoveredHandCard, false);
      hoveredHandCard = null;
    }
    if (newHover && newHover.userData && newHover.userData.isInHand) {
      hoveredHandCard = newHover;
      try { gsap.to(newHover.scale, { x: 0.675, y: 1, z: 0.675, duration: 0.18 }); } catch {}
      setHandCardHoverVisual(newHover, true);
    }
  }

  // Подсветка потенциальных целей при открытой панели действий юнита
  if (selectedUnit) {
    const r = selectedUnit.userData.row; const c = selectedUnit.userData.col;
    const hits = typeof computeHits === 'function' ? computeHits(window.gameState, r, c) : [];
    // убираем прошлую подсветку
    (unitMeshes || []).forEach(m => { if (m.material && m.material[2]) { } });
    // подсветим цели небольшим всплеском по Y
    for (const h of hits) {
      const m = unitMeshes.find(m => m.userData.row === h.r && m.userData.col === h.c);
      if (m) try { gsap.to(m.position, { y: 0.7, yoyo: true, repeat: 1, duration: 0.2 }); } catch {}
    }
  }

  // Tooltip для колод/кладбищ
  raycaster.setFromCamera(mouse, camera);
  const metaHits = raycaster.intersectObjects([...deckMeshes, ...graveyardMeshes], true);
  const tip = (typeof document !== 'undefined') ? document.getElementById('hover-tooltip') : null;
  if (metaHits.length > 0) {
    const obj = metaHits[0].object;
    const data = obj.userData || obj.parent?.userData || {};
    if (data && data.metaType) {
      const p = data.player ?? 0;
      hoveredMeta = { metaType: data.metaType, player: p };
      if (tip) {
        const deckCount = window.gameState?.players?.[p]?.deck?.length ?? 0;
        const gyCount = window.gameState?.players?.[p]?.graveyard?.length ?? 0;
        tip.textContent = data.metaType === 'deck'
          ? `Deck - Player ${p===0? '1':'2'}: ${deckCount}`
          : `Graveyard - Player ${p===0? '1':'2'}: ${gyCount}`;
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

// Mouse down: start drag or select targets.
function onMouseDown(event) {
  const gameState = window.gameState;
  if (!gameState || gameState.winner !== null) return;
  if (typeof isInputLocked === 'function' && isInputLocked()) return;

  const { renderer, raycaster, mouse, camera, handCardMeshes, unitMeshes } = getCtx();
  if (!renderer) return;

  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  const handIntersects = raycaster.intersectObjects(handCardMeshes, true);
  if (handIntersects.length > 0) {
    const hitObj = handIntersects[0].object;
    const card = hitObj.userData?.isInHand ? hitObj : hitObj.parent;
    const cardData = card.userData.cardData;
    // Если ждём ритуального дискарда — перехват клика по руке
    if (pendingDiscardSelection && cardData && cardData.type === (pendingDiscardSelection.requiredType || cardData.type)) {
      const owner = gameState.players[gameState.active];
      const handIdx = card.userData.handIndex;
      try { pendingDiscardSelection.onPicked(handIdx); } catch {}
      pendingDiscardSelection = null;
      return;
    }

    if (cardData.type === 'UNIT') {
      startCardDrag(card);
    } else if (cardData.type === 'SPELL') {
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
    if (magicFrom) {
      try { performMagicAttack(magicFrom, unit); } catch {}
      magicFrom = null;
      return;
    }
    if (selectedCard && selectedCard.userData.cardData.type === 'SPELL') {
      try { castSpellOnUnit(selectedCard, unit); } catch {}
    } else if (unit.userData.unitData.owner === gameState.active) {
      selectedUnit = unit;
      try { window.__ui.panels.showUnitActionPanel(unit); } catch {}
    }
    return;
  }

  if (selectedCard) {
    resetCardSelection();
  }
  // Отмена ритуального дискарда кликом по полю
  if (pendingDiscardSelection) {
    try { window.__ui.panels.hidePrompt(); } catch {}
    pendingDiscardSelection = null;
    if (draggedCard && draggedCard.userData && draggedCard.userData.cardData && draggedCard.userData.cardData.type === 'SPELL') {
      returnCardToHand(draggedCard);
    }
  }
}

// Mouse up: finalize card drops or cancel drag.
function onMouseUp(event) {
  if (typeof isInputLocked === 'function' && isInputLocked()) { endCardDrag(); return; }
  const { renderer, raycaster, mouse, camera, unitMeshes } = getCtx();
  if (!renderer) return;
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
      try { castSpellByDrag(draggedCard, unitMesh, hoveredTile); } catch {}
      if (!spellDragHandled) {
        returnCardToHand(draggedCard);
      }
      spellDragHandled = false;
    } else if (cardData.type === 'UNIT') {
      if (hoveredTile) {
        const row = hoveredTile.userData.row;
        const col = hoveredTile.userData.col;
        if (window.gameState.board[row][col].unit) {
          showNotification('Cell is already occupied!', 'error');
          returnCardToHand(draggedCard);
        } else {
          pendingPlacement = {
            card: draggedCard,
            row: row,
            col: col,
            handIndex: draggedCard.userData.handIndex,
          };
          try { window.__ui.panels.showOrientationPanel(); } catch {}
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

// ====== CARD DRAG HELPERS ======
// Prepare card mesh for dragging from hand.
function startCardDrag(card) {
  draggedCard = card;
  if (hoveredHandCard) {
    try { gsap.to(hoveredHandCard.scale, { x: 0.54, y: 1, z: 0.54, duration: 0.1 }); } catch {}
    setHandCardHoverVisual(hoveredHandCard, false);
    hoveredHandCard = null;
  }

  try {
    gsap.to(card.position, {
      y: card.position.y + 1,
      duration: 0.2,
      ease: 'power2.out',
    });
    gsap.to(card.rotation, { x: 0, z: 0, duration: 0.2 });
    gsap.to(card.scale, { x: 1.1, y: 1.1, z: 1.1, duration: 0.2 });
  } catch {}
}

// Clean up after drag operation finishes.
function endCardDrag() {
  if (hoveredTile) {
    try { hoveredTile.material.emissiveIntensity = 0.1; } catch {}
    hoveredTile = null;
  }
  draggedCard = null;
}

// Animate card back to its original hand slot.
export function returnCardToHand(card) {
  if (!card) return;
  try {
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
  } catch {}
}

// Cancel currently selected card and restore its visuals.
export function resetCardSelection() {
  if (selectedCard) {
    returnCardToHand(selectedCard);
    const THREE = getCtx().THREE || (typeof window !== 'undefined' ? window.THREE : null);
    try {
      selectedCard.material[2].emissive = new THREE.Color(0x000000);
      selectedCard.material[2].emissiveIntensity = 0;
    } catch {}
    selectedCard = null;
  }
}

function onMouseLeave() {
  if (hoveredHandCard) {
    try { gsap.to(hoveredHandCard.scale, { x: 0.54, y: 1, z: 0.54, duration: 0.18 }); } catch {}
    setHandCardHoverVisual(hoveredHandCard, false);
    hoveredHandCard = null;
  }
}

// Public API: attach/detach listeners
export function attachInteractions() {
  const { renderer } = getCtx();
  if (!renderer) return;
  const dom = renderer.domElement;
  dom.addEventListener('mousemove', onMouseMove);
  dom.addEventListener('mousedown', onMouseDown);
  dom.addEventListener('mouseup', onMouseUp);
  dom.addEventListener('mouseleave', onMouseLeave);
}

export function detachInteractions() {
  const { renderer } = getCtx();
  if (!renderer) return;
  const dom = renderer.domElement;
  dom.removeEventListener('mousemove', onMouseMove);
  dom.removeEventListener('mousedown', onMouseDown);
  dom.removeEventListener('mouseup', onMouseUp);
  dom.removeEventListener('mouseleave', onMouseLeave);
}

// Экспортируем функции/состояния во внешний мир
try {
  if (typeof window !== 'undefined') {
    window.returnCardToHand = returnCardToHand;
    window.resetCardSelection = resetCardSelection;
    window.__interactions = {
      attach: attachInteractions,
      detach: detachInteractions,
      startCardDrag,
      endCardDrag,
      returnCardToHand,
      resetCardSelection,
    };
  }
} catch {}

export { onMouseMove, onMouseDown, onMouseUp, startCardDrag, endCardDrag };


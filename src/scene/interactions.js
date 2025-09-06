import { getCtx } from './context.js';
import { computeHits } from '../core/rules.js';
import * as UIPanels from '../ui/panels.js';

// Константы положения руки и сервисных объектов сцены
export const HAND_Z_OFFSET = 1.0;
export const META_Z_AWAY = 1.5;
try { if (typeof window !== 'undefined') window.HAND_Z_OFFSET = HAND_Z_OFFSET; } catch {}

// Состояние взаимодействий (перетаскивания и выделения)
const state = {
  draggedCard: null,
  hoveredTile: null,
  hoveredHandCard: null,
  selectedCard: null,
  selectedUnit: null,
  magicFrom: null,
  pendingSpellOrientation: null, // { spellCardMesh, unitMesh }
  pendingDiscardSelection: null, // { requiredType, onPicked }
  spellDragHandled: false,
  hoveredMeta: null,
  deckMeshes: [],
  graveyardMeshes: [],
};

// ====== CARD DRAG HELPERS ======
function startCardDrag(card) {
  state.draggedCard = card;
  const gsap = window.gsap;
  if (state.hoveredHandCard) {
    gsap.to(state.hoveredHandCard.scale, { x: 0.54, y: 1, z: 0.54, duration: 0.1 });
    try { window.__hand?.setHandCardHoverVisual(state.hoveredHandCard, false); } catch {}
    state.hoveredHandCard = null;
  }
  gsap.to(card.position, { y: card.position.y + 1, duration: 0.2, ease: 'power2.out' });
  gsap.to(card.rotation, { x: 0, z: 0, duration: 0.2 });
  gsap.to(card.scale, { x: 1.1, y: 1.1, z: 1.1, duration: 0.2 });
}

function endCardDrag() {
  if (state.hoveredTile) {
    try { state.hoveredTile.material.emissiveIntensity = 0.1; } catch {}
    state.hoveredTile = null;
  }
  state.draggedCard = null;
}

export function returnCardToHand(card) {
  if (!card) return;
  const gsap = window.gsap;
  gsap.to(card.position, {
    x: card.userData.originalPosition.x,
    y: card.userData.originalPosition.y,
    z: card.userData.originalPosition.z,
    duration: 0.3,
    ease: 'power2.inOut'
  });
  gsap.to(card.rotation, {
    x: card.userData.originalRotation.x,
    y: card.userData.originalRotation.y,
    z: card.userData.originalRotation.z,
    duration: 0.3
  });
  gsap.to(card.scale, {
    x: card.userData && card.userData.isInHand ? 0.54 : 1,
    y: 1,
    z: card.userData && card.userData.isInHand ? 0.54 : 1,
    duration: 0.3
  });
}

export function resetCardSelection() {
  if (state.selectedCard) {
    returnCardToHand(state.selectedCard);
    try {
      state.selectedCard.material[2].emissive = new (getCtx().THREE).Color(0x000000);
      state.selectedCard.material[2].emissiveIntensity = 0;
    } catch {}
    state.selectedCard = null;
  }
}

// ====== POINTER INTERACTION HANDLERS ======
function onMouseMove(event) {
  if (window.isInputLocked && window.isInputLocked()) return;
  const ctx = getCtx();
  const { renderer, raycaster, mouse, camera, tileMeshes, handCardMeshes, unitMeshes } = ctx;
  const gsap = window.gsap;
  const gameState = window.gameState;
  const drawAnimationActive = window.drawAnimationActive;

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
        duration: 0.1
      });
    } else {
      state.hoveredTile = null;
    }
  } else {
    raycaster.setFromCamera(mouse, camera);
    const handHits = drawAnimationActive ? [] : raycaster.intersectObjects(handCardMeshes, true);
    const newHover = handHits.length > 0
      ? (handHits[0].object.userData?.isInHand ? handHits[0].object : handHits[0].object.parent)
      : null;
    if (state.hoveredHandCard && state.hoveredHandCard !== newHover) {
      gsap.to(state.hoveredHandCard.scale, { x: 0.54, y: 1, z: 0.54, duration: 0.18 });
      try { window.__hand?.setHandCardHoverVisual(state.hoveredHandCard, false); } catch {}
      state.hoveredHandCard = null;
    }
    if (newHover && newHover.userData && newHover.userData.isInHand) {
      state.hoveredHandCard = newHover;
      gsap.to(newHover.scale, { x: 0.675, y: 1, z: 0.675, duration: 0.18 });
      try { window.__hand?.setHandCardHoverVisual(newHover, true); } catch {}
    }
  }

  if (state.selectedUnit) {
    const r = state.selectedUnit.userData.row; const c = state.selectedUnit.userData.col;
    const hits = computeHits(gameState, r, c);
    for (const h of hits) {
      const m = unitMeshes.find(m => m.userData.row === h.r && m.userData.col === h.c);
      if (m) gsap.to(m.position, { y: 0.7, yoyo: true, repeat: 1, duration: 0.2 });
    }
  }

  // Tooltip для колод/кладбищ
  raycaster.setFromCamera(mouse, camera);
  const metaHits = raycaster.intersectObjects([...state.deckMeshes, ...state.graveyardMeshes], true);
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
          ? `Deck - Player ${p===0? '1':'2'}: ${deckCount}`
          : `Graveyard - Player ${p===0? '1':'2'}: ${gyCount}`;
        tip.style.left = (event.clientX + 16) + 'px';
        tip.style.top = (event.clientY + 16) + 'px';
        tip.classList.remove('hidden');
      }
    }
  } else {
    state.hoveredMeta = null;
    if (tip) tip.classList.add('hidden');
  }
}

function onMouseDown(event) {
  const gameState = window.gameState;
  if (!gameState || gameState.winner !== null) return;
  if (window.isInputLocked && window.isInputLocked()) return;
  const ctx = getCtx();
  const { renderer, raycaster, mouse, handCardMeshes, unitMeshes } = ctx;
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, ctx.camera);

  const handIntersects = raycaster.intersectObjects(handCardMeshes, true);
  if (handIntersects.length > 0) {
    const hitObj = handIntersects[0].object;
    const card = hitObj.userData?.isInHand ? hitObj : hitObj.parent;
    const cardData = card.userData.cardData;
    if (state.pendingDiscardSelection && cardData && cardData.type === (state.pendingDiscardSelection.requiredType || cardData.type)) {
      const handIdx = card.userData.handIndex;
      try { state.pendingDiscardSelection.onPicked(handIdx); } catch {}
      state.pendingDiscardSelection = null;
      return;
    }
    startCardDrag(card);
    return;
  }

  const unitIntersects = raycaster.intersectObjects(unitMeshes, true);
  if (unitIntersects.length > 0) {
    let unit = unitIntersects[0].object;
    while (unit && (!unit.userData || unit.userData.type !== 'unit')) unit = unit.parent;
    if (!unit) return;
    if (state.magicFrom) {
      window.performMagicAttack?.(state.magicFrom, unit);
      state.magicFrom = null;
      return;
    }
    if (state.selectedCard && state.selectedCard.userData.cardData.type === 'SPELL') {
      window.castSpellOnUnit?.(state.selectedCard, unit);
    } else if (unit.userData.unitData.owner === gameState.active) {
      state.selectedUnit = unit;
      UIPanels.showUnitActionPanel(unit);
    }
    return;
  }

  if (state.selectedCard) {
    resetCardSelection();
  }
  if (state.pendingDiscardSelection) {
    UIPanels.hidePrompt();
    state.pendingDiscardSelection = null;
    if (state.draggedCard && state.draggedCard.userData?.cardData?.type === 'SPELL') {
      returnCardToHand(state.draggedCard);
    }
  }
}

function onMouseUp(event) {
  if (window.isInputLocked && window.isInputLocked()) { endCardDrag(); return; }
  const ctx = getCtx();
  const { renderer, raycaster, mouse, unitMeshes } = ctx;
  const gameState = window.gameState;
  if (state.draggedCard) {
    const cardData = state.draggedCard.userData.cardData;
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, ctx.camera);
    const unitIntersects = raycaster.intersectObjects(unitMeshes, true);
    let unitMesh = null;
    if (unitIntersects.length > 0) {
      let u = unitIntersects[0].object;
      while (u && (!u.userData || u.userData.type !== 'unit')) u = u.parent;
      unitMesh = u;
    }
    if (cardData.type === 'SPELL') {
      try { window.castSpellByDrag?.(state.draggedCard, unitMesh, state.hoveredTile); } catch {}
      if (!state.spellDragHandled) {
        returnCardToHand(state.draggedCard);
      }
      state.spellDragHandled = false;
    } else if (cardData.type === 'UNIT') {
      if (state.hoveredTile) {
        const row = state.hoveredTile.userData.row;
        const col = state.hoveredTile.userData.col;
        if (gameState.board[row][col].unit) {
          window.showNotification?.('Cell is already occupied!', 'error');
          returnCardToHand(state.draggedCard);
        } else {
          window.__ui?.game?.setPendingPlacement?.({
            card: state.draggedCard,
            row,
            col,
            handIndex: state.draggedCard.userData.handIndex,
          });
          UIPanels.showOrientationPanel();
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

function onMouseLeave() {
  const gsap = window.gsap;
  if (state.hoveredHandCard) {
    gsap.to(state.hoveredHandCard.scale, { x: 0.54, y: 1, z: 0.54, duration: 0.18 });
    try { window.__hand?.setHandCardHoverVisual(state.hoveredHandCard, false); } catch {}
    state.hoveredHandCard = null;
  }
}

export function attachInteractions() {
  const ctx = getCtx();
  const dom = ctx.renderer?.domElement;
  if (!dom) return;
  dom.addEventListener('mousemove', onMouseMove);
  dom.addEventListener('mousedown', onMouseDown);
  dom.addEventListener('mouseup', onMouseUp);
  dom.addEventListener('mouseleave', onMouseLeave);
}

// Построение колод и кладбищ для обоих игроков
export function createMetaObjects(gameState) {
  const ctx = getCtx();
  const { THREE, metaGroup } = ctx;
  state.deckMeshes.forEach(m => m.parent && m.parent.remove(m));
  state.graveyardMeshes.forEach(m => m.parent && m.parent.remove(m));
  state.deckMeshes = []; state.graveyardMeshes = [];
  if (!gameState) return;
  const baseX = (6.2 + 0.2) * 1 + 6.6;
  const zA = -5.2 - META_Z_AWAY; const zB = 0.2 + META_Z_AWAY;
  function buildDeck(player, z) {
    const g = new THREE.Group(); g.position.set(baseX, 0.5, z); g.userData = { metaType: 'deck', player };
    const sideMap = window.CARD_TEX?.deckSide || window.__cards?.getCachedTexture?.('textures/card_deck_side_view.jpeg');
    const backMap = window.CARD_TEX?.back || window.__cards?.getCachedTexture?.('textures/card_back_main.jpeg');
    const sideMat = new THREE.MeshStandardMaterial({ map: sideMap, color: 0xffffff, metalness: 0.3, roughness: 0.85 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.8, 5.0), sideMat);
    body.castShadow = true; body.receiveShadow = true; body.userData = { metaType: 'deck', player };
    const top = new THREE.Mesh(new THREE.BoxGeometry(3.62, 0.04, 5.02), new THREE.MeshStandardMaterial({ map: backMap, color: 0xffffff }));
    top.position.y = 0.42; top.userData = { metaType: 'deck', player };
    g.add(body); g.add(top); metaGroup.add(g); state.deckMeshes.push(g);
  }
  function buildGrave(player, z) {
    const g = new THREE.Group(); g.position.set(baseX + 4.2, 0.5, z); g.userData = { metaType: 'grave', player };
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.3, 20), new THREE.MeshStandardMaterial({ color: 0x334155 }));
    base.userData = { metaType: 'grave', player };
    const icon = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.2, 0.1), new THREE.MeshStandardMaterial({ color: 0x64748b }));
    icon.position.y = 0.9; icon.rotation.y = Math.PI / 8; icon.userData = { metaType: 'grave', player };
    g.add(base); g.add(icon); metaGroup.add(g); state.graveyardMeshes.push(g);
  }
  buildDeck(0, zA); buildDeck(1, zB); buildGrave(0, zA); buildGrave(1, zB);
}

export function getSelectedUnit() { return state.selectedUnit; }
export function setSelectedUnit(u) { state.selectedUnit = u; }
export function getState() { return state; }

const api = {
  attachInteractions,
  startCardDrag,
  returnCardToHand,
  resetCardSelection,
  createMetaObjects,
  getSelectedUnit,
  setSelectedUnit,
  getState,
};

try {
  if (typeof window !== 'undefined') {
    window.__scene = window.__scene || {};
    window.__scene.interactions = api;
  }
} catch {}

export default api;

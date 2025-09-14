// Pointer and drag interactions for Three.js scene
import { getCtx } from './context.js';
import { setHandCardHoverVisual } from './hand.js';
import { highlightTiles, clearHighlights } from './highlight.js';
import { applyFreedonianAura } from '../core/abilities.js';
import { applyOnDeathEffects } from '../core/onDeath.js';

// Centralized interaction state
export const interactionState = {
  draggedCard: null,
  hoveredTile: null,
  hoveredHandCard: null,
  selectedCard: null,
  pendingPlacement: null,
  selectedUnit: null,
  magicFrom: null,
  pendingAttack: null,
  hoveredMeta: null,
  pendingSpellOrientation: null,
  pendingDiscardSelection: null,
  pendingRitualBoardMesh: null,
  pendingRitualSpellHandIndex: null,
  pendingRitualSpellCard: null,
  spellDragHandled: false,
  // флаг для автоматического завершения хода после атаки
  autoEndTurnAfterAttack: false,
};

function isInputLocked() {
  if (typeof window !== 'undefined' && typeof window.isInputLocked === 'function') {
    return window.isInputLocked();
  }
  return false;
}

// === POINTER INTERACTION HANDLERS ===
function onMouseMove(event) {
  if (isInputLocked() && !interactionState.pendingDiscardSelection) return;
  const ctx = getCtx();
  const { renderer, mouse, raycaster, tileMeshes, unitMeshes, handCardMeshes } = ctx;
  if (!renderer) return;
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  if (interactionState.draggedCard) {
    raycaster.setFromCamera(mouse, ctx.camera);
    const intersects = raycaster.intersectObjects(tileMeshes.flat());

    if (interactionState.hoveredTile) {
      interactionState.hoveredTile.material.emissiveIntensity = 0.1;
    }

    if (intersects.length > 0) {
      interactionState.hoveredTile = intersects[0].object;
      interactionState.hoveredTile.material.emissiveIntensity = 0.3;

      const targetPos = interactionState.hoveredTile.position.clone();
      targetPos.y = 2;
      gsap.to(interactionState.draggedCard.position, {
        x: targetPos.x,
        y: targetPos.y,
        z: targetPos.z,
        duration: 0.1,
      });
    } else {
      interactionState.hoveredTile = null;
    }
  } else {
    raycaster.setFromCamera(mouse, ctx.camera);
    const handHits = (typeof window !== 'undefined' && window.drawAnimationActive)
      ? []
      : raycaster.intersectObjects(handCardMeshes, true);
    const newHover = handHits.length > 0
      ? (handHits[0].object.userData?.isInHand ? handHits[0].object : handHits[0].object.parent)
      : null;
    if (interactionState.hoveredHandCard && interactionState.hoveredHandCard !== newHover) {
      gsap.to(interactionState.hoveredHandCard.scale, { x: 0.54, y: 1, z: 0.54, duration: 0.18 });
      setHandCardHoverVisual(interactionState.hoveredHandCard, false);
      interactionState.hoveredHandCard = null;
    }
    if (newHover && newHover.userData && newHover.userData.isInHand) {
      interactionState.hoveredHandCard = newHover;
      gsap.to(newHover.scale, { x: 0.675, y: 1, z: 0.675, duration: 0.18 });
      setHandCardHoverVisual(newHover, true);
    }
  }
  if (interactionState.selectedUnit) {
    const r = interactionState.selectedUnit.userData.row;
    const c = interactionState.selectedUnit.userData.col;
    const gs = window.gameState;
    const unit = gs.board?.[r]?.[c]?.unit;
    const tpl = window.CARDS?.[unit?.tplId];
    const attacks = tpl?.attacks || [];
    const includeEmpty = attacks.some(a => Array.isArray(a.ranges) && a.ranges.length > 1 && !a.mode);
    const hits = (typeof window !== 'undefined' && window.computeHits)
      ? window.computeHits(gs, r, c, { union: true, includeEmpty })
      : [];
    for (const h of hits) {
      const m = unitMeshes.find(m => m.userData.row === h.r && m.userData.col === h.c);
      if (m) gsap.to(m.position, { y: 0.7, yoyo: true, repeat: 1, duration: 0.2 });
    }
  }

  // Tooltip for decks/graveyards
  raycaster.setFromCamera(mouse, ctx.camera);
  const deckMeshes = (typeof window !== 'undefined' && window.deckMeshes) || [];
  const graveyardMeshes = (typeof window !== 'undefined' && window.graveyardMeshes) || [];
  const metaHits = raycaster.intersectObjects([...deckMeshes, ...graveyardMeshes], true);
  const tip = document.getElementById('hover-tooltip');
  if (metaHits.length > 0) {
    const obj = metaHits[0].object;
    const data = obj.userData || obj.parent?.userData || {};
    if (data && data.metaType) {
      const p = data.player ?? 0;
      interactionState.hoveredMeta = { metaType: data.metaType, player: p };
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
    interactionState.hoveredMeta = null;
    if (tip) tip.classList.add('hidden');
  }
}

function onMouseDown(event) {
  const gameState = (typeof window !== 'undefined' ? window.gameState : null);
  if (!gameState || gameState.winner !== null) return;
  if (isInputLocked() && !interactionState.pendingDiscardSelection) return;
  const ctx = getCtx();
  const { renderer, mouse, raycaster, unitMeshes, handCardMeshes } = ctx;
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, ctx.camera);

  const handIntersects = raycaster.intersectObjects(handCardMeshes, true);
  if (handIntersects.length > 0) {
    const hitObj = handIntersects[0].object;
    const card = hitObj.userData?.isInHand ? hitObj : hitObj.parent;
    const cardData = card.userData.cardData;
    if (cardData.locked && !gameState.summoningUnlocked) {
      showNotification('Summoning Lock: This card cannot be played until there are at least 4 units on the board at the same time', 'error');
      return;
    }
    if (interactionState.pendingDiscardSelection && cardData && cardData.type === (interactionState.pendingDiscardSelection.requiredType || cardData.type)) {
      const owner = gameState.players[gameState.active];
      const handIdx = card.userData.handIndex;
      try { interactionState.pendingDiscardSelection.onPicked(handIdx); } catch {}
      interactionState.pendingDiscardSelection = null;
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
    if (interactionState.magicFrom) {
      const ok = performMagicAttack(interactionState.magicFrom, unit);
      if (ok) {
        interactionState.magicFrom = null;
        clearHighlights();
      }
      try { window.__ui?.cancelButton?.refreshCancelButton(); } catch {}
      return;
    }
    if (interactionState.pendingAttack) {
      const ok = performChosenAttack(interactionState.pendingAttack, unit);
      if (ok) {
        interactionState.pendingAttack = null;
        clearHighlights();
      }
      try { window.__ui?.cancelButton?.refreshCancelButton(); } catch {}
      return;
    }
    if (interactionState.selectedCard && interactionState.selectedCard.userData.cardData.type === 'SPELL') {
      castSpellOnUnit(interactionState.selectedCard, unit);
    } else if (unit.userData.unitData.owner === gameState.active) {
      interactionState.selectedUnit = unit;
      try { window.__ui.panels.showUnitActionPanel(unit); } catch {}
    }
    return;
  }

  if (interactionState.selectedCard) {
    resetCardSelection();
  }
  if (interactionState.pendingDiscardSelection && !interactionState.pendingDiscardSelection.forced) {
    try { window.__ui.panels.hidePrompt(); } catch {}
    interactionState.pendingDiscardSelection = null;
    if (
      interactionState.draggedCard &&
      interactionState.draggedCard.userData &&
      interactionState.draggedCard.userData.cardData &&
      interactionState.draggedCard.userData.cardData.type === 'SPELL'
    ) {
      returnCardToHand(interactionState.draggedCard);
    }
  }
}

function onMouseUp(event) {
  if (isInputLocked() && !interactionState.pendingDiscardSelection) { endCardDrag(); return; }
  const gameState = (typeof window !== 'undefined' ? window.gameState : null);
  const ctx = getCtx();
  const { renderer, mouse, raycaster, unitMeshes, tileMeshes, tileFrames } = ctx;
  if (interactionState.draggedCard) {
    const cardData = interactionState.draggedCard.userData.cardData;
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
      try { castSpellByDrag(interactionState.draggedCard, unitMesh, interactionState.hoveredTile); } catch {}
      if (!interactionState.spellDragHandled) {
        returnCardToHand(interactionState.draggedCard);
      }
      interactionState.spellDragHandled = false;
    } else if (cardData.type === 'UNIT') {
      if (interactionState.hoveredTile) {
        const row = interactionState.hoveredTile.userData.row;
        const col = interactionState.hoveredTile.userData.col;
        if (gameState.board[row][col].unit) {
          showNotification('Cell is already occupied!', 'error');
          returnCardToHand(interactionState.draggedCard);
        } else {
          interactionState.pendingPlacement = {
            card: interactionState.draggedCard,
            row,
            col,
            handIndex: interactionState.draggedCard.userData.handIndex,
          };
          // Сразу опускаем карту на высоту клетки, чтобы убрать резкий подъём
          try {
            const baseY = (tileFrames?.[row]?.[col]?.children?.[0]?.position?.y ?? 1.0) + 0.28;
            const pos = tileMeshes[row][col].position.clone();
            pos.y = baseY;
            gsap.to(interactionState.draggedCard.position, { x: pos.x, y: pos.y, z: pos.z, duration: 0.15 });
          } catch {}
          try { window.__ui.panels.showOrientationPanel(); } catch {}
          try { window.__ui?.cancelButton?.refreshCancelButton(); } catch {}
        }
      } else {
        returnCardToHand(interactionState.draggedCard);
      }
    }
    endCardDrag();
    return;
  }
}

function startCardDrag(card) {
  interactionState.draggedCard = card;
  if (interactionState.hoveredHandCard) {
    gsap.to(interactionState.hoveredHandCard.scale, { x: 0.54, y: 1, z: 0.54, duration: 0.1 });
    setHandCardHoverVisual(interactionState.hoveredHandCard, false);
    interactionState.hoveredHandCard = null;
  }
  gsap.to(card.position, {
    y: card.position.y + 1,
    duration: 0.2,
    ease: 'power2.out',
  });
  gsap.to(card.rotation, {
    x: 0,
    z: 0,
    duration: 0.2,
  });
  gsap.to(card.scale, {
    x: 1.1,
    y: 1.1,
    z: 1.1,
    duration: 0.2,
  });
  // Если карта – заклинание с выбором цели, подсвечиваем все клетки с юнитами
  try {
    const data = card.userData?.cardData;
    if (data && data.type === 'SPELL') {
      const needUnit = window.__spells?.requiresUnitTarget?.(data.id);
      if (needUnit) {
        const gs = window.gameState;
        const cells = [];
        for (let r = 0; r < 3; r++) {
          for (let c = 0; c < 3; c++) {
            if (gs?.board?.[r]?.[c]?.unit) cells.push({ r, c });
          }
        }
        highlightTiles(cells);
      }
    }
  } catch {}
}

function endCardDrag() {
  if (interactionState.hoveredTile) {
    interactionState.hoveredTile.material.emissiveIntensity = 0.1;
    interactionState.hoveredTile = null;
  }
  interactionState.draggedCard = null;
  clearHighlights();
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

export { returnCardToHand };

export function resetCardSelection() {
  const THREE = getCtx().THREE || (typeof window !== 'undefined' ? window.THREE : undefined);
  if (interactionState.selectedCard) {
    returnCardToHand(interactionState.selectedCard);
    try {
      interactionState.selectedCard.material[2].emissive = new THREE.Color(0x000000);
      interactionState.selectedCard.material[2].emissiveIntensity = 0;
    } catch {}
    interactionState.selectedCard = null;
  }
  clearHighlights();
  try { window.__ui?.cancelButton?.refreshCancelButton(); } catch {}
}

function performMagicAttack(from, targetMesh) {
  const ctx = getCtx();
  const { unitMeshes, tileMeshes } = ctx;
  const THREE = ctx.THREE || (typeof window !== 'undefined' ? window.THREE : undefined);
  const gameState = window.gameState;
  const attacker = gameState.board?.[from.r]?.[from.c]?.unit;
  if (!attacker || attacker.lastAttackTurn === gameState.turn) {
    showNotification('Некорректная атака', 'error');
    return false;
  }
  const res = window.magicAttack(gameState, from.r, from.c, targetMesh.userData.row, targetMesh.userData.col);
  if (!res) { showNotification('Incorrect target', 'error'); return false; }
  for (const l of res.logLines.reverse()) window.addLog(l);
  const aMesh = unitMeshes.find(m => m.userData.row === from.r && m.userData.col === from.c);
  if (aMesh) { gsap.fromTo(aMesh.position, { y: aMesh.position.y }, { y: aMesh.position.y + 0.3, yoyo: true, repeat: 1, duration: 0.12 }); }
  for (const t of res.targets || []) {
    const tMesh = unitMeshes.find(m => m.userData.row === t.r && m.userData.col === t.c);
    if (tMesh) {
      window.__fx.magicBurst(tMesh.position.clone().add(new THREE.Vector3(0, 0.4, 0)));
      window.__fx.shakeMesh(tMesh, 6, 0.12);
      if (typeof t.dmg === 'number' && t.dmg > 0) {
        window.__fx.spawnDamageText(tMesh, `-${t.dmg}`, '#ff5555');
      }
    }
  }
  if (res.deaths && res.deaths.length) {
    for (const d of res.deaths) {
      try { gameState.players[d.owner].graveyard.push(CARDS[d.tplId]); } catch {}
      const deadMesh = unitMeshes.find(m => m.userData.row === d.r && m.userData.col === d.c);
      if (deadMesh) { window.__fx.dissolveAndAsh(deadMesh, new THREE.Vector3(0, 0, 0.6), 0.9); }
      setTimeout(() => {
        const p = tileMeshes[d.r][d.c].position.clone().add(new THREE.Vector3(0, 1.2, 0));
        const slot = gameState.players?.[d.owner]?.mana || 0;
        window.animateManaGainFromWorld(p, d.owner, true, slot);
      }, 400);
    }
    // Обновляем состояние сразу, чтобы клетка считалась свободной
    try { window.applyGameState(res.n1); } catch {}
    const attacker = window.gameState.board[from.r][from.c]?.unit; if (attacker) attacker.lastAttackTurn = window.gameState.turn;
    setTimeout(() => {
      window.updateUnits(); window.updateUI();
      try { window.schedulePush && window.schedulePush('magic-battle-finish', { force: true }); } catch {}
      if (interactionState.autoEndTurnAfterAttack) {
        interactionState.autoEndTurnAfterAttack = false;
      try { window.endTurn && window.endTurn(); } catch {}
    }
    }, 1000);
  } else {
    try { window.applyGameState(res.n1); } catch {}
    window.updateUnits(); window.updateUI();
    const attacker = window.gameState.board[from.r][from.c]?.unit; if (attacker) attacker.lastAttackTurn = window.gameState.turn;
    try { window.schedulePush && window.schedulePush('magic-battle-finish', { force: true }); } catch {}
    if (interactionState.autoEndTurnAfterAttack) {
      interactionState.autoEndTurnAfterAttack = false;
      try { window.endTurn && window.endTurn(); } catch {}
    }
  }
  return true;
}

// Обычная атака с предварительным выбором клетки
function performChosenAttack(from, targetMesh) {
  const gameState = window.gameState;
  const attacker = gameState.board?.[from.r]?.[from.c]?.unit; if (!attacker) return;
  if (attacker.lastAttackTurn === gameState.turn) {
    showNotification('Некорректная атака', 'error');
    return;
  }
  const tr = targetMesh.userData.row; const tc = targetMesh.userData.col;
  const dr = tr - from.r; const dc = tc - from.c;
  const absDir = dr < 0 ? 'N' : dr > 0 ? 'S' : dc > 0 ? 'E' : 'W';
  const ORDER = ['N', 'E', 'S', 'W'];
  const relDir = ORDER[(ORDER.indexOf(absDir) - ORDER.indexOf(attacker.facing) + 4) % 4];
  const dist = Math.max(Math.abs(dr), Math.abs(dc));
  const opts = { chosenDir: relDir, rangeChoices: { [relDir]: dist } };
  const hits = window.computeHits(gameState, from.r, from.c, opts);
  if (!hits.length) { showNotification('Incorrect target', 'error'); return false; }
  window.performBattleSequence(from.r, from.c, true, opts);
  return true;
}

function castSpellOnUnit(cardMesh, unitMesh) {
  const gameState = window.gameState;
  const idx = cardMesh.userData.handIndex;
  const pl = gameState.players[gameState.active];
  if (idx == null || idx < 0 || idx >= pl.hand.length) { resetCardSelection(); return; }
  const tpl = pl.hand[idx];
  if (!tpl || tpl.type !== 'SPELL') { resetCardSelection(); return; }
  if (tpl.cost > pl.mana) { showNotification('Insufficient mana', 'error'); resetCardSelection(); return; }
  const r = unitMesh.userData.row;
  const c = unitMesh.userData.col;
  const u = gameState.board[r][c].unit;
  const handled = window.__spells.castSpellOnUnit({ cardMesh, unitMesh, idx, pl, tpl, r, c, u });
  if (!handled) { showNotification('Incorrect target', 'error'); }
}

function castSpellByDrag(cardMesh, unitMesh, tileMesh) {
  const gameState = window.gameState;
  const idx = cardMesh.userData.handIndex;
  const pl = gameState.players[gameState.active];
  if (idx == null || idx < 0 || idx >= pl.hand.length) { return; }
  const tpl = pl.hand[idx];
  if (!tpl || tpl.type !== 'SPELL') { return; }
  if (tpl.cost > pl.mana) { showNotification('Insufficient mana', 'error'); return; }
  const id = tpl.id;
  const requiresUnitTarget = window.__spells.requiresUnitTarget(id);
  const ctx = getCtx();
  const THREE = ctx.THREE || (typeof window !== 'undefined' ? window.THREE : undefined);
  if (requiresUnitTarget) {
    if (!unitMesh) { showNotification('Drag this card on a unit', 'error'); return; }
    try {
      const glow = new THREE.Mesh(
        new THREE.RingGeometry(0.4, 0.6, 32),
        new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.0 })
      );
      glow.rotation.x = -Math.PI / 2;
      glow.position.copy(unitMesh.position).add(new THREE.Vector3(0, 0.3, 0));
      ctx.effectsGroup.add(glow);
      gsap.to(glow.material, { opacity: 0.8, duration: 0.12 })
        .then(() => gsap.to(glow.scale, { x: 2.2, y: 2.2, z: 2.2, duration: 0.35, ease: 'power1.out' }))
        .then(() => gsap.to(glow.material, { opacity: 0, duration: 0.28, onComplete: () => ctx.effectsGroup.remove(glow) }));
    } catch {}
    castSpellOnUnit(cardMesh, unitMesh);
    return;
  }
  const handled = window.__spells.castSpellByDrag({ cardMesh, unitMesh, tileMesh, idx, pl, tpl });
  if (!handled) { showNotification('Incorrect target', 'error'); }
}

export function placeUnitWithDirection(direction) {
  const gameState = window.gameState;
  if (!interactionState.pendingPlacement) return;
  const { card, row, col, handIndex } = interactionState.pendingPlacement;
  const cardData = card.userData.cardData;
  const player = gameState.players[gameState.active];
  if (cardData.cost > player.mana) {
    showNotification('Insufficient mana!', 'error');
    returnCardToHand(card);
    try { window.__ui.panels.hideOrientationPanel(); } catch {}
    interactionState.pendingPlacement = null;
    return;
  }
  const unit = {
    uid: window.uid(),
    owner: gameState.active,
    tplId: cardData.id,
    currentHP: cardData.hp,
    facing: direction,
  };
  gameState.board[row][col].unit = unit;
  player.mana -= cardData.cost;
  player.discard.push(cardData);
  player.hand.splice(handIndex, 1);
  // проверяем состояние Summoning Lock до начала действий
  const totalUnits = (typeof window.countUnits === 'function') ? window.countUnits(gameState) : 0;
  const unlockTriggered = !gameState.summoningUnlocked && totalUnits >= 4;
  if (unlockTriggered) {
    gameState.summoningUnlocked = true;
    try { window.__ui?.summonLock?.prepareUnlock(); } catch {}
  }
  const cellElement = gameState.board[row][col].element;
  const buff = window.computeCellBuff(cellElement, cardData.element);
  if (buff.hp !== 0) {
    const before = unit.currentHP;
    unit.currentHP = Math.max(0, unit.currentHP + buff.hp);
    if (buff.hp > 0) window.addLog(`Элемент усиливает ${cardData.name}: HP ${before}→${unit.currentHP}`);
    else window.addLog(`Элемент ослабляет ${cardData.name}: HP ${before}→${unit.currentHP}`);
  }
  let alive = unit.currentHP > 0;
  if (alive && cardData.diesOffElement && cellElement !== cardData.diesOffElement) {
    window.addLog(`${cardData.name} погибает вдали от стихии ${cardData.diesOffElement}!`);
    alive = false;
  }
  if (!alive) {
    const owner = unit.owner;
    try { gameState.players[owner].graveyard.push(window.CARDS[unit.tplId]); } catch {}
    const death = { r: row, c: col, owner, tplId: unit.tplId };
    applyOnDeathEffects(gameState, [death]);
    const ctx = getCtx();
    const THREE = ctx.THREE || (typeof window !== 'undefined' ? window.THREE : undefined);
    const pos = ctx.tileMeshes[row][col].position.clone().add(new THREE.Vector3(0, 1.2, 0));
    const slot = gameState.players?.[owner]?.mana || 0;
    window.animateManaGainFromWorld(pos, owner, true, slot);
    gameState.board[row][col].unit = null;
  }
  if (gameState.board[row][col].unit) {
    const gained = applyFreedonianAura(gameState, gameState.active);
    if (gained > 0) {
      window.addLog(`Фридонийский Странник приносит ${gained} маны.`);
    }
  }
  // Синхронизируем состояние после призыва
  try { window.applyGameState(gameState); } catch {}
  const ctx = getCtx();
  const targetPos = ctx.tileMeshes[row][col].position.clone();
  // Используем ту же высоту, что и при окончательной отрисовке юнита
  const baseY = (ctx.tileFrames?.[row]?.[col]?.children?.[0]?.position?.y ?? 1.0) + 0.28;
  targetPos.y = baseY;
  gsap.to(card.position, {
    x: targetPos.x,
    y: targetPos.y,
    z: targetPos.z,
    duration: 0.5,
    ease: 'power2.inOut',
  });
  gsap.to(card.rotation, {
    x: 0,
    y: (window.facingDeg[direction]) * Math.PI / 180,
    z: 0,
    duration: 0.5,
    onComplete: () => {
      window.updateHand();
      window.updateUnits();
      window.updateUI();
      const tpl = window.CARDS?.[cardData.id];
      if (tpl?.attackType === 'MAGIC') {
        const allowFriendly = !!tpl.friendlyFire;
        const cells = [];
        let hasEnemy = false;
        for (let rr = 0; rr < 3; rr++) {
          for (let cc = 0; cc < 3; cc++) {
            if (rr === row && cc === col) continue;
            const u = gameState.board?.[rr]?.[cc]?.unit;
            if (allowFriendly || (u && u.owner !== unit.owner)) {
              cells.push({ r: rr, c: cc });
            }
            if (u && u.owner !== unit.owner) hasEnemy = true;
          }
        }
        if (cells.length && (allowFriendly || hasEnemy)) {
          interactionState.magicFrom = { r: row, c: col };
          interactionState.autoEndTurnAfterAttack = true;
          highlightTiles(cells);
          window.__ui?.log?.add?.(`${tpl.name}: select a target for the magical attack.`);
          if (unlockTriggered) {
            const delay = 1200;
            setTimeout(() => { try { window.__ui?.summonLock?.playUnlockAnimation(); } catch {} }, delay);
          }
        } else {
          if (unlockTriggered) { setTimeout(() => { try { window.__ui?.summonLock?.playUnlockAnimation(); } catch {} }, 0); }
          try { window.endTurn && window.endTurn(); } catch {}
        }
      } else {
        const attacks = tpl?.attacks || [];
        const needsChoice = tpl?.chooseDir || attacks.some(a => a.mode === 'ANY');
        // если в шаблоне несколько дистанций без выбора, подсвечиваем и пустые клетки
        const includeEmpty = attacks.some(a => Array.isArray(a.ranges) && a.ranges.length > 1 && !a.mode);
        const hitsAll = window.computeHits(gameState, row, col, { union: true, includeEmpty });
        const hasEnemy = hitsAll.some(h => {
          const u2 = gameState.board?.[h.r]?.[h.c]?.unit;
          return u2 && u2.owner !== unit.owner;
        });
        if (hitsAll.length && hasEnemy) {
          if (needsChoice && hitsAll.length > 1) {
            interactionState.pendingAttack = { r: row, c: col };
            interactionState.autoEndTurnAfterAttack = true;
            highlightTiles(hitsAll);
            window.__ui?.log?.add?.(`${tpl.name}: выберите цель для атаки.`);
            window.__ui?.notifications?.show('Выберите цель', 'info');
          } else {
            let opts = {};
            if (needsChoice && hitsAll.length === 1) {
              const h = hitsAll[0];
              const dr = h.r - row, dc = h.c - col;
              const absDir = dr < 0 ? 'N' : dr > 0 ? 'S' : dc > 0 ? 'E' : 'W';
              const ORDER = ['N', 'E', 'S', 'W'];
              const relDir = ORDER[(ORDER.indexOf(absDir) - ORDER.indexOf(unit.facing) + 4) % 4];
              const dist = Math.max(Math.abs(dr), Math.abs(dc));
              opts = { chosenDir: relDir, rangeChoices: { [relDir]: dist } };
            }
            interactionState.autoEndTurnAfterAttack = true;
            window.performBattleSequence(row, col, true, opts);
          }
          if (unlockTriggered) {
            const delay = 1200;
            setTimeout(() => { try { window.__ui?.summonLock?.playUnlockAnimation(); } catch {} }, delay);
          }
        } else {
          if (unlockTriggered) { setTimeout(() => { try { window.__ui?.summonLock?.playUnlockAnimation(); } catch {} }, 0); }
          try { window.endTurn && window.endTurn(); } catch {}
        }
      }
      try { window.__ui?.cancelButton?.refreshCancelButton(); } catch {}
    },
  });
  gsap.to(card.scale, { x: 1, y: 1, z: 1, duration: 0.5, ease: 'power2.inOut' });
  window.addLog(`${player.name} призывает ${cardData.name} на (${row + 1},${col + 1})`);
  try { window.__ui.panels.hideOrientationPanel(); } catch {}
  interactionState.pendingPlacement = null;
  try { window.__ui?.cancelButton?.refreshCancelButton(); } catch {}
}

export function setupInteractions() {
  const ctx = getCtx();
  const { renderer } = ctx;
  if (!renderer || !renderer.domElement) return;
  renderer.domElement.addEventListener('mousemove', onMouseMove);
  renderer.domElement.addEventListener('mousedown', onMouseDown);
  renderer.domElement.addEventListener('mouseup', onMouseUp);
  renderer.domElement.addEventListener('mouseleave', () => {
    if (interactionState.hoveredHandCard) {
      gsap.to(interactionState.hoveredHandCard.scale, { x: 0.54, y: 1, z: 0.54, duration: 0.18 });
      setHandCardHoverVisual(interactionState.hoveredHandCard, false);
      interactionState.hoveredHandCard = null;
    }
  });
}

export function getSelectedUnit() { return interactionState.selectedUnit; }
export function clearSelectedUnit() {
  interactionState.selectedUnit = null;
  interactionState.pendingAttack = null;
  interactionState.magicFrom = null;
  clearHighlights();
}
export function getPendingPlacement() { return interactionState.pendingPlacement; }
export function clearPendingPlacement() { interactionState.pendingPlacement = null; }
export function getPendingSpellOrientation() { return interactionState.pendingSpellOrientation; }
export function clearPendingSpellOrientation() { interactionState.pendingSpellOrientation = null; }

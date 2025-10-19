// Pointer and drag interactions for Three.js scene
import { getCtx } from './context.js';
import { buildManaGainPlan } from './manaFx.js';
import { setHandCardHoverVisual } from './hand.js';
import { highlightTiles, clearHighlights } from './highlight.js';
import { highlightPlacement, clearPlacementHighlights } from './placementHighlight.js';
import { trackUnitHover, resetUnitHover } from './unitTooltip.js';
import { showTooltip, hideTooltip } from '../ui/tooltip.js';
import {
  applySummonAbilities,
  evaluateIncarnationSummon,
  applyIncarnationSummon,
  applyFieldFatalityCheck,
  describeFieldFatality,
  isIncarnationCard,
} from '../core/abilities.js';
import { capMana } from '../core/constants.js';
import { getAvailableEmptyCells, canSummonOnEmptyCell } from '../core/placementRules.js';
import { applyDeathDiscardEffects } from '../core/abilityHandlers/discard.js';
import { applyManaGainOnDeaths } from '../core/abilityHandlers/manaGain.js';
import { applyDeathManaSteal } from '../core/abilityHandlers/manaSteal.js';
import { applyDeathRepositionEffects } from '../core/abilityHandlers/deathReposition.js';
import { createDeathEntry } from '../core/abilityHandlers/deathRecords.js';
import { animateManaSteal } from '../ui/manaStealFx.js';
import { playFieldquakeFxBatch } from './fieldquakeFx.js';

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
  pendingRitualOrigin: null,
  pendingUnitAbility: null,
  pendingAbilityOrientation: null,
  pendingSpellTeleportation: null,
  pendingSpellTelekinesis: null,
  pendingSpellFieldExchange: null,
  pendingSpellLapse: null,
  pendingSpellElementalDominion: null,
  spellDragHandled: false,
  // флаг для автоматического завершения хода после атаки
  autoEndTurnAfterAttack: false,
  // список событий получения маны, которые можно отменить при отмене призыва
  pendingSummonManaGain: null,
  // блокировки открытия меню действий до завершения автоатаки
  unitMenuLocks: new Set(),
};

const AUTO_ATTACK_MENU_LOCK_MS = 12000;
const unitMenuLockTimers = new Map();

function ensureUnitMenuLockSet() {
  if (!(interactionState.unitMenuLocks instanceof Set)) {
    interactionState.unitMenuLocks = new Set();
  }
  return interactionState.unitMenuLocks;
}

function scheduleUnitMenuUnlock(uid) {
  if (uid == null || typeof window === 'undefined') return;
  if (unitMenuLockTimers.has(uid)) return;
  try {
    const timer = window.setTimeout(() => {
      unlockUnitMenuByUid(uid);
    }, AUTO_ATTACK_MENU_LOCK_MS);
    unitMenuLockTimers.set(uid, timer);
  } catch {}
}

function cancelUnitMenuUnlock(uid) {
  if (uid == null || typeof window === 'undefined') return;
  const timer = unitMenuLockTimers.get(uid);
  if (timer != null) {
    try { window.clearTimeout(timer); } catch {}
    unitMenuLockTimers.delete(uid);
  }
}

function clearAllUnitMenuTimers() {
  if (typeof window === 'undefined') {
    unitMenuLockTimers.clear();
    return;
  }
  for (const timer of unitMenuLockTimers.values()) {
    if (timer != null) {
      try { window.clearTimeout(timer); } catch {}
    }
  }
  unitMenuLockTimers.clear();
}

function lockUnitMenuForUnit(unit) {
  if (!unit) return;
  const uid = unit.uid ?? null;
  if (uid == null) return;
  const locks = ensureUnitMenuLockSet();
  locks.add(uid);
  scheduleUnitMenuUnlock(uid);
  try { window.__ui?.panels?.hideUnitActionPanel?.(); } catch {}
}

export function unlockUnitMenuByUid(uid = null) {
  const locks = ensureUnitMenuLockSet();
  if (uid == null) {
    locks.clear();
    clearAllUnitMenuTimers();
    return;
  }
  if (locks.delete(uid)) {
    cancelUnitMenuUnlock(uid);
  }
}

export function isUnitMenuLockedByUid(uid) {
  if (uid == null) return false;
  const locks = ensureUnitMenuLockSet();
  return locks.has(uid);
}

export function isUnitMenuLockedForMesh(unitMesh) {
  if (!unitMesh) return false;
  const uid = unitMesh.userData?.unitData?.uid ?? unitMesh.userData?.unitUid ?? null;
  return isUnitMenuLockedByUid(uid);
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('battle-sequence-resolved', () => {
    // По завершении боевой анимации снимаем все временные блокировки
    unlockUnitMenuByUid(null);
  });
}

function normalizeManaGainEntries(entries) {
  if (!Array.isArray(entries)) return [];
  const res = [];
  for (const entry of entries) {
    const owner = (entry && typeof entry.owner === 'number') ? entry.owner : null;
    const amountRaw = entry ? Number(entry.amount) : 0;
    const amount = Number.isFinite(amountRaw) ? Math.max(0, Math.floor(amountRaw)) : 0;
    if (owner == null || amount <= 0) continue;
    res.push({ owner, amount });
  }
  return res;
}

function setPendingSummonManaGain(entries) {
  const normalized = normalizeManaGainEntries(entries);
  interactionState.pendingSummonManaGain = normalized.length ? normalized : null;
}

export function clearPendingSummonManaGain() {
  interactionState.pendingSummonManaGain = null;
}

export function undoPendingSummonManaGain() {
  if (typeof window === 'undefined') {
    interactionState.pendingSummonManaGain = null;
    return;
  }
  const gs = window.gameState;
  if (!gs || !Array.isArray(gs.players)) {
    interactionState.pendingSummonManaGain = null;
    return;
  }
  const entries = Array.isArray(interactionState.pendingSummonManaGain)
    ? interactionState.pendingSummonManaGain
    : [];
  if (!entries.length) return;
  for (const entry of entries) {
    if (!entry) continue;
    const owner = entry.owner;
    const amount = entry.amount;
    if (owner == null || amount <= 0) continue;
    const player = gs.players[owner];
    if (!player) continue;
    const before = Number.isFinite(player.mana) ? player.mana : 0;
    const after = Math.max(0, before - amount);
    player.mana = after;
  }
  interactionState.pendingSummonManaGain = null;
  try { window.updateUI?.(gs); } catch {}
}

const AUTO_END_TURN_RETRY_MS = 120;
const AUTO_END_TURN_MAX_ATTEMPTS = 60;

// Счётчик ожидания авто-завершения хода — помогает не запускать его без явного запроса
function adjustPendingAutoEnd(delta) {
  if (typeof window === 'undefined') return;
  const gs = window.gameState;
  if (!gs) return;
  const current = Math.max(0, Number(gs.pendingAutoEndRequests) || 0);
  const next = current + delta;
  gs.pendingAutoEndRequests = next > 0 ? next : 0;
}

export function hasPendingForcedDiscards() {
  if (typeof window === 'undefined') return false;
  const state = window.gameState;
  if (!state) return false;
  const queue = Array.isArray(state.pendingDiscards) ? state.pendingDiscards : [];
  return queue.some(req => req && req.remaining > 0);
}

function processManaStealEvents(events, opts = {}) {
  if (!Array.isArray(events) || !events.length) return;
  const skipLog = !!opts.skipLog;
  for (const ev of events) {
    if (!ev) continue;
    if (!skipLog && ev.log) {
      try { window.addLog?.(ev.log); } catch {}
    }
    try {
      if (typeof animateManaSteal === 'function') {
        animateManaSteal(ev);
      } else {
        window.animateManaSteal?.(ev);
      }
    } catch (err) {
      console.warn('[mana] Не удалось анимировать кражу маны:', err);
    }
  }
}

// Планировщик авто-завершения хода, который дожидается окончания анимаций и разблокировки ввода
function scheduleAutoEndTurnRetry(delayMs = AUTO_END_TURN_RETRY_MS, maxAttempts = AUTO_END_TURN_MAX_ATTEMPTS) {
  if (typeof window === 'undefined') return;
  const w = window;
  let attempts = 0;

  const tryFinish = () => {
    if (!w || typeof w.endTurn !== 'function') return;
    if (attempts >= maxAttempts) return;
    attempts += 1;
    if (w.__endTurnInProgress) {
      setTimeout(tryFinish, delayMs);
      return;
    }
    if (hasPendingForcedDiscards()) {
      setTimeout(tryFinish, delayMs);
      return;
    }
    const lockFn = typeof w.isInputLocked === 'function' ? w.isInputLocked : null;
    const locked = lockFn ? lockFn() : false;
    const bannerActive = (w.__ui && w.__ui.banner && typeof w.__ui.banner.getState === 'function')
      ? !!w.__ui.banner.getState()._splashActive
      : !!w.splashActive;
    if (locked || bannerActive) {
      setTimeout(tryFinish, delayMs);
      return;
    }
    try {
      adjustPendingAutoEnd(-1);
      w.endTurn();
    } catch {}
  };

  setTimeout(tryFinish, delayMs);
}

export function requestAutoEndTurn(opts = {}) {
  const { resumeOnly = false } = opts || {};
  if (!resumeOnly) {
    adjustPendingAutoEnd(1);
  }
  scheduleAutoEndTurnRetry();
}

const META_TOOLTIP_SOURCE = 'meta-hover';

export function logDodgeUpdates(updates, state, sourceName = null) {
  if (!Array.isArray(updates) || !updates.length) return;
  const cardsRef = window.CARDS || {};
  for (const upd of updates) {
    const targetUnit = state?.board?.[upd.r]?.[upd.c]?.unit;
    if (!targetUnit) continue;
    const tplTarget = cardsRef[targetUnit.tplId];
    const name = tplTarget?.name || 'Существо';
    const prefix = sourceName ? `${sourceName}: ` : '';
    if (upd.removed) {
      window.__ui?.log?.add?.(`${prefix}${name}: способность Dodge отключена.`);
      continue;
    }
    const chance = (typeof upd.chance === 'number') ? Math.round(upd.chance * 100) : 50;
    if (upd.unlimited) {
      window.__ui?.log?.add?.(`${prefix}${name}: шанс Dodge ${chance}%.`);
    } else if (typeof upd.attempts === 'number') {
      window.__ui?.log?.add?.(`${prefix}${name}: ${upd.attempts} попытк(и) Dodge (${chance}%).`);
    }
  }
}

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
    resetUnitHover();
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

    let hoveredUnitMesh = null;
    const unitHits = raycaster.intersectObjects(unitMeshes, true);
    if (unitHits.length > 0) {
      let candidate = unitHits[0].object;
      while (candidate && (!candidate.userData || candidate.userData.type !== 'unit')) {
        candidate = candidate.parent;
      }
      if (candidate && candidate.userData?.type === 'unit') {
        hoveredUnitMesh = candidate;
      }
    }
    const gameState = typeof window !== 'undefined' ? window.gameState : null;
    if (hoveredUnitMesh && gameState) {
      const r = hoveredUnitMesh.userData?.row;
      const c = hoveredUnitMesh.userData?.col;
      if (r != null && c != null) {
        const unit = gameState.board?.[r]?.[c]?.unit;
        if (unit) {
          trackUnitHover({ unit, r, c, event });
        } else {
          resetUnitHover();
        }
      } else {
        resetUnitHover();
      }
    } else {
      resetUnitHover();
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
  let metaShown = false;
  if (metaHits.length > 0) {
    const obj = metaHits[0].object;
    const data = obj.userData || obj.parent?.userData || {};
    if (data && data.metaType) {
      const p = data.player ?? 0;
      interactionState.hoveredMeta = { metaType: data.metaType, player: p };
      const deckCount = window.gameState?.players?.[p]?.deck?.length ?? 0;
      const gyCount = window.gameState?.players?.[p]?.graveyard?.length ?? 0;
      const text = data.metaType === 'deck'
        ? `Deck - Player ${p === 0 ? '1' : '2'}: ${deckCount}`
        : `Graveyard - Player ${p === 0 ? '1' : '2'}: ${gyCount}`;
      showTooltip(META_TOOLTIP_SOURCE, {
        text,
        x: (event.clientX ?? 0) + 16,
        y: (event.clientY ?? 0) + 16,
      });
      metaShown = true;
    }
  }
  if (!metaShown) {
    interactionState.hoveredMeta = null;
    hideTooltip(META_TOOLTIP_SOURCE);
  }
}

function onMouseDown(event) {
  const gameState = (typeof window !== 'undefined' ? window.gameState : null);
  if (!gameState || gameState.winner !== null) return;
  if (isInputLocked() && !interactionState.pendingDiscardSelection) return;
  resetUnitHover();
  hideTooltip(META_TOOLTIP_SOURCE);
  const ctx = getCtx();
  const { renderer, mouse, raycaster, unitMeshes, handCardMeshes, tileMeshes } = ctx;
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, ctx.camera);

  const handIntersects = raycaster.intersectObjects(handCardMeshes, true);
  if (handIntersects.length > 0) {
    const hitObj = handIntersects[0].object;
    const card = hitObj.userData?.isInHand ? hitObj : hitObj.parent;
    const cardData = card.userData.cardData;
    const selector = interactionState.pendingDiscardSelection;
    const ignoreLock = !!selector;
    if (cardData.locked && !gameState.summoningUnlocked && !ignoreLock) {
      showNotification('Summoning Lock: This card cannot be played until there are at least 4 units on the board at the same time', 'error');
      return;
    }
    if (selector && cardData) {
      const handIdx = card.userData.handIndex;
      const matchesType = !selector.requiredType || cardData.type === selector.requiredType;
      const matchesFilter = typeof selector.filter !== 'function' || selector.filter(cardData, handIdx, selector);
      if (matchesType && matchesFilter) {
        try { selector.onPicked?.(handIdx); } catch {}
        if (!selector.keepAfterPick) interactionState.pendingDiscardSelection = null;
      } else if (selector.invalidMessage) {
        showNotification(selector.invalidMessage, 'error');
      }
      return;
    }
    if (cardData.type === 'UNIT' || cardData.type === 'SPELL') {
      startCardDrag(card);
    }
    return;
  }

  const unitIntersects = raycaster.intersectObjects(unitMeshes, true);
  let unitMesh = null;
  if (unitIntersects.length > 0) {
    let candidate = unitIntersects[0].object;
    while (candidate && (!candidate.userData || candidate.userData.type !== 'unit')) candidate = candidate.parent;
    if (candidate && candidate.userData?.type === 'unit') unitMesh = candidate;
  }

  let tileForSpell = null;
  if (
    interactionState.pendingSpellTeleportation
    || interactionState.pendingSpellTelekinesis
    || interactionState.pendingSpellFieldExchange
  ) {
    const flatTiles = Array.isArray(tileMeshes) ? tileMeshes.flat() : [];
    if (flatTiles.length) {
      const tileHits = raycaster.intersectObjects(flatTiles, true);
      if (tileHits.length > 0) tileForSpell = tileHits[0].object;
    }
  }

  if (window.__spells?.handlePendingBoardClick?.({ unitMesh, tileMesh: tileForSpell })) {
    return;
  }

  if (unitMesh) {
    if (interactionState.magicFrom) {
      const ok = performMagicAttack(interactionState.magicFrom, unitMesh);
      if (ok) {
        interactionState.magicFrom = null;
        clearHighlights();
      }
      try { window.__ui?.cancelButton?.refreshCancelButton(); } catch {}
      return;
    }
    if (interactionState.pendingAttack) {
      const ok = performChosenAttack(interactionState.pendingAttack, unitMesh);
      if (ok) {
        interactionState.pendingAttack = null;
        clearHighlights();
      }
      try { window.__ui?.cancelButton?.refreshCancelButton(); } catch {}
      return;
    }
    if (interactionState.selectedCard && interactionState.selectedCard.userData.cardData.type === 'SPELL') {
      castSpellOnUnit(interactionState.selectedCard, unitMesh);
    } else if (unitMesh.userData.unitData.owner === gameState.active) {
      if (isUnitMenuLockedForMesh(unitMesh)) {
        return;
      }
      interactionState.selectedUnit = unitMesh;
      try { window.__ui.panels.showUnitActionPanel(unitMesh); } catch {}
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
        const existingUnit = gameState.board[row][col].unit;
        const playerIndex = gameState.active;
        if (!existingUnit) {
          const placementCheck = canSummonOnEmptyCell(gameState, playerIndex, row, col);
          if (!placementCheck.allowed) {
            const message = placementCheck.reason || 'Choose a different field for this summon.';
            showNotification(message, 'error');
            returnCardToHand(interactionState.draggedCard);
            endCardDrag();
            return;
          }
        }
        if (existingUnit) {
          if (!isIncarnationCard(cardData)) {
            showNotification('Cell is occupied: pick an empty field.', 'error');
            returnCardToHand(interactionState.draggedCard);
            endCardDrag();
            return;
          }
          const check = evaluateIncarnationSummon(gameState, { r: row, c: col, tpl: cardData, owner: playerIndex });
          if (!check?.ok) {
            showNotification('Incarnation is not possible on this field.', 'error');
            returnCardToHand(interactionState.draggedCard);
            endCardDrag();
            return;
          }
          const player = gameState.players[playerIndex];
          if (check.cost > player.mana) {
            showNotification(`You need ${check.cost} mana for the incarnation.`, 'error');
            returnCardToHand(interactionState.draggedCard);
            endCardDrag();
            return;
          }
          interactionState.pendingPlacement = {
            card: interactionState.draggedCard,
            row,
            col,
            handIndex: interactionState.draggedCard.userData.handIndex,
            incarnation: { ...check, active: true },
          };
        } else {
          if (isIncarnationCard(cardData)) {
            showNotification('Incarnation requires a friendly unit on the field.', 'error');
            returnCardToHand(interactionState.draggedCard);
            endCardDrag();
            return;
          }
          interactionState.pendingPlacement = {
            card: interactionState.draggedCard,
            row,
            col,
            handIndex: interactionState.draggedCard.userData.handIndex,
            incarnation: null,
          };
        }
        // Сразу опускаем карту на высоту клетки, чтобы убрать резкий подъём
        try {
          const baseY = (tileFrames?.[row]?.[col]?.children?.[0]?.position?.y ?? 1.0) + 0.28;
          const pos = tileMeshes[row][col].position.clone();
          pos.y = baseY;
          gsap.to(interactionState.draggedCard.position, { x: pos.x, y: pos.y, z: pos.z, duration: 0.15 });
        } catch {}
        try { window.__ui.panels.showOrientationPanel(); } catch {}
        try { window.__ui?.cancelButton?.refreshCancelButton(); } catch {}
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
    clearPlacementHighlights();
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
    } else if (data && data.type === 'UNIT') {
      const gs = window.gameState;
      if (gs && typeof gs.active === 'number') {
        const cells = getAvailableEmptyCells(gs, gs.active);
        highlightPlacement(cells);
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
  clearPlacementHighlights();
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

// Визуальное оповещение для эффекта Оракула при смерти
export function showOracleDeathBuff(owner, amount) {
  const ctx = getCtx();
  const { unitMeshes } = ctx;
  const gs = window.gameState;
  if (!unitMeshes || !gs) return;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const u = gs.board?.[r]?.[c]?.unit;
      if (!u || u.owner !== owner) continue;
      const m = unitMeshes.find(m => m.userData.row === r && m.userData.col === c);
      try { window.__fx?.spawnDamageText?.(m, `+${amount}`, '#22c55e'); } catch {}
    }
  }
}

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
  if (
    interactionState.pendingSpellTeleportation
    || interactionState.pendingSpellTelekinesis
    || interactionState.pendingSpellFieldExchange
    || interactionState.pendingSpellLapse
    || interactionState.pendingSpellElementalDominion
  ) {
    try { window.__ui?.panels?.hidePrompt?.(); } catch {}
  }
  interactionState.pendingSpellTeleportation = null;
  interactionState.pendingSpellTelekinesis = null;
  if (interactionState.pendingSpellFieldExchange) {
    try { window.__spells?.cancelFieldExchangeSelection?.(); } catch {}
    interactionState.pendingSpellFieldExchange = null;
  }
  if (interactionState.pendingSpellLapse) {
    try { window.__spells?.cancelMesmerLapseSelection?.(); } catch {}
    interactionState.pendingSpellLapse = null;
    interactionState.pendingDiscardSelection = null;
  }
  if (interactionState.pendingSpellElementalDominion) {
    try { window.__spells?.cancelElementalDominionSelection?.(); } catch {}
    interactionState.pendingSpellElementalDominion = null;
  }
  clearHighlights();
  clearPlacementHighlights();
  try { window.__ui?.cancelButton?.refreshCancelButton(); } catch {}
}

function performMagicAttack(from, targetMesh) {
  const ctx = getCtx();
  const { unitMeshes, tileMeshes } = ctx;
  const THREE = ctx.THREE || (typeof window !== 'undefined' ? window.THREE : undefined);
  const gameState = window.gameState;
  const attacker = gameState.board?.[from.r]?.[from.c]?.unit;
  if (!attacker || attacker.lastAttackTurn === gameState.turn) {
    showNotification('Invalid attack', 'error');
    return false;
  }
  const res = window.magicAttack(gameState, from.r, from.c, targetMesh.userData.row, targetMesh.userData.col);
  if (!res) { showNotification('Incorrect target', 'error'); return false; }

  clearPendingSummonManaGain();

  const pendingFieldquakes = Array.isArray(res.fieldquakes) ? res.fieldquakes.filter(Boolean) : [];
  if (pendingFieldquakes.length) {
    const broadcastFx = (typeof window.NET_ON === 'function' ? window.NET_ON() : false)
      && typeof window.MY_SEAT === 'number'
      && typeof gameState?.active === 'number'
      && window.MY_SEAT === gameState.active;
    // Проигрываем единый спецэффект fieldquake и при необходимости шлём синхронизацию
    playFieldquakeFxBatch(pendingFieldquakes, { broadcast: broadcastFx });
  }

  for (const l of res.logLines.reverse()) window.addLog(l);
  const aMesh = unitMeshes.find(m => m.userData.row === from.r && m.userData.col === from.c);
  if (aMesh) {
    try {
      gsap.fromTo(aMesh.position, { y: aMesh.position.y }, { y: aMesh.position.y + 0.3, yoyo: true, repeat: 1, duration: 0.12 });
    } catch {}
  }

  const hitVisuals = [];
  for (const t of res.targets || []) {
    const mesh = unitMeshes.find(m => m.userData.row === t.r && m.userData.col === t.c) || null;
    const dmg = Number.isFinite(t?.dmg) ? t.dmg : 0;
    hitVisuals.push({ mesh, dmg });
  }

  const manaPlan = buildManaGainPlan({
    playersBefore: gameState.players,
    deaths: res.deaths || [],
    manaGainEntries: res.manaGainEvents || [],
    tileMeshes,
    THREE,
  });

  const deathVisuals = [];
  for (const d of res.deaths || []) {
    const mesh = unitMeshes.find(m => m.userData.row === d.r && m.userData.col === d.c) || null;
    let manaOrigin = null;
    try {
      manaOrigin = manaPlan?.getOrigin?.(d) || null;
      if (!manaOrigin) {
        const tile = tileMeshes?.[d.r]?.[d.c];
        if (tile?.position?.clone) {
          manaOrigin = tile.position.clone().add(new THREE.Vector3(0, 1.2, 0));
        }
      }
    } catch {}
    deathVisuals.push({
      death: d,
      mesh,
      manaOrigin,
      tpl: CARDS[d.tplId] || null,
    });
  }

  let appliedState = res.n1;
  try {
    window.applyGameState(res.n1);
    appliedState = window.gameState || res.n1;
  } catch { appliedState = res.n1; }

  const attackerCoords = res.attackerPosUpdate || { r: from.r, c: from.c };
  const attackerState = appliedState?.board?.[attackerCoords.r]?.[attackerCoords.c]?.unit;
  if (attackerState) attackerState.lastAttackTurn = appliedState.turn;

  for (const info of deathVisuals) {
    try {
      const owner = info.death.owner;
      const grave = appliedState?.players?.[owner]?.graveyard;
      if (grave && info.tpl) grave.push(info.tpl);
    } catch {}
  }

  const playHitEffects = () => {
    for (const info of hitVisuals) {
      if (!info.mesh) continue;
      try {
        window.__fx?.magicBurst?.(info.mesh.position.clone().add(new THREE.Vector3(0, 0.4, 0)));
      } catch {}
      try {
        window.__fx?.shakeMesh?.(info.mesh, 6, 0.12);
      } catch {}
      if (info.dmg > 0) {
        try { window.__fx?.spawnDamageText?.(info.mesh, `-${info.dmg}`, '#ff5555'); } catch {}
      }
    }
  };

  const playDeathEffects = () => {
    for (const info of deathVisuals) {
      if (info.mesh) {
        try { window.__fx?.dissolveAndAsh?.(info.mesh, new THREE.Vector3(0, 0, 0.6), 0.9); } catch {}
      }
    }
    try { manaPlan?.schedule?.(); } catch {}
  };

  playHitEffects();
  if (deathVisuals.length) {
    playDeathEffects();
    for (const info of deathVisuals) {
      if (info.tpl?.onDeathAddHPAll) {
        try { showOracleDeathBuff(info.death.owner, info.tpl.onDeathAddHPAll); } catch {}
      }
    }
  }

  const finalize = () => {
    try { window.updateUnits(); } catch {}
    try { window.updateUI(); } catch {}
    try { window.schedulePush && window.schedulePush('magic-battle-finish', { force: true }); } catch {}
    if (interactionState.autoEndTurnAfterAttack) {
      interactionState.autoEndTurnAfterAttack = false;
      requestAutoEndTurn();
    }
  };

  if (deathVisuals.length) {
    setTimeout(finalize, 1000);
  } else {
    finalize();
  }
  return true;
}

// Обычная атака с предварительным выбором клетки
function performChosenAttack(from, targetMesh) {
  const gameState = window.gameState;
  const attacker = gameState.board?.[from.r]?.[from.c]?.unit; if (!attacker) return;
  if (attacker.lastAttackTurn === gameState.turn) {
    showNotification('Invalid attack', 'error');
    return;
  }
  const tr = targetMesh.userData.row; const tc = targetMesh.userData.col;
  const dr = tr - from.r; const dc = tc - from.c;
  const absDir = dr < 0 ? 'N' : dr > 0 ? 'S' : dc > 0 ? 'E' : 'W';
  const ORDER = ['N', 'E', 'S', 'W'];
  const relDir = ORDER[(ORDER.indexOf(absDir) - ORDER.indexOf(attacker.facing) + 4) % 4];
  const dist = Math.max(Math.abs(dr), Math.abs(dc));
  const tpl = window.CARDS?.[attacker.tplId];
  const profile = window.resolveAttackProfile
    ? window.resolveAttackProfile(gameState, from.r, from.c, tpl)
    : { attacks: tpl?.attacks || [], chooseDir: tpl?.chooseDir };
  const attacks = Array.isArray(profile?.attacks) ? profile.attacks : [];
  const needsRangeChoice = attacks.some(a => a?.mode === 'ANY');
  const opts = { chosenDir: relDir, profile };
  if (needsRangeChoice) {
    opts.rangeChoices = { [relDir]: dist };
  }
  const hits = window.computeHits(gameState, from.r, from.c, opts);
  if (!hits.length) { showNotification('Incorrect target', 'error'); return false; }
  window.performBattleSequence(from.r, from.c, true, opts);
  clearPendingSummonManaGain();
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
  const { card, row, col, handIndex, incarnation } = interactionState.pendingPlacement;
  const cardData = card.userData.cardData;
  if (!incarnation) {
    const placementCheck = canSummonOnEmptyCell(gameState, gameState.active, row, col);
    if (!placementCheck.allowed) {
      const message = placementCheck.reason || 'Choose a different field for this summon.';
      showNotification(message, 'error');
      returnCardToHand(card);
      try { window.__ui.panels.hideOrientationPanel(); } catch {}
      interactionState.pendingPlacement = null;
      return;
    }
  }
  if (card) {
    card.userData = card.userData || {};
    card.userData.isInHand = false;
    try {
      const ctxLocal = getCtx();
      if (Array.isArray(ctxLocal.handCardMeshes)) {
        ctxLocal.handCardMeshes = ctxLocal.handCardMeshes.filter(mesh => mesh !== card);
      }
    } catch {}
  }
  const player = gameState.players[gameState.active];
  const summonCost = (incarnation?.active ? (incarnation.cost ?? cardData.cost ?? 0) : cardData.cost) ?? 0;
  if (summonCost > player.mana) {
    showNotification('Not enough mana!', 'error');
    returnCardToHand(card);
    try { window.__ui.panels.hideOrientationPanel(); } catch {}
    interactionState.pendingPlacement = null;
    return;
  }
  let summonEndedTurn = false;
  const endTurnAfterSummon = () => {
    if (summonEndedTurn) return;
    summonEndedTurn = true;
    requestAutoEndTurn();
  };
  let incarnationResult = null;
  if (incarnation?.active) {
    const applied = applyIncarnationSummon(gameState, { r: row, c: col, tpl: cardData, owner: gameState.active });
    if (!applied?.ok) {
      showNotification('Incarnation cancelled.', 'error');
      returnCardToHand(card);
      try { window.__ui.panels.hideOrientationPanel(); } catch {}
      interactionState.pendingPlacement = null;
      return;
    }
    incarnationResult = applied;
    if (Array.isArray(applied.death) && applied.death.length) {
      const discardInfo = applyDeathDiscardEffects(gameState, applied.death, { cause: 'INCARNATION' });
      if (Array.isArray(discardInfo?.logs)) {
        for (const text of discardInfo.logs) {
          window.addLog(text);
        }
      }
    }
  }
  const unit = {
    uid: window.uid(),
    owner: gameState.active,
    tplId: cardData.id,
    currentHP: cardData.hp,
    facing: direction,
  };
  gameState.board[row][col].unit = unit;
  player.mana -= summonCost;
  player.discard.push(cardData);
  player.hand.splice(handIndex, 1);
  const wasIncarnation = !!incarnation?.active;
  if (wasIncarnation && incarnationResult?.sacrifice) {
    try {
      const info = incarnationResult.sacrifice;
      const ownerSac = typeof info.owner === 'number' ? info.owner : gameState.active;
      const tplSac = window.CARDS?.[info.tplId];
      if (tplSac && gameState.players?.[ownerSac]?.graveyard) {
        gameState.players[ownerSac].graveyard.push(tplSac);
      }
      if (info.tplName) {
        window.addLog(`${info.tplName} приносится в жертву ради ${cardData.name}.`);
      }
    } catch {}
    unit.lastAttackTurn = gameState.turn;
  }
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
  if (alive) {
    const hazard = applyFieldFatalityCheck(unit, cardData, cellElement);
    if (hazard.dies) {
      alive = false;
      const fatalLog = describeFieldFatality(cardData, hazard, { name: cardData.name });
      if (fatalLog) window.addLog(fatalLog);
    }
  }
  if (!alive) {
    // обработка эффектов при смерти (например, лечение союзников)
    if (cardData.onDeathAddHPAll) {
      const amount = cardData.onDeathAddHPAll;
      for (let rr = 0; rr < 3; rr++) {
        for (let cc = 0; cc < 3; cc++) {
          if (rr === row && cc === col) continue; // пропускаем саму погибшую карту
          const ally = gameState.board?.[rr]?.[cc]?.unit;
          if (!ally || ally.owner !== unit.owner) continue;
          const tplAlly = window.CARDS?.[ally.tplId];
          const cellEl2 = gameState.board[rr][cc].element;
          const buff2 = window.computeCellBuff(cellEl2, tplAlly.element);
          ally.bonusHP = (ally.bonusHP || 0) + amount;
          const maxHP = (tplAlly.hp || 0) + buff2.hp + (ally.bonusHP || 0);
          const before = ally.currentHP ?? tplAlly.hp;
          ally.currentHP = Math.min(maxHP, before + amount);
        }
      }
      showOracleDeathBuff(unit.owner, amount);
      window.addLog(`${cardData.name}: союзники получают +${amount} HP`);
    }
    const owner = unit.owner;
    const deathEntry = createDeathEntry(gameState, unit, row, col) || {
      r: row,
      c: col,
      owner,
      tplId: unit.tplId,
      uid: unit.uid ?? null,
      element: gameState.board?.[row]?.[col]?.element || null,
    };
    const deathInfo = deathEntry ? [deathEntry] : [];
    const playersBefore = Array.isArray(gameState.players)
      ? gameState.players.map(pl => ({ mana: Math.max(0, Number(pl?.mana || 0)) }))
      : [];
    try { gameState.players[owner].graveyard.push(window.CARDS[unit.tplId]); } catch {}
    const ownerPlayer = gameState.players?.[owner];
    if (ownerPlayer) {
      const beforeMana = Math.max(0, Number(ownerPlayer.mana || 0));
      ownerPlayer.mana = capMana(beforeMana + 1);
    }
    gameState.board[row][col].unit = null;
    let manaBonus = null;
    try {
      manaBonus = applyManaGainOnDeaths(gameState, deathInfo, { boardState: gameState });
    } catch (err) {
      console.error('[interactions] Ошибка при расчёте бонусной маны:', err);
      manaBonus = null;
    }
    if (Array.isArray(manaBonus?.logs) && manaBonus.logs.length) {
      for (const text of manaBonus.logs) {
        if (text) window.addLog(text);
      }
    }
    const manaStealEvents = applyDeathManaSteal(gameState, deathInfo, { cause: 'SUMMON' });
    const repositionResult = applyDeathRepositionEffects(gameState, deathInfo);
    const ctx = getCtx();
    const THREE = ctx.THREE || (typeof window !== 'undefined' ? window.THREE : undefined);
    const manaPlan = buildManaGainPlan({
      playersBefore,
      deaths: deathInfo,
      manaGainEntries: Array.isArray(manaBonus?.entries) ? manaBonus.entries : [],
      tileMeshes: ctx.tileMeshes,
      THREE,
    });
    try { window.updateUI(); } catch {}
    processManaStealEvents(manaStealEvents);
    if (Array.isArray(repositionResult?.logs) && repositionResult.logs.length) {
      for (const text of repositionResult.logs) {
        if (text) window.addLog(text);
      }
    }
    try { manaPlan?.schedule?.(); } catch {}
    const discardEffects = applyDeathDiscardEffects(gameState, deathInfo, { cause: 'SUMMON' });
    if (Array.isArray(discardEffects.logs) && discardEffects.logs.length) {
      for (const text of discardEffects.logs) {
        window.addLog(text);
      }
    }
    // При мгновенной смерти существо считается призванным, поэтому передаём ход оппоненту
    endTurnAfterSummon();
    // очищаем возможные состояния выбора цели, чтобы не блокировать интерфейс после мгновенной смерти
    interactionState.magicFrom = null;
    interactionState.pendingAttack = null;
    interactionState.autoEndTurnAfterAttack = false;
    try { window.__ui?.cancelButton?.refreshCancelButton(); } catch {}
  }
  const placedUnit = gameState.board[row][col].unit;
  const placedTpl = placedUnit ? window.CARDS?.[placedUnit.tplId] : null;
  const placedAlive = placedUnit && ((placedUnit.currentHP ?? placedTpl?.hp ?? cardData.hp) > 0);
  if (placedAlive) {
    const playersBeforeMana = Array.isArray(gameState.players)
      ? gameState.players.map(pl => ({ mana: Math.max(0, Number(pl?.mana || 0)) }))
      : [];
    const summonEvents = applySummonAbilities(gameState, row, col);
    const manaGainEntries = Array.isArray(summonEvents?.manaGainEvents)
      ? summonEvents.manaGainEvents
      : [];
    setPendingSummonManaGain(manaGainEntries);
    let summonManaPlan = null;
    if (manaGainEntries.length) {
      const ctxLocal = getCtx();
      const THREE = ctxLocal.THREE || (typeof window !== 'undefined' ? window.THREE : undefined);
      summonManaPlan = buildManaGainPlan({
        playersBefore: playersBeforeMana,
        deaths: Array.isArray(summonEvents?.deaths) ? summonEvents.deaths : [],
        manaGainEntries,
        tileMeshes: ctxLocal.tileMeshes,
        THREE,
      });
    }
    const drawEvents = Array.isArray(summonEvents?.draws) && summonEvents.draws.length
      ? summonEvents.draws
      : (summonEvents?.draw?.count > 0 ? [summonEvents.draw] : []);
    if (drawEvents.length) {
      const cardsDb = window.CARDS || {};
      for (const drawInfo of drawEvents) {
        if (!drawInfo || drawInfo.count <= 0) continue;
        const ownerIdx = typeof drawInfo.player === 'number' ? drawInfo.player : gameState.active;
        const drawnCards = Array.isArray(drawInfo.cards) ? drawInfo.cards : [];
        const sourceTplId = drawInfo.source?.tplId || cardData?.id;
        const sourceTpl = sourceTplId ? cardsDb[sourceTplId] : null;
        const sourceName = sourceTpl?.name || cardData?.name || 'Существо';
        window.__ui?.log?.add?.(`${sourceName}: игрок ${ownerIdx + 1} добирает ${drawInfo.count} карт(ы).`);
        (async (cardsForAnim) => {
          const animate = window.animateDrawnCardToHand;
          if (typeof animate === 'function') {
            for (const tplDrawn of cardsForAnim) {
              try { await animate(tplDrawn); } catch (err) { console.warn('[summonDraw] animation failed', err); }
            }
          }
          window.updateHand?.(gameState);
        })(drawnCards);
      }
    }
    if (Array.isArray(summonEvents?.logs) && summonEvents.logs.length) {
      for (const text of summonEvents.logs) {
        if (!text) continue;
        window.addLog?.(text);
      }
    }
    if (Array.isArray(summonEvents?.fieldquakes) && summonEvents.fieldquakes.length) {
      const broadcastFx = (typeof window.NET_ON === 'function' ? window.NET_ON() : false)
        && typeof window.MY_SEAT === 'number'
        && window.MY_SEAT === gameState.active;
      playFieldquakeFxBatch(summonEvents.fieldquakes, { broadcast: broadcastFx });
    }
    if (Array.isArray(summonEvents?.manaSteal) && summonEvents.manaSteal.length) {
      try { window.updateUI(); } catch {}
      processManaStealEvents(summonEvents.manaSteal, { skipLog: true });
    }
    if (Array.isArray(summonEvents?.statBuffs) && summonEvents.statBuffs.length) {
      for (const buff of summonEvents.statBuffs) {
        if (!buff) continue;
        const { r: br, c: bc, hp } = buff;
        if (hp && typeof br === 'number' && typeof bc === 'number') {
          window.__fx?.scheduleHpPopup?.(br, bc, hp, 600);
        }
      }
    }
    if (Array.isArray(summonEvents?.dodgeUpdates) && summonEvents.dodgeUpdates.length) {
      logDodgeUpdates(summonEvents.dodgeUpdates, gameState, cardData?.name || null);
    }
    if (summonEvents?.possessions?.length) {
      try {
        const cards = window.CARDS || {};
        for (const ev of summonEvents.possessions) {
          const unitTaken = gameState.board?.[ev.r]?.[ev.c]?.unit;
          const tplTaken = unitTaken ? cards[unitTaken.tplId] : null;
          const name = tplTaken?.name || 'Существо';
          window.addLog?.(`${name}: контроль переходит к игроку ${gameState.active + 1}.`);
        }
      } catch {}
    }
    if (summonEvents?.releases?.length) {
      try {
        const cards = window.CARDS || {};
        for (const rel of summonEvents.releases) {
          const unit = gameState.board?.[rel.r]?.[rel.c]?.unit;
          const tplUnit = unit ? cards[unit.tplId] : null;
          const name = tplUnit?.name || 'Существо';
          window.addLog?.(`${name}: контроль возвращается к игроку ${rel.owner + 1}.`);
        }
      } catch {}
    }
    if (Array.isArray(summonEvents?.heals) && summonEvents.heals.length) {
      try {
        const cards = window.CARDS || {};
        for (const heal of summonEvents.heals) {
          const tplSource = cards[heal?.source?.tplId];
          const sourceName = tplSource?.name || 'Существо';
          const totalHealed = Array.isArray(heal.healed)
            ? heal.healed.reduce((acc, item) => acc + (item?.amount || 0), 0)
            : heal.amount;
          window.addLog?.(`${sourceName}: союзники восстанавливают ${totalHealed} HP.`);
          if (Array.isArray(heal.healed)) {
            for (const healed of heal.healed) {
              if (!healed || !healed.increaseMax) continue;
              const amount = Number.isFinite(healed.amount) ? healed.amount : 0;
              if (amount <= 0) continue;
              const { r: hr, c: hc } = healed;
              if (typeof hr !== 'number' || typeof hc !== 'number') continue;
              window.__fx?.scheduleHpPopup?.(hr, hc, amount, 600);
            }
          }
        }
      } catch {}
    }
    try { summonManaPlan?.schedule?.(); } catch {}
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
      // удаляем временный меш карты из руки, чтобы на поле не оставалась статичная копия
      try {
        if (card?.parent) {
          card.parent.remove(card);
        }
      } catch {}
      window.updateHand();
      window.updateUnits();
      window.updateUI();
      const cellAfterPlacement = gameState.board?.[row]?.[col] || null;
      const unitAfterPlacement = cellAfterPlacement?.unit || null;
      const tplAfterPlacement = unitAfterPlacement ? window.CARDS?.[unitAfterPlacement.tplId] : null;
      const stillAlive = !!unitAfterPlacement
        && (unitAfterPlacement.currentHP ?? tplAfterPlacement?.hp ?? 0) > 0;
      if (!stillAlive) {
        // Если существо погибло мгновенно, не запускаем выбор целей и выходим из обработки анимации
        interactionState.autoEndTurnAfterAttack = false;
        try { window.__ui?.cancelButton?.refreshCancelButton(); } catch {}
        clearPendingSummonManaGain();
        // Визуальная часть завершилась, а ход уже должен перейти оппоненту
        endTurnAfterSummon();
        if (unlockTriggered) {
          setTimeout(() => { try { window.__ui?.summonLock?.playUnlockAnimation(); } catch {} }, 0);
        }
        return;
      }
      const tpl = window.CARDS?.[cardData.id];
      if (tpl?.fortress) {
        interactionState.autoEndTurnAfterAttack = false;
        if (unlockTriggered) {
          setTimeout(() => {
            try { window.__ui?.summonLock?.playUnlockAnimation(); } catch {}
          }, 0);
        }
        endTurnAfterSummon();
        try { window.__ui?.cancelButton?.refreshCancelButton(); } catch {}
        clearPendingSummonManaGain();
        return;
      }
      const profile = window.resolveAttackProfile
        ? window.resolveAttackProfile(gameState, row, col, tpl)
        : { attacks: tpl?.attacks || [], chooseDir: tpl?.chooseDir, attackType: tpl?.attackType };
      const usesMagic = profile?.attackType === 'MAGIC';
      if (wasIncarnation) {
        interactionState.autoEndTurnAfterAttack = false;
        if (unlockTriggered) { setTimeout(() => { try { window.__ui?.summonLock?.playUnlockAnimation(); } catch {} }, 0); }
        clearPendingSummonManaGain();
        return;
      }
      if (usesMagic) {
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
          interactionState.magicFrom = { r: row, c: col, cancelMode: 'summon', owner: unit.owner };
          interactionState.autoEndTurnAfterAttack = true;
          highlightTiles(cells);
          // Показываем явное уведомление, чтобы игрок понимал, что нужно выбрать цель
          window.__ui?.notifications?.show('Select a target', 'info');
          window.__ui?.log?.add?.(`${tpl.name}: select a target for the magical attack.`);
          if (unlockTriggered) {
            const delay = 1200;
            setTimeout(() => { try { window.__ui?.summonLock?.playUnlockAnimation(); } catch {} }, delay);
          }
        } else {
          if (unlockTriggered) { setTimeout(() => { try { window.__ui?.summonLock?.playUnlockAnimation(); } catch {} }, 0); }
          endTurnAfterSummon();
          clearPendingSummonManaGain();
        }
      } else {
        const attacks = Array.isArray(profile?.attacks) ? profile.attacks : (tpl?.attacks || []);
        const needsChoice = !!profile?.chooseDir || attacks.some(a => a.mode === 'ANY');
        // если в шаблоне несколько дистанций без выбора, подсвечиваем и пустые клетки
        const includeEmpty = attacks.some(a => Array.isArray(a.ranges) && a.ranges.length > 1 && !a.mode);
        const hitsAll = window.computeHits(gameState, row, col, { union: true, includeEmpty, profile });
        const hasEnemy = hitsAll.some(h => {
          const u2 = gameState.board?.[h.r]?.[h.c]?.unit;
          return u2 && u2.owner !== unit.owner;
        });
        if (hitsAll.length && hasEnemy) {
          if (needsChoice && hitsAll.length > 1) {
            interactionState.pendingAttack = { r: row, c: col, cancelMode: 'summon', owner: unit.owner, profile };
            interactionState.autoEndTurnAfterAttack = true;
            highlightTiles(hitsAll);
            window.__ui?.log?.add?.(`${tpl.name}: choose a target for the attack.`);
            window.__ui?.notifications?.show('Select a target', 'info');
          } else {
            let opts = {};
            if (needsChoice && hitsAll.length === 1) {
              const h = hitsAll[0];
              const dr = h.r - row, dc = h.c - col;
              const absDir = dr < 0 ? 'N' : dr > 0 ? 'S' : dc > 0 ? 'E' : 'W';
              const ORDER = ['N', 'E', 'S', 'W'];
              const relDir = ORDER[(ORDER.indexOf(absDir) - ORDER.indexOf(unit.facing) + 4) % 4];
              const dist = Math.max(Math.abs(dr), Math.abs(dc));
              opts = { chosenDir: relDir, profile };
              if (attacks.some(a => a.mode === 'ANY')) {
                opts.rangeChoices = { [relDir]: dist };
              }
            }
            interactionState.autoEndTurnAfterAttack = true;
            lockUnitMenuForUnit(unitAfterPlacement || unit);
            window.performBattleSequence(row, col, true, opts);
            clearPendingSummonManaGain();
          }
          if (unlockTriggered) {
            const delay = 1200;
            setTimeout(() => { try { window.__ui?.summonLock?.playUnlockAnimation(); } catch {} }, delay);
          }
        } else {
          if (unlockTriggered) { setTimeout(() => { try { window.__ui?.summonLock?.playUnlockAnimation(); } catch {} }, 0); }
          endTurnAfterSummon();
          clearPendingSummonManaGain();
        }
      }
      try { window.__ui?.cancelButton?.refreshCancelButton(); } catch {}
      if (!interactionState.magicFrom && !interactionState.pendingAttack) {
        clearPendingSummonManaGain();
      }
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
    resetUnitHover();
    hideTooltip(META_TOOLTIP_SOURCE);
  });
}

export function getSelectedUnit() { return interactionState.selectedUnit; }
export function clearSelectedUnit() {
  interactionState.selectedUnit = null;
  interactionState.pendingAttack = null;
  interactionState.magicFrom = null;
  interactionState.pendingUnitAbility = null;
  interactionState.pendingAbilityOrientation = null;
  interactionState.pendingDiscardSelection = null;
  clearHighlights();
}
export function getPendingPlacement() { return interactionState.pendingPlacement; }
export function clearPendingPlacement() { interactionState.pendingPlacement = null; }
export function getPendingSpellOrientation() { return interactionState.pendingSpellOrientation; }
export function clearPendingSpellOrientation() { interactionState.pendingSpellOrientation = null; }
export function setPendingUnitAbility(value) { interactionState.pendingUnitAbility = value || null; }
export function getPendingUnitAbility() { return interactionState.pendingUnitAbility; }
export function clearPendingUnitAbility() { interactionState.pendingUnitAbility = null; }
export function setPendingAbilityOrientation(value) { interactionState.pendingAbilityOrientation = value || null; }
export function getPendingAbilityOrientation() { return interactionState.pendingAbilityOrientation; }
export function clearPendingAbilityOrientation() { interactionState.pendingAbilityOrientation = null; }

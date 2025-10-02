// Centralized spell-specific logic.
// Each handler receives a context object with current state references.
// Handlers may rely on globals (addLog, updateHand, etc.) while the
// surrounding code handles index/lookups and basic validations.

import { spendAndDiscardSpell, burnSpellCard } from '../ui/spellUtils.js';
import { getCtx } from '../scene/context.js';
import { interactionState, resetCardSelection } from '../scene/interactions.js';
import { discardHandCard } from '../scene/discard.js';
import { computeFieldquakeLockedCells } from '../core/fieldLocks.js';
import { computeCellBuff } from '../core/fieldEffects.js';
import { refreshPossessionsUI } from '../ui/possessions.js';
import { applyDeathDiscardEffects } from '../core/abilityHandlers/discard.js';
import { playFieldquakeFx, playFieldquakeFxBatch } from '../scene/fieldquakeFx.js';
import { animateManaGainFromWorld } from '../ui/mana.js';
import { fieldquakeAll, fieldquakeByElement } from '../core/spells/fieldquake.js';
import { swapUnits, moveUnitToCell } from '../core/spells/reposition.js';

// Общая реализация ритуала Holy Feast
function runHolyFeast({ tpl, pl, idx, cardMesh, tileMesh }) {
  const handIndices = pl.hand
    .map((c, i) => (c && c.type === 'UNIT' ? i : -1))
    .filter(i => i >= 0);
  if (handIndices.length === 0) {
    showNotification('No unit in hand for this action', 'error');
    resetCardSelection();
    return;
  }

  // Большая копия заклинания на поле
  const ctx = getCtx();
  const THREE = ctx.THREE || (typeof window !== 'undefined' ? window.THREE : undefined);
  let ritualOrigin = null;
  try {
    const big = window.__cards?.createCard3D(tpl, false);
    if (big) {
      let basePos = null;
      if (tileMesh && typeof tileMesh.position?.clone === 'function') {
        basePos = tileMesh.position.clone();
      } else if (tileMesh && tileMesh.position && THREE && THREE.Vector3) {
        basePos = new THREE.Vector3(tileMesh.position.x || 0, tileMesh.position.y || 0, tileMesh.position.z || 0);
      } else if (THREE && THREE.Vector3) {
        basePos = new THREE.Vector3(0, 0, 0);
      }
      if (basePos && typeof basePos.add === 'function' && THREE && THREE.Vector3) {
        basePos.add(new THREE.Vector3(0, 1.0, 0));
        ritualOrigin = basePos.clone();
        if (typeof big.position?.copy === 'function') big.position.copy(basePos);
      } else {
        ritualOrigin = ritualOrigin || { x: 0, y: 1.0, z: 0 };
        if (basePos && typeof basePos === 'object') {
          ritualOrigin = {
            x: Number(basePos.x) || 0,
            y: (Number(basePos.y) || 0) + 1.0,
            z: Number(basePos.z) || 0,
          };
        }
        try { big.position.set?.(ritualOrigin.x || 0, ritualOrigin.y || 0, ritualOrigin.z || 0); } catch {}
      }
      (ctx.boardGroup || ctx.scene).add(big);
      interactionState.pendingRitualBoardMesh = big;
      interactionState.spellDragHandled = true;
      try { cardMesh.visible = false; } catch {}
      interactionState.pendingRitualSpellHandIndex = idx;
      interactionState.pendingRitualSpellCard = tpl;
    }
  } catch {}
  interactionState.pendingRitualOrigin = ritualOrigin;
  try { if (typeof window !== 'undefined') window.pendingRitualOrigin = ritualOrigin; } catch {}

  // Кнопка отмены возвращает карту в руку
  window.__ui.panels.showPrompt('Select a unit for this action', () => {
    try {
      if (interactionState.pendingRitualBoardMesh && interactionState.pendingRitualBoardMesh.parent)
        interactionState.pendingRitualBoardMesh.parent.remove(interactionState.pendingRitualBoardMesh);
    } catch {}
    interactionState.pendingRitualBoardMesh = null;
    try { cardMesh.visible = true; } catch {}
    interactionState.pendingRitualSpellHandIndex = null;
    interactionState.pendingRitualSpellCard = null;
    interactionState.pendingDiscardSelection = null;
    interactionState.pendingRitualOrigin = null;
    try { if (typeof window !== 'undefined') window.pendingRitualOrigin = null; } catch {}
    updateHand();
    updateUI();
  });

  // Ожидаем выбор существа из руки
  interactionState.pendingDiscardSelection = {
    requiredType: 'UNIT',
    onPicked: handIdx => {
      const toDiscard = discardHandCard(pl, handIdx);
      if (!toDiscard) return;
      const spellIdx = interactionState.pendingRitualSpellHandIndex != null
        ? interactionState.pendingRitualSpellHandIndex
        : pl.hand.indexOf(tpl);
      if (NET_ON()) {
        try { PENDING_HIDE_HAND_CARDS = Array.from(new Set([handIdx, spellIdx])).filter(i => i >= 0); } catch {}
      }
      const before = pl.mana;
      pl.mana = capMana(pl.mana + 2);
      try {
        const baseOrigin = interactionState.pendingRitualOrigin || ritualOrigin;
        let originVec = null;
        if (baseOrigin && typeof baseOrigin.clone === 'function') {
          originVec = baseOrigin.clone();
        } else if (baseOrigin && typeof baseOrigin === 'object' && THREE && THREE.Vector3) {
          originVec = new THREE.Vector3(baseOrigin.x || 0, baseOrigin.y || 0, baseOrigin.z || 0);
        } else if (THREE && THREE.Vector3) {
          originVec = new THREE.Vector3(0, 1.0, 0);
        }
        if (originVec) {
          animateManaGainFromWorld(originVec, gameState.active, { amount: 2, visualOnly: true });
        }
      } catch {}
      try { window.__ui?.mana?.animateTurnManaGain(gameState.active, before, pl.mana, 800); } catch {}
      if (spellIdx >= 0) pl.hand.splice(spellIdx, 1);
      try {
        pl.graveyard = Array.isArray(pl.graveyard) ? pl.graveyard : [];
        pl.graveyard.push(tpl);
      } catch {}
      try {
        if (interactionState.pendingRitualBoardMesh) {
          window.__fx.dissolveAndAsh(interactionState.pendingRitualBoardMesh, new THREE.Vector3(0, 0.6, 0), 0.9);
          setTimeout(() => {
            try { interactionState.pendingRitualBoardMesh.parent.remove(interactionState.pendingRitualBoardMesh); } catch {}
            interactionState.pendingRitualBoardMesh = null;
          }, 950);
        }
      } catch {}
      window.__ui.panels.hidePrompt();
      interactionState.pendingRitualSpellHandIndex = null;
      interactionState.pendingRitualSpellCard = null;
      interactionState.pendingDiscardSelection = null;
      interactionState.pendingRitualOrigin = null;
      try { if (typeof window !== 'undefined') window.pendingRitualOrigin = null; } catch {}
      resetCardSelection();
      updateHand();
      updateUI();
      schedulePush('spell-holy-feast', { force: true });
      if (NET_ON()) {
        try {
          if (typeof window !== 'undefined' && window.socket) {
            window.socket.emit('ritualResolve', {
              kind: 'HOLY_FEAST',
              by: gameState.active,
              card: tpl.id,
              consumed: toDiscard.id,
            });
            window.socket.emit('holyFeast', { seat: gameState.active, spellIdx, creatureIdx: handIdx });
          }
        } catch {}
      }
    },
  };
  addLog(`${tpl.name}: выберите существо в руке для ритуального сброса.`);
}

// Возвращает список целей Healing Shower с рассчитанным итоговым здоровьем
export function collectHealingShowerTargets(state, ownerIdx, elementToken) {
  const normalized = typeof elementToken === 'string' ? elementToken.toUpperCase() : null;
  if (!normalized || !state || !Array.isArray(state.board)) return [];
  const result = [];
  for (let row = 0; row < state.board.length; row++) {
    const rowCells = state.board[row];
    if (!Array.isArray(rowCells)) continue;
    for (let col = 0; col < rowCells.length; col++) {
      const cell = rowCells[col];
      const unit = cell?.unit;
      if (!unit || unit.owner !== ownerIdx) continue;
      const tplUnit = CARDS?.[unit.tplId];
      if (!tplUnit) continue;
      const unitElement = String(tplUnit.element || '').toUpperCase();
      if (unitElement !== normalized) continue;
      const currentHpRaw = Number.isFinite(unit.currentHP)
        ? unit.currentHP
        : Number(unit.currentHP) || (tplUnit.hp || 0);
      const bonusHp = Number.isFinite(unit.bonusHP)
        ? unit.bonusHP
        : Number(unit.bonusHP) || 0;
      const baseHpTpl = Number.isFinite(tplUnit.hp) ? tplUnit.hp : currentHpRaw;
      const buff = computeCellBuff(cell?.element ?? null, tplUnit.element);
      const buffHp = Number.isFinite(buff?.hp) ? buff.hp : Number(buff?.hp) || 0;
      const maxHpCandidate = baseHpTpl + buffHp + bonusHp;
      const maxHp = Math.max(currentHpRaw, maxHpCandidate);
      const after = Math.min(maxHp, currentHpRaw + 3);
      const healed = Math.max(0, after - currentHpRaw);
      if (healed <= 0) continue;
      result.push({ row, col, healed, before: currentHpRaw, after, tpl: tplUnit });
    }
  }
  return result;
}

const pendingSpellSequenceState = { current: null };

function setPendingSpellSequence(data) {
  pendingSpellSequenceState.current = data ? { ...data } : null;
  interactionState.pendingSpellSequence = pendingSpellSequenceState.current;
}

function getPendingSpellSequence() {
  return pendingSpellSequenceState.current;
}

function finishPendingSpellSequence(opts = {}) {
  const current = pendingSpellSequenceState.current;
  if (!current) return null;
  pendingSpellSequenceState.current = null;
  interactionState.pendingSpellSequence = null;
  if (current.promptActive && opts.keepPrompt !== true) {
    try { window.__ui?.panels?.hidePrompt?.(); } catch {}
  }
  return current;
}

function cancelPendingSequence(opts = {}) {
  const current = finishPendingSpellSequence(opts);
  if (!current) return;
  if (opts.skipCancelHandler) return;
  if (typeof current.onCancel === 'function') {
    try { current.onCancel({ reason: opts.reason || 'CANCELLED' }); } catch {}
  }
}

function ensureSpellHandIndex(pending) {
  if (!pending) return -1;
  const seat = pending.player;
  const state = typeof window !== 'undefined' ? window.gameState : gameState;
  if (!state || seat == null) return -1;
  const player = state.players?.[seat];
  if (!player || !Array.isArray(player.hand)) return -1;
  if (pending.cardRef) {
    const idx = player.hand.indexOf(pending.cardRef);
    if (idx >= 0) return idx;
  }
  if (pending.cardId) {
    const idx = player.hand.findIndex(card => card && card.id === pending.cardId);
    if (idx >= 0) return idx;
  }
  return -1;
}

function showHpChangesFx(changes = []) {
  if (!Array.isArray(changes) || !changes.length) return;
  const ctx = getCtx();
  const { unitMeshes, THREE } = ctx;
  for (const change of changes) {
    if (!change || !change.delta) continue;
    const mesh = unitMeshes?.find(m => m.userData.row === change.r && m.userData.col === change.c);
    if (!mesh) continue;
    const color = change.delta > 0 ? '#22c55e' : '#ef4444';
    const text = `${change.delta > 0 ? '+' : ''}${change.delta}`;
    try { window.__fx?.spawnDamageText?.(mesh, text, color); } catch {}
    if (change.delta > 0 && THREE?.Vector3 && window.__fx?.spawnHealingPulse) {
      try {
        const pulse = window.__fx.spawnHealingPulse(mesh.position.clone().add(new THREE.Vector3(0, 0.6, 0)));
        if (pulse?.disposeLater) pulse.disposeLater(0.9);
      } catch {}
    }
  }
}

function processSpellDeaths(deaths = [], opts = {}) {
  if (!Array.isArray(deaths) || !deaths.length) return;
  const gs = gameState;
  if (!gs) return;
  const ctx = getCtx();
  const { unitMeshes, THREE } = ctx;
  const unique = [];
  const seen = new Set();
  for (const death of deaths) {
    if (!death) continue;
    const key = `${death.r},${death.c},${death.uid ?? 'none'}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(death);
    const mesh = unitMeshes?.find(m => m.userData.row === death.r && m.userData.col === death.c);
    if (mesh) {
      try { window.__fx?.dissolveAndAsh?.(mesh, new THREE.Vector3(0, 0, 0.6), 0.9); } catch {}
    }
    const cell = gs.board?.[death.r]?.[death.c];
    if (cell && cell.unit && (death.uid == null || cell.unit.uid === death.uid)) {
      cell.unit = null;
    }
  }
  const discardEffects = applyDeathDiscardEffects(gs, unique, { cause: opts.cause || 'SPELL' });
  if (Array.isArray(discardEffects?.logs)) {
    for (const line of discardEffects.logs) addLog(line);
  }
  const delayMs = Number.isFinite(opts.delayMs) ? opts.delayMs : 1000;
  setTimeout(() => {
    try { refreshPossessionsUI(gs); } catch {}
    try { updateUnits(); } catch {}
    try { updateUI(); } catch {}
  }, delayMs);
}

export const handlers = {
  SPELL_BEGUILING_FOG: {
    requiresUnitTarget: true,
    onUnit({ cardMesh, unitMesh, tpl }) {
      // Allow rotating any target in any direction via orientation panel
      try {
        interactionState.pendingSpellOrientation = { spellCardMesh: cardMesh, unitMesh };
        addLog(`${tpl.name}: выберите направление для цели.`);
        window.__ui.panels.showOrientationPanel();
        try { window.__ui?.cancelButton?.refreshCancelButton(); } catch {}
      } catch {}
    },
  },

  SPELL_CLARE_WILS_BANNER: {
    requiresUnitTarget: true,
    onUnit({ tpl, pl, idx, r, c, u }) {
      if (!u || u.owner !== gameState.active) {
        showNotification('Target: friendly unit', 'error');
        return;
      }
      const { unitMeshes, effectsGroup } = getCtx();
      // Temporary attack buff until caster's turn ends
      u.tempAtkBuff = (u.tempAtkBuff || 0) + 2;
      u.tempBuffOwner = gameState.active;
      addLog(`${tpl.name}: ${CARDS[u.tplId].name} получает +2 ATK до конца хода.`);
      const tMesh = unitMeshes.find(m => m.userData.row === r && m.userData.col === c);
      if (tMesh) {
        window.__fx.spawnDamageText(tMesh, `+2`, '#22c55e');
        try {
          const ring = new THREE.Mesh(
            new THREE.RingGeometry(0.5, 0.8, 48),
            new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.0 })
          );
          ring.rotation.x = -Math.PI / 2;
          ring.position.copy(tMesh.position).add(new THREE.Vector3(0, 0.32, 0));
          effectsGroup.add(ring);
          gsap
            .to(ring.material, { opacity: 0.8, duration: 0.12 })
            .then(() =>
              gsap.to(ring.scale, {
                x: 2.5,
                y: 2.5,
                z: 2.5,
                duration: 0.4,
                ease: 'power2.out',
              })
            )
            .then(() =>
              gsap.to(ring.material, {
                opacity: 0,
                duration: 0.24,
                onComplete: () => effectsGroup.remove(ring),
              })
            );
        } catch {}
      }
      spendAndDiscardSpell(pl, idx);
      resetCardSelection();
      updateHand();
      updateUnits();
      updateUI();
    },
  },

  SPELL_SUMMONER_MESMERS_ERRAND: {
    onCast({ tpl, pl, idx, cardMesh, tileMesh }) {
      if (tpl.cost > pl.mana) {
        showNotification('Insufficient mana', 'error');
        resetCardSelection();
        return;
      }
      burnSpellCard(tpl, tileMesh, cardMesh);
      spendAndDiscardSpell(pl, idx);
      resetCardSelection();
      updateHand();
      updateUI();
      (async () => {
        for (let i = 0; i < 2; i++) {
          const drawnTpl = drawOneNoAdd(gameState, gameState.active);
          if (drawnTpl) {
            refreshInputLockUI();
            await animateDrawnCardToHand(drawnTpl);
            try {
              gameState.players[gameState.active].hand.push(drawnTpl);
            } catch {}
            updateHand();
          }
        }
        addLog(`${tpl.name}: вы добираете 2 карты.`);
        updateUI();
      })();
    },
  },

  SPELL_GOGHLIE_ALTAR: {
    onCast({ tpl, pl, idx, cardMesh, tileMesh }) {
      const countUnits = ownerIdx => {
        let n = 0;
        for (let rr = 0; rr < 3; rr++)
          for (let cc = 0; cc < 3; cc++) {
            const un = gameState.board[rr][cc].unit;
            if (un && un.owner !== ownerIdx) n++;
          }
        return n;
      };
      const g0 = countUnits(0),
        g1 = countUnits(1);
      gameState.players[0].mana = capMana(gameState.players[0].mana + g0);
      gameState.players[1].mana = capMana(gameState.players[1].mana + g1);
      for (let rr = 0; rr < 3; rr++)
        for (let cc = 0; cc < 3; cc++) {
          const un = gameState.board[rr][cc].unit;
          if (!un) continue;
          const pos = getCtx().tileMeshes[rr][cc].position
            .clone()
            .add(new THREE.Vector3(0, 1.2, 0));
          animateManaGainFromWorld(pos, un.owner === 0 ? 1 : 0);
        }
      addLog(
        `${tpl.name}: оба игрока получают ману от вражеских существ (P1 +${g0}, P2 +${g1}).`
      );
      burnSpellCard(tpl, tileMesh, cardMesh);
      spendAndDiscardSpell(pl, idx);
      resetCardSelection();
      updateHand();
      updateUI();
    },
  },
  SPELL_PARMTETIC_HOLY_FEAST: {
    onBoard: runHolyFeast,
    onUnit: runHolyFeast,
  },

  WIND_SHIFT: {
    requiresUnitTarget: true,
    onUnit({ tpl, pl, idx, u }) {
      if (u) u.facing = turnCW[u.facing];
      addLog(`${tpl.name}: ${CARDS[u.tplId].name} повёрнут.`);
      refreshPossessionsUI(gameState);
      spendAndDiscardSpell(pl, idx);
      resetCardSelection();
      updateHand();
      updateUnits();
      updateUI();
    },
  },

  FREEZE_STREAM: {
    requiresUnitTarget: true,
    onUnit({ tpl, pl, idx, r, c, u }) {
      if (u) {
        const before = u.currentHP;
        u.currentHP = Math.max(0, u.currentHP - 1);
        addLog(
          `${tpl.name}: ${CARDS[u.tplId].name} получает 1 урона (HP ${before}→${u.currentHP})`
        );
        try {
          const tMesh = unitMeshes.find(m => m.userData.row === r && m.userData.col === c);
          if (tMesh) window.__fx.spawnDamageText(tMesh, `-1`, '#ef4444');
        } catch {}
        if (u.currentHP <= 0) {
          const owner = u.owner;
          const deathElement = gameState.board?.[r]?.[c]?.element || null;
          const deathInfo = [{ r, c, owner, tplId: u.tplId, uid: u.uid ?? null, element: deathElement }];
          try { gameState.players[owner].graveyard.push(CARDS[u.tplId]); } catch {}
          const pos = getCtx().tileMeshes[r][c].position.clone().add(new THREE.Vector3(0, 1.2, 0));
          const slot = gameState.players?.[owner]?.mana || 0;
          animateManaGainFromWorld(pos, owner, true, slot);
          const unitMeshesCtx = getCtx().unitMeshes;
          if (unitMeshesCtx) {
            const unitMesh = unitMeshesCtx.find(m => m.userData.row === r && m.userData.col === c);
            if (unitMesh) {
              window.__fx.dissolveAndAsh(unitMesh, new THREE.Vector3(0, 0, 0.6), 0.9);
            }
          }
          gameState.board[r][c].unit = null;
          const discardEffects = applyDeathDiscardEffects(gameState, deathInfo, { cause: 'SPELL' });
          if (Array.isArray(discardEffects.logs) && discardEffects.logs.length) {
            for (const text of discardEffects.logs) {
              addLog(text);
            }
          }
          setTimeout(() => {
            refreshPossessionsUI(gameState);
            updateUnits();
            updateUI();
          }, 1000);
        }
      }
      spendAndDiscardSpell(pl, idx);
      resetCardSelection();
      updateHand();
      updateUnits();
      updateUI();
    },
  },

  SPELL_HEALING_SHOWER: {
    requiresUnitTarget: true,
    onUnit({ tpl, pl, idx, r, c, u }) {
      if (!u) {
        showNotification('Need to drag this card to a unit', 'error');
        return;
      }
      if (u.owner !== gameState.active) {
        showNotification('Only friendly unit', 'error');
        return;
      }
      const ctx = getCtx();
      const { unitMeshes, THREE } = ctx;
      const tplTarget = CARDS[u.tplId];
      const chosenElementRaw = tplTarget?.element || null;
      if (!chosenElementRaw) {
        showNotification('Target must have an element', 'error');
        return;
      }
      const chosenElement = String(chosenElementRaw).toUpperCase();
      const healingPlan = collectHealingShowerTargets(gameState, gameState.active, chosenElement);
      for (const info of healingPlan) {
        const unitCell = gameState.board?.[info.row]?.[info.col];
        const unitRef = unitCell?.unit;
        if (!unitRef) continue;
        unitRef.currentHP = info.after;
        try {
          const mesh = unitMeshes?.find(m => m.userData.row === info.row && m.userData.col === info.col);
          if (mesh) {
            window.__fx.spawnDamageText(mesh, `+${info.healed}`, '#22c55e');
            if (THREE && THREE.Vector3) {
              const pulse = window.__fx?.spawnHealingPulse?.(mesh.position.clone().add(new THREE.Vector3(0, 0.6, 0)));
              if (pulse?.disposeLater) pulse.disposeLater(0.9);
            }
          }
        } catch {}
      }
      if (!healingPlan.length) {
        addLog(`${tpl.name}: союзники стихии ${chosenElement} уже на максимуме HP.`);
      } else {
        for (const info of healingPlan) {
          addLog(
            `${tpl.name}: ${info.tpl.name} восстанавливает ${info.healed} HP (HP ${info.before}→${info.after}).`
          );
        }
      }
      spendAndDiscardSpell(pl, idx);
      resetCardSelection();
      updateHand();
      updateUnits();
      updateUI();
    },
  },

  SPELL_FISSURES_OF_GOGHLIE: {
    onBoard({ tpl, pl, idx, tileMesh }) {
      if (!tileMesh) {
        showNotification('Drag this card to a board cell', 'error');
        return;
      }
      const r = tileMesh.userData.row,
        c = tileMesh.userData.col;
      const cell = gameState.board[r][c];
      if (!cell) return;
      const locked = computeFieldquakeLockedCells(gameState);
      if (locked.some(p => p.r === r && p.c === c)) {
        showNotification('This field is protected', 'error');
        return;
      }
      if (cell.element === 'BIOLITH') {
        showNotification("This cell can't be changed", 'error');
        return;
      }
      const oppMap = {
        FIRE: 'WATER',
        WATER: 'FIRE',
        EARTH: 'FOREST',
        FOREST: 'EARTH',
      };
      const prevEl = cell.element;
      const nextEl = oppMap[prevEl] || prevEl;
      cell.element = nextEl;
      refreshPossessionsUI(gameState);
      const broadcastFx = (typeof NET_ON === 'function' ? NET_ON() : false)
        && typeof MY_SEAT === 'number'
        && typeof gameState?.active === 'number'
        && MY_SEAT === gameState.active;
      playFieldquakeFx(
        { r, c, prevElement: prevEl, nextElement: nextEl },
        { broadcast: broadcastFx },
      );
      const u = gameState.board[r][c].unit;
      if (u) {
        const tplUnit = CARDS[u.tplId];
        const prevBuff = computeCellBuff(prevEl, tplUnit.element);
        const nextBuff = computeCellBuff(nextEl, tplUnit.element);
        const deltaHp = (nextBuff.hp || 0) - (prevBuff.hp || 0);
        if (deltaHp !== 0) {
          const before = u.currentHP;
          u.currentHP = Math.max(0, before + deltaHp);
          const tMesh = unitMeshes.find(m => m.userData.row === r && m.userData.col === c);
          if (tMesh)
            window.__fx.spawnDamageText(
              tMesh,
              `${deltaHp > 0 ? '+' : ''}${deltaHp}`,
              deltaHp > 0 ? '#22c55e' : '#ef4444'
            );
          if (u.currentHP <= 0) {
            const deathElement = gameState.board?.[r]?.[c]?.element || null;
            const deathInfo = [{ r, c, owner: u.owner, tplId: u.tplId, uid: u.uid ?? null, element: deathElement }];
            try { gameState.players[u.owner].graveyard.push(CARDS[u.tplId]); } catch {}
            const deadMesh = unitMeshes.find(m => m.userData.row === r && m.userData.col === c);
            if (deadMesh) {
              window.__fx.dissolveAndAsh(deadMesh, new THREE.Vector3(0, 0, 0.6), 0.9);
              gameState.board[r][c].unit = null;
              const discardEffects = applyDeathDiscardEffects(gameState, deathInfo, { cause: 'SPELL' });
              if (Array.isArray(discardEffects.logs) && discardEffects.logs.length) {
                for (const text of discardEffects.logs) addLog(text);
              }
              setTimeout(() => {
                refreshPossessionsUI(gameState);
                updateUnits();
                updateUI();
              }, 1000);
            }
          }
        }
      }
      burnSpellCard(tpl, tileMesh);
      spendAndDiscardSpell(pl, idx);
      resetCardSelection();
      updateHand();
      updateUnits();
      updateUI();
    },
  },

  SPELL_SEER_VIZAKS_CALAMITY: {
    onCast({ tpl, pl, idx, cardMesh, tileMesh }) {
      const result = fieldquakeAll(gameState, { sourceName: tpl.name });
      if (Array.isArray(result?.logs)) {
        for (const line of result.logs) addLog(line);
      } else {
        addLog(`${tpl.name}: все поля подвергаются полевому сдвигу.`);
      }
      const broadcastFx = (typeof NET_ON === 'function' ? NET_ON() : false)
        && typeof MY_SEAT === 'number'
        && typeof gameState?.active === 'number'
        && MY_SEAT === gameState.active;
      if (Array.isArray(result?.fieldquakes) && result.fieldquakes.length) {
        playFieldquakeFxBatch(result.fieldquakes, { broadcast: broadcastFx });
      }
      showHpChangesFx(result?.hpChanges);
      processSpellDeaths(result?.deaths, { cause: 'SPELL' });
      refreshPossessionsUI(gameState);
      burnSpellCard(tpl, tileMesh, cardMesh);
      spendAndDiscardSpell(pl, idx);
      resetCardSelection();
      updateHand();
      updateUnits();
      updateUI();
      setTimeout(() => {
        try { window.endTurn?.(); } catch {}
      }, 300);
    },
  },

  SPELL_GREAT_TOLICORE_QUAKE: {
    onBoard({ tpl, pl, idx, tileMesh, cardMesh }) {
      if (!tileMesh) {
        showNotification('Нужно выбрать поле нужной стихии', 'error');
        return;
      }
      const r = tileMesh.userData.row;
      const c = tileMesh.userData.col;
      const cell = gameState.board?.[r]?.[c];
      const element = cell?.element || null;
      if (!element || element === 'BIOLITH') {
        showNotification('Выберите поле с подходящей стихией', 'error');
        return;
      }
      const result = fieldquakeByElement(gameState, element, { sourceName: tpl.name });
      if (Array.isArray(result?.logs) && result.logs.length) {
        for (const line of result.logs) addLog(line);
      } else {
        addLog(`${tpl.name}: поля стихии ${element} остаются без изменений.`);
      }
      const broadcastFx = (typeof NET_ON === 'function' ? NET_ON() : false)
        && typeof MY_SEAT === 'number'
        && typeof gameState?.active === 'number'
        && MY_SEAT === gameState.active;
      if (Array.isArray(result?.fieldquakes) && result.fieldquakes.length) {
        playFieldquakeFxBatch(result.fieldquakes, { broadcast: broadcastFx });
      }
      showHpChangesFx(result?.hpChanges);
      processSpellDeaths(result?.deaths, { cause: 'SPELL' });
      refreshPossessionsUI(gameState);
      burnSpellCard(tpl, tileMesh, cardMesh);
      spendAndDiscardSpell(pl, idx);
      resetCardSelection();
      updateHand();
      updateUnits();
      updateUI();
    },
  },

  SPELL_TINOAN_TELEPORTATION: {
    requiresUnitTarget: true,
    onUnit({ tpl, pl, idx, r, c, u }) {
      if (!u) {
        showNotification('Нужно выбрать существо', 'error');
        return;
      }
      if (u.owner !== gameState.active) {
        showNotification('Доступны только союзные существа', 'error');
        return;
      }
      const pending = getPendingSpellSequence();
      if (!pending || pending.type !== 'TINOAN_TELEPORTATION' || pending.player !== gameState.active) {
        setPendingSpellSequence({
          type: 'TINOAN_TELEPORTATION',
          stage: 'AWAIT_SECOND',
          player: gameState.active,
          first: { r, c },
          firstUid: u.uid ?? null,
          cardRef: tpl,
          cardId: tpl.id,
          promptActive: true,
        });
        try {
          window.__ui?.panels?.showPrompt?.(
            'Выберите второе союзное существо для обмена позициями',
            () => {
              cancelPendingSequence({ reason: 'USER_CANCEL' });
              addLog(`${tpl.name}: действие отменено.`);
              resetCardSelection();
              updateHand();
              updateUI();
            },
          );
        } catch {}
        addLog(`${tpl.name}: выберите второе союзное существо для обмена позициями.`);
        resetCardSelection();
        return;
      }

      if (pending.first?.r === r && pending.first?.c === c) {
        showNotification('Нужно выбрать другое существо', 'error');
        return;
      }

      const firstCell = gameState.board?.[pending.first.r]?.[pending.first.c];
      const firstUnit = firstCell?.unit;
      if (!firstUnit || firstUnit.owner !== gameState.active) {
        cancelPendingSequence({ reason: 'FIRST_TARGET_LOST' });
        showNotification('Первое существо недоступно', 'error');
        resetCardSelection();
        return;
      }
      if (pending.firstUid != null && firstUnit.uid !== pending.firstUid) {
        cancelPendingSequence({ reason: 'FIRST_TARGET_CHANGED' });
        showNotification('Первое существо изменилось', 'error');
        resetCardSelection();
        return;
      }

      const swapRes = swapUnits(gameState, pending.first, { r, c }, {
        sourceName: tpl.name,
        requireSameOwner: true,
      });
      if (!swapRes.ok) {
        showNotification('Не удалось выполнить обмен', 'error');
        return;
      }

      finishPendingSpellSequence({ keepPrompt: false });

      if (Array.isArray(swapRes.logs)) {
        for (const line of swapRes.logs) addLog(line);
      }
      showHpChangesFx(swapRes.hpChanges);
      processSpellDeaths(swapRes.deaths, { cause: 'SPELL' });
      refreshPossessionsUI(gameState);

      let handIndex = ensureSpellHandIndex(pending);
      if (handIndex < 0) handIndex = idx;
      spendAndDiscardSpell(pl, handIndex);
      resetCardSelection();
      updateHand();
      updateUnits();
      updateUI();
    },
  },

  SPELL_TINOAN_TELEKINESIS: {
    requiresUnitTarget: true,
    onUnit({ tpl, pl, idx, r, c, u }) {
      if (!u) {
        showNotification('Нужно выбрать существо', 'error');
        return;
      }
      if (u.owner !== gameState.active) {
        showNotification('Доступны только союзные существа', 'error');
        return;
      }
      setPendingSpellSequence({
        type: 'TINOAN_TELEKINESIS',
        stage: 'AWAIT_DEST',
        player: gameState.active,
        first: { r, c },
        firstUid: u.uid ?? null,
        cardRef: tpl,
        cardId: tpl.id,
        promptActive: true,
      });
      try {
        window.__ui?.panels?.showPrompt?.(
          'Выберите пустое поле для перемещения союзного существа',
          () => {
            cancelPendingSequence({ reason: 'USER_CANCEL' });
            addLog(`${tpl.name}: действие отменено.`);
            resetCardSelection();
            updateHand();
            updateUI();
          },
        );
      } catch {}
      addLog(`${tpl.name}: выберите пустое поле для перемещения.`);
      resetCardSelection();
    },
    onBoard({ tpl, pl, idx, tileMesh, cardMesh }) {
      const pending = getPendingSpellSequence();
      if (!pending || pending.type !== 'TINOAN_TELEKINESIS' || pending.player !== gameState.active) {
        showNotification('Сначала выберите союзное существо', 'error');
        return;
      }
      if (!tileMesh) {
        showNotification('Нужно выбрать пустое поле', 'error');
        return;
      }
      const r = tileMesh.userData.row;
      const c = tileMesh.userData.col;
      const cell = gameState.board?.[r]?.[c];
      if (!cell || cell.unit) {
        showNotification('Поле занято', 'error');
        return;
      }
      const firstCell = gameState.board?.[pending.first.r]?.[pending.first.c];
      const firstUnit = firstCell?.unit;
      if (!firstUnit || firstUnit.owner !== gameState.active) {
        cancelPendingSequence({ reason: 'FIRST_TARGET_LOST' });
        showNotification('Первое существо недоступно', 'error');
        resetCardSelection();
        return;
      }
      if (pending.firstUid != null && firstUnit.uid !== pending.firstUid) {
        cancelPendingSequence({ reason: 'FIRST_TARGET_CHANGED' });
        showNotification('Первое существо изменилось', 'error');
        resetCardSelection();
        return;
      }

      const moveRes = moveUnitToCell(gameState, pending.first, { r, c }, {
        sourceName: tpl.name,
        requireOwner: gameState.active,
      });
      if (!moveRes.ok) {
        showNotification('Не удалось переместить существо', 'error');
        return;
      }

      finishPendingSpellSequence({ keepPrompt: false });

      if (Array.isArray(moveRes.logs)) {
        for (const line of moveRes.logs) addLog(line);
      }
      showHpChangesFx(moveRes.hpChanges);
      processSpellDeaths(moveRes.deaths, { cause: 'SPELL' });
      refreshPossessionsUI(gameState);
      burnSpellCard(tpl, tileMesh, cardMesh);

      let handIndex = ensureSpellHandIndex(pending);
      if (handIndex < 0) handIndex = idx;
      spendAndDiscardSpell(pl, handIndex);
      resetCardSelection();
      updateHand();
      updateUnits();
      updateUI();
    },
  },
};

export function requiresUnitTarget(id) {
  return handlers[id]?.requiresUnitTarget;
}

export function castSpellOnUnit(ctx) {
  const h = handlers[ctx.tpl.id];
  if (h?.onUnit) {
    h.onUnit(ctx);
    return true;
  }
  return false;
}

export function castSpellByDrag(ctx) {
  const h = handlers[ctx.tpl.id];
  if (!h) return false;
  if (h.onBoard) {
    h.onBoard(ctx);
    return true;
  }
  if (h.onCast) {
    h.onCast(ctx);
    return true;
  }
  return false;
}

const api = {
  handlers,
  castSpellOnUnit,
  castSpellByDrag,
  requiresUnitTarget,
  cancelPendingSequence,
  getPendingSpellSequence,
};
try {
  if (typeof window !== 'undefined') {
    window.__spells = api;
  }
} catch {}

export default api;

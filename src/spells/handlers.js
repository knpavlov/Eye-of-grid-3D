// Centralized spell-specific logic.
// Each handler receives a context object with current state references.
// Handlers may rely on globals (addLog, updateHand, etc.) while the
// surrounding code handles index/lookups and basic validations.

import { spendAndDiscardSpell, burnSpellCard } from '../ui/spellUtils.js';
import { getCtx } from '../scene/context.js';
import {
  interactionState,
  resetCardSelection,
  returnCardToHand,
  setPendingSpellTargeting,
  clearPendingSpellTargeting,
  requestAutoEndTurn,
} from '../scene/interactions.js';
import { discardHandCard } from '../scene/discard.js';
import { computeFieldquakeLockedCells } from '../core/fieldLocks.js';
import { computeCellBuff, applyFieldTransitionToUnit } from '../core/fieldEffects.js';
import { refreshPossessionsUI } from '../ui/possessions.js';
import { applyDeathDiscardEffects } from '../core/abilityHandlers/discard.js';
import { playFieldquakeFx, playFieldquakeFxBatch } from '../scene/fieldquakeFx.js';
import { animateManaGainFromWorld } from '../ui/mana.js';
import { applyFieldquakeToCell, collectFieldquakeDeaths } from '../core/abilityHandlers/fieldquake.js';
import { applyDamageInteractionResults } from '../core/abilities.js';
import { createDeathEntry } from '../core/abilityHandlers/deathRecords.js';
import { highlightTiles, clearHighlights } from '../scene/highlight.js';

// Утилита для исключения дублирующихся позиций
function uniquePositions(cells = []) {
  const seen = new Set();
  const result = [];
  for (const cell of cells) {
    if (!cell) continue;
    const r = Number(cell.r);
    const c = Number(cell.c);
    if (!Number.isInteger(r) || !Number.isInteger(c)) continue;
    const key = `${r},${c}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ r, c });
  }
  return result;
}

// Массовое применение fieldquake без привязки к визуальной части
function performFieldquakeBatch(state, cells, opts = {}) {
  const unique = uniquePositions(cells);
  if (!state?.board || !unique.length) {
    return { results: [], deaths: [], skipped: [] };
  }
  const respectLocks = opts.respectLocks !== false;
  const lockedRaw = respectLocks ? computeFieldquakeLockedCells(state) : [];
  const lockedSet = respectLocks
    ? new Set(lockedRaw.map(pos => `${pos.r},${pos.c}`))
    : null;
  const results = [];
  const skipped = [];
  for (const pos of unique) {
    const res = applyFieldquakeToCell(state, pos.r, pos.c, { respectLocks, lockedSet });
    if (res?.changed) {
      results.push(res);
    } else {
      skipped.push({ ...pos, reason: res?.reason || 'UNKNOWN' });
    }
  }
  const deaths = collectFieldquakeDeaths(state, results);
  return { results, deaths, skipped };
}

// Сбор погибших существ после применения любых перемещений/fieldquake
function collectAdditionalDeaths(state, baseDeaths = []) {
  if (!state?.board) return baseDeaths.slice();
  const combined = Array.isArray(baseDeaths) ? baseDeaths.slice() : [];
  const seen = new Set(combined.map(d => (d?.uid != null) ? `UID:${d.uid}` : `POS:${d?.r},${d?.c}`));
  for (let r = 0; r < 3; r += 1) {
    for (let c = 0; c < 3; c += 1) {
      const cell = state.board?.[r]?.[c];
      const unit = cell?.unit;
      if (!unit) continue;
      const tpl = CARDS?.[unit.tplId];
      const hp = unit.currentHP ?? tpl?.hp ?? 0;
      if (hp > 0) continue;
      const entry = createDeathEntry(state, unit, r, c) || {
        r,
        c,
        owner: unit.owner,
        tplId: unit.tplId,
        uid: unit.uid ?? null,
        element: cell?.element || null,
      };
      const key = entry.uid != null ? `UID:${entry.uid}` : `POS:${entry.r},${entry.c}`;
      if (seen.has(key)) continue;
      seen.add(key);
      combined.push(entry);
      cell.unit = null;
    }
  }
  return combined;
}

// Обработка погибших после заклинаний: перенос в сброс и эффект добора/сброса
function finalizeSpellDeaths(state, deaths = [], opts = {}) {
  if (!state || !Array.isArray(deaths) || !deaths.length) return { logs: [] };
  const logs = [];
  for (const death of deaths) {
    if (!death) continue;
    const tpl = CARDS?.[death.tplId];
    if (!tpl) continue;
    try {
      if (state.players?.[death.owner]?.graveyard) {
        state.players[death.owner].graveyard.push(tpl);
      }
    } catch {}
  }
  const discard = applyDeathDiscardEffects(state, deaths, { cause: opts.cause || 'SPELL' });
  if (Array.isArray(discard?.logs)) {
    logs.push(...discard.logs);
  }
  return { logs };
}

// Унифицированный вызов логики перестановок с возвратом смертей
function performRepositionEvents(state, events = []) {
  const raw = applyDamageInteractionResults(state, { events });
  const baseDeaths = Array.isArray(raw?.deaths) ? raw.deaths : [];
  const deaths = collectAdditionalDeaths(state, baseDeaths);
  return {
    logLines: Array.isArray(raw?.logLines) ? raw.logLines : [],
    deaths,
    fieldquakes: Array.isArray(raw?.fieldquakes) ? raw.fieldquakes : [],
    attackerPosUpdate: raw?.attackerPosUpdate || null,
  };
}

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
      const ctx = getCtx();
      const { unitMeshes, tileMeshes } = ctx;
      const targetCells = [];
      for (let r = 0; r < 3; r += 1) {
        for (let c = 0; c < 3; c += 1) {
          targetCells.push({ r, c });
        }
      }
      const result = performFieldquakeBatch(gameState, targetCells);
      if (!result.results.length) {
        showNotification('Нет полей для изменения стихии.', 'error');
        return;
      }
      const broadcastFx = (typeof NET_ON === 'function' ? NET_ON() : false)
        && typeof MY_SEAT === 'number'
        && typeof gameState?.active === 'number'
        && MY_SEAT === gameState.active;
      const fxPayload = result.results.map(res => ({
        r: res.r,
        c: res.c,
        prevElement: res.prevElement,
        nextElement: res.nextElement,
      }));
      playFieldquakeFxBatch(fxPayload, { broadcast: broadcastFx });
      for (const res of result.results) {
        addLog(`${tpl.name}: поле (${res.r + 1},${res.c + 1}) ${res.prevElement}→${res.nextElement}.`);
        if (res.hpShift?.deltaHp) {
          const delta = res.hpShift.deltaHp;
          const before = res.hpShift.beforeHp;
          const after = res.hpShift.afterHp;
          const mesh = unitMeshes.find(m => m.userData.row === res.r && m.userData.col === res.c);
          if (mesh) {
            try {
              window.__fx.spawnDamageText(
                mesh,
                `${delta > 0 ? '+' : ''}${delta}`,
                delta > 0 ? '#22c55e' : '#ef4444',
              );
            } catch {}
          }
          const unit = gameState.board?.[res.r]?.[res.c]?.unit;
          const tplUnit = unit ? CARDS?.[unit.tplId] : null;
          const name = tplUnit?.name || 'Существо';
          addLog(`${name}: HP ${before}→${after}.`);
        }
      }
      const THREE = ctx.THREE || (typeof window !== 'undefined' ? window.THREE : undefined);
      const deathVisuals = [];
      for (const death of result.deaths) {
        const mesh = unitMeshes.find(m => m.userData.row === death.r && m.userData.col === death.c);
        if (mesh && THREE) {
          deathVisuals.push(mesh);
          try { window.__fx.dissolveAndAsh(mesh, new THREE.Vector3(0, 0, 0.6), 0.9); } catch {}
        }
      }
      const deathResult = finalizeSpellDeaths(gameState, result.deaths, { cause: 'SPELL' });
      if (Array.isArray(deathResult.logs)) {
        for (const text of deathResult.logs) addLog(text);
      }
      refreshPossessionsUI(gameState);
      const fxTile = tileMesh || tileMeshes?.[1]?.[1] || null;
      burnSpellCard(tpl, fxTile, cardMesh);
      spendAndDiscardSpell(pl, idx);
      resetCardSelection();
      updateHand();
      const finalize = () => {
        updateUnits();
        updateUI();
      };
      if (deathVisuals.length) {
        setTimeout(finalize, 1000);
      } else {
        finalize();
      }
      requestAutoEndTurn();
    },
  },

  SPELL_GREAT_TOLICORE_QUAKE: {
    onBoard({ tpl, pl, idx, tileMesh }) {
      if (!tileMesh) {
        showNotification('Перетащите карту на клетку нужной стихии.', 'error');
        return;
      }
      const r = tileMesh.userData?.row;
      const c = tileMesh.userData?.col;
      if (r == null || c == null) return;
      const element = gameState.board?.[r]?.[c]?.element || null;
      if (!element || element === 'BIOLITH') {
        showNotification('Эта клетка не подходит для заклинания.', 'error');
        return;
      }
      const targets = [];
      for (let rr = 0; rr < 3; rr += 1) {
        for (let cc = 0; cc < 3; cc += 1) {
          if (gameState.board?.[rr]?.[cc]?.element === element) {
            targets.push({ rr, cc });
          }
        }
      }
      if (!targets.length) {
        showNotification('Нет клеток выбранной стихии.', 'error');
        return;
      }
      const normalized = targets.map(pos => ({ r: pos.rr, c: pos.cc }));
      const result = performFieldquakeBatch(gameState, normalized);
      if (!result.results.length) {
        showNotification('Fieldquake заблокирован на всех выбранных клетках.', 'error');
        return;
      }
      const broadcastFx = (typeof NET_ON === 'function' ? NET_ON() : false)
        && typeof MY_SEAT === 'number'
        && typeof gameState?.active === 'number'
        && MY_SEAT === gameState.active;
      const fxPayload = result.results.map(res => ({
        r: res.r,
        c: res.c,
        prevElement: res.prevElement,
        nextElement: res.nextElement,
      }));
      playFieldquakeFxBatch(fxPayload, { broadcast: broadcastFx });
      for (const res of result.results) {
        addLog(`${tpl.name}: поле (${res.r + 1},${res.c + 1}) ${res.prevElement}→${res.nextElement}.`);
        if (res.hpShift?.deltaHp) {
          const delta = res.hpShift.deltaHp;
          const mesh = ctx.unitMeshes.find(m => m.userData.row === res.r && m.userData.col === res.c);
          if (mesh) {
            try {
              window.__fx.spawnDamageText(
                mesh,
                `${delta > 0 ? '+' : ''}${delta}`,
                delta > 0 ? '#22c55e' : '#ef4444',
              );
            } catch {}
          }
        }
      }
      const ctx = getCtx();
      const THREE = ctx.THREE || (typeof window !== 'undefined' ? window.THREE : undefined);
      const deathVisuals = [];
      for (const death of result.deaths) {
        const mesh = ctx.unitMeshes.find(m => m.userData.row === death.r && m.userData.col === death.c);
        if (mesh && THREE) {
          deathVisuals.push(mesh);
          try { window.__fx.dissolveAndAsh(mesh, new THREE.Vector3(0, 0, 0.6), 0.9); } catch {}
        }
      }
      const deathResult = finalizeSpellDeaths(gameState, result.deaths, { cause: 'SPELL' });
      if (Array.isArray(deathResult.logs)) {
        for (const text of deathResult.logs) addLog(text);
      }
      refreshPossessionsUI(gameState);
      burnSpellCard(tpl, tileMesh);
      spendAndDiscardSpell(pl, idx);
      resetCardSelection();
      updateHand();
      const finalize = () => {
        updateUnits();
        updateUI();
      };
      if (deathVisuals.length) {
        setTimeout(finalize, 1000);
      } else {
        finalize();
      }
    },
  },

  SPELL_TINOAN_TELEPORTATION: {
    requiresUnitTarget: true,
    onUnit({ tpl, pl, idx, cardMesh, unitMesh, r, c, u }) {
      if (!u || u.owner !== gameState.active) {
        showNotification('Цель: союзное существо.', 'error');
        return;
      }
      const allies = [];
      for (let rr = 0; rr < 3; rr += 1) {
        for (let cc = 0; cc < 3; cc += 1) {
          const other = gameState.board?.[rr]?.[cc]?.unit;
          if (other && other.owner === u.owner && (rr !== r || cc !== c)) {
            allies.push({ r: rr, c: cc });
          }
        }
      }
      if (!allies.length) {
        showNotification('Нет другого союзного существа для обмена.', 'error');
        return;
      }
      interactionState.spellDragHandled = true;
      if (cardMesh) cardMesh.visible = false;
      const ctx = getCtx();
      const tileMeshes = ctx.tileMeshes || [];
      const originTile = tileMeshes?.[r]?.[c] || null;
      highlightTiles(allies);
      const cancel = () => {
        clearHighlights();
        clearPendingSpellTargeting();
        try { window.__ui.panels.hidePrompt(); } catch {}
        if (cardMesh) {
          cardMesh.visible = true;
          returnCardToHand(cardMesh);
        }
        try { window.__ui?.cancelButton?.refreshCancelButton(); } catch {}
      };
      setPendingSpellTargeting({
        mode: 'UNIT',
        filterUnit: info => info.unit && info.unit.owner === u.owner && !(info.r === r && info.c === c),
        invalidUnitMessage: 'Выберите другое союзное существо.',
        onCancel: cancel,
        onSelect: ({ r: tr, c: tc }) => {
          clearHighlights();
          clearPendingSpellTargeting();
          try { window.__ui.panels.hidePrompt(); } catch {}
          const firstCell = gameState.board?.[r]?.[c];
          const secondCell = gameState.board?.[tr]?.[tc];
          if (!firstCell?.unit || !secondCell?.unit) {
            cancel();
            showNotification('Цель больше недоступна.', 'error');
            return;
          }
          const events = [{
            type: 'SWAP_POSITIONS',
            attacker: { r, c, uid: firstCell.unit.uid ?? null, tplId: firstCell.unit.tplId },
            target: { r: tr, c: tc, uid: secondCell.unit.uid ?? null, tplId: secondCell.unit.tplId },
          }];
          const reposition = performRepositionEvents(gameState, events);
          for (const line of reposition.logLines) {
            addLog(`${tpl.name}: ${line}`);
          }
          const ctxLocal = getCtx();
          const THREE = ctxLocal.THREE || (typeof window !== 'undefined' ? window.THREE : undefined);
          const deathVisuals = [];
          for (const death of reposition.deaths) {
            const mesh = ctxLocal.unitMeshes.find(m => m.userData.row === death.r && m.userData.col === death.c);
            if (mesh && THREE) {
              deathVisuals.push(mesh);
              try { window.__fx.dissolveAndAsh(mesh, new THREE.Vector3(0, 0, 0.6), 0.9); } catch {}
            }
          }
          const deathResult = finalizeSpellDeaths(gameState, reposition.deaths, { cause: 'SPELL' });
          if (Array.isArray(deathResult.logs)) {
            for (const text of deathResult.logs) addLog(text);
          }
          refreshPossessionsUI(gameState);
          burnSpellCard(tpl, originTile, cardMesh);
          spendAndDiscardSpell(pl, idx);
          resetCardSelection();
          updateHand();
          const finalize = () => {
            updateUnits();
            updateUI();
          };
          if (deathVisuals.length) {
            setTimeout(finalize, 1000);
          } else {
            finalize();
          }
          try { window.__ui?.cancelButton?.refreshCancelButton(); } catch {}
        },
      });
      window.__ui.panels.showPrompt('Выберите второе союзное существо', cancel);
      try { window.__ui?.cancelButton?.refreshCancelButton(); } catch {}
    },
  },

  SPELL_TINOAN_TELEKINESIS: {
    requiresUnitTarget: true,
    onUnit({ tpl, pl, idx, cardMesh, unitMesh, r, c, u }) {
      if (!u || u.owner !== gameState.active) {
        showNotification('Цель: союзное существо.', 'error');
        return;
      }
      const emptyCells = [];
      for (let rr = 0; rr < 3; rr += 1) {
        for (let cc = 0; cc < 3; cc += 1) {
          if (!gameState.board?.[rr]?.[cc]?.unit) emptyCells.push({ r: rr, c: cc });
        }
      }
      if (!emptyCells.length) {
        showNotification('Нет свободных клеток для перемещения.', 'error');
        return;
      }
      interactionState.spellDragHandled = true;
      if (cardMesh) cardMesh.visible = false;
      highlightTiles(emptyCells);
      const ctx = getCtx();
      const tileMeshes = ctx.tileMeshes || [];
      const originTile = tileMeshes?.[r]?.[c] || null;
      const cancel = () => {
        clearHighlights();
        clearPendingSpellTargeting();
        try { window.__ui.panels.hidePrompt(); } catch {}
        if (cardMesh) {
          cardMesh.visible = true;
          returnCardToHand(cardMesh);
        }
        try { window.__ui?.cancelButton?.refreshCancelButton(); } catch {}
      };
      setPendingSpellTargeting({
        mode: 'TILE',
        filterTile: info => !gameState.board?.[info.r]?.[info.c]?.unit,
        invalidTileMessage: 'Выберите пустую клетку.',
        onCancel: cancel,
        onSelect: ({ r: tr, c: tc }) => {
          clearHighlights();
          clearPendingSpellTargeting();
          try { window.__ui.panels.hidePrompt(); } catch {}
          if (gameState.board?.[tr]?.[tc]?.unit) {
            showNotification('Эта клетка занята.', 'error');
            cancel();
            return;
          }
          const cell = gameState.board?.[r]?.[c];
          if (!cell?.unit) {
            cancel();
            showNotification('Цель больше недоступна.', 'error');
            return;
          }
          const movedTpl = CARDS?.[cell.unit.tplId];
          const events = [{
            type: 'PUSH_TARGET',
            target: { r, c, uid: cell.unit.uid ?? null, tplId: cell.unit.tplId },
            to: { r: tr, c: tc },
          }];
          const reposition = performRepositionEvents(gameState, events);
          const filteredLogs = reposition.logLines.filter(line => !/^Атакующий/.test(line));
          if (filteredLogs.length) {
            for (const line of filteredLogs) addLog(`${tpl.name}: ${line}`);
          } else {
            const name = movedTpl?.name || 'Существо';
            addLog(`${tpl.name}: ${name} перемещается на (${tr + 1},${tc + 1}).`);
          }
          const ctxLocal = getCtx();
          const THREE = ctxLocal.THREE || (typeof window !== 'undefined' ? window.THREE : undefined);
          const deathVisuals = [];
          for (const death of reposition.deaths) {
            const mesh = ctxLocal.unitMeshes.find(m => m.userData.row === death.r && m.userData.col === death.c);
            if (mesh && THREE) {
              deathVisuals.push(mesh);
              try { window.__fx.dissolveAndAsh(mesh, new THREE.Vector3(0, 0, 0.6), 0.9); } catch {}
            }
          }
          const deathResult = finalizeSpellDeaths(gameState, reposition.deaths, { cause: 'SPELL' });
          if (Array.isArray(deathResult.logs)) {
            for (const text of deathResult.logs) addLog(text);
          }
          refreshPossessionsUI(gameState);
          burnSpellCard(tpl, originTile, cardMesh);
          spendAndDiscardSpell(pl, idx);
          resetCardSelection();
          updateHand();
          const finalize = () => {
            updateUnits();
            updateUI();
          };
          if (deathVisuals.length) {
            setTimeout(finalize, 1000);
          } else {
            finalize();
          }
          try { window.__ui?.cancelButton?.refreshCancelButton(); } catch {}
        },
      });
      window.__ui.panels.showPrompt('Выберите пустую клетку для перемещения', cancel);
      try { window.__ui?.cancelButton?.refreshCancelButton(); } catch {}
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

const api = { handlers, castSpellOnUnit, castSpellByDrag, requiresUnitTarget };
try {
  if (typeof window !== 'undefined') {
    window.__spells = api;
  }
} catch {}

export default api;

// Centralized spell-specific logic.
// Each handler receives a context object with current state references.
// Handlers may rely on globals (addLog, updateHand, etc.) while the
// surrounding code handles index/lookups and basic validations.

import { spendAndDiscardSpell, burnSpellCard } from '../ui/spellUtils.js';
import { getCtx } from '../scene/context.js';
import { interactionState, resetCardSelection } from '../scene/interactions.js';
import { discardFromHand } from '../lib/discard.js';
import { animateTurnManaGain } from '../ui/mana.js';

export const handlers = {
  SPELL_BEGUILING_FOG: {
    requiresUnitTarget: true,
    onUnit({ cardMesh, unitMesh, tpl }) {
      // Allow rotating any target in any direction via orientation panel
      try {
        interactionState.pendingSpellOrientation = { spellCardMesh: cardMesh, unitMesh };
        addLog(`${tpl.name}: выберите направление для цели.`);
        window.__ui.panels.showOrientationPanel();
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
    // Каст на существо (через клик)
    onUnit({ tpl, pl }) {
      const handCreatures = pl.hand.filter(c => c && c.type === 'UNIT');
      if (handCreatures.length === 0) {
        showNotification('No units available', 'error');
        return;
      }
      window.__ui.panels.showPrompt('Выберите существо из руки', () => {
        interactionState.pendingDiscardSelection = null;
        resetCardSelection();
        updateHand();
        updateUI();
      });
      interactionState.pendingDiscardSelection = {
        requiredType: 'UNIT',
        onPicked: handIdx => {
          const localSpellIdx = pl.hand.indexOf(tpl);
          const toDiscardTpl = discardFromHand(pl, handIdx, { to: 'graveyard' });
          updateHand();
          const before = pl.mana;
          pl.mana = capMana(pl.mana + 2);
          updateUI();
          animateTurnManaGain(gameState.active, before, pl.mana, 800);
          addLog(`${tpl.name}: ритуал — +2 маны (\`${toDiscardTpl?.name||''}\`).`);
          const adjIdx = localSpellIdx > handIdx ? localSpellIdx - 1 : localSpellIdx;
          if (adjIdx >= 0) discardFromHand(pl, adjIdx, { to: 'discard', skipAnim: true });
          interactionState.pendingDiscardSelection = null;
          try { window.__ui.panels.hidePrompt(); } catch {}
          resetCardSelection();
          updateHand();
          updateUI();
          schedulePush('spell-holy-feast', { force: true });
        }
      };
      addLog(`${tpl.name}: выберите существо в руке для ритуального сброса.`);
    },

    // Каст перетаскиванием на поле
    onBoard({ tpl, pl, idx, cardMesh, tileMesh }) {
      const handCreatures = pl.hand.filter(c => c && c.type === 'UNIT');
      if (handCreatures.length === 0) {
        showNotification('No unit in hand for this action', 'error');
        return;
      }
      let boardMesh = null;
      try {
        const big = window.__cards?.createCard3D(tpl, false);
        const p = tileMesh ? tileMesh.position.clone().add(new THREE.Vector3(0,1.0,0)) : new THREE.Vector3(0,1.0,0);
        big.position.copy(p);
        const ctx = getCtx();
        (ctx.boardGroup || ctx.scene).add(big);
        boardMesh = big;
      } catch {}
      interactionState.pendingRitualBoardMesh = boardMesh;
      interactionState.spellDragHandled = true;
      interactionState.pendingRitualSpellHandIndex = idx;
      interactionState.pendingRitualSpellCard = tpl;
      try { cardMesh.visible = false; } catch {}

      window.__ui.panels.showPrompt('Выберите существо из руки', () => {
        try { if (boardMesh && boardMesh.parent) boardMesh.parent.remove(boardMesh); } catch {}
        try { cardMesh.visible = true; } catch {}
        interactionState.pendingRitualBoardMesh = null;
        interactionState.pendingRitualSpellHandIndex = null;
        interactionState.pendingRitualSpellCard = null;
        interactionState.pendingDiscardSelection = null;
        resetCardSelection();
        updateHand();
        updateUI();
      });

      interactionState.pendingDiscardSelection = {
        requiredType: 'UNIT',
        onPicked: handIdx => {
          const localSpellIdx = interactionState.pendingRitualSpellHandIndex != null ? interactionState.pendingRitualSpellHandIndex : pl.hand.indexOf(tpl);
          const toDiscardTpl = discardFromHand(pl, handIdx, { to: 'graveyard' });
          updateHand();
          const before = pl.mana;
          pl.mana = capMana(pl.mana + 2);
          updateUI();
          animateTurnManaGain(gameState.active, before, pl.mana, 800);
          addLog(`${tpl.name}: ритуал — +2 маны.`);
          const adjIdx = localSpellIdx > handIdx ? localSpellIdx - 1 : localSpellIdx;
          if (adjIdx >= 0) discardFromHand(pl, adjIdx, { to: 'discard', skipAnim: true });
          try { if (boardMesh && boardMesh.parent) boardMesh.parent.remove(boardMesh); } catch {}
          interactionState.pendingRitualBoardMesh = null;
          interactionState.pendingRitualSpellHandIndex = null;
          interactionState.pendingRitualSpellCard = null;
          interactionState.pendingDiscardSelection = null;
          try { window.__ui.panels.hidePrompt(); } catch {}
          resetCardSelection();
          updateHand();
          updateUI();
          schedulePush('spell-holy-feast', { force: true });
        }
      };
      addLog(`${tpl.name}: выберите существо в руке для ритуального сброса.`);
    }
  },

  WIND_SHIFT: {
    requiresUnitTarget: true,
    onUnit({ tpl, pl, idx, u }) {
      if (u) u.facing = turnCW[u.facing];
      addLog(`${tpl.name}: ${CARDS[u.tplId].name} повёрнут.`);
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
          try { gameState.players[owner].graveyard.push(CARDS[u.tplId]); } catch {}
          const pos = getCtx().tileMeshes[r][c].position.clone().add(new THREE.Vector3(0, 1.2, 0));
          animateManaGainFromWorld(pos, owner);
          const unitMeshesCtx = getCtx().unitMeshes;
          if (unitMeshesCtx) {
            const unitMesh = unitMeshesCtx.find(m => m.userData.row === r && m.userData.col === c);
            if (unitMesh) {
              window.__fx.dissolveAndAsh(unitMesh, new THREE.Vector3(0, 0, 0.6), 0.9);
            }
          }
          setTimeout(() => {
            gameState.board[r][c].unit = null;
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

  RAISE_STONE: {
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
      const before = u.currentHP;
      u.currentHP += 2;
      addLog(
        `${tpl.name}: ${CARDS[u.tplId].name} получает +2 HP (HP ${before}→${u.currentHP})`
      );
      try {
        const tMesh = unitMeshes.find(m => m.userData.row === r && m.userData.col === c);
        if (tMesh) window.__fx.spawnDamageText(tMesh, `+2`, '#22c55e');
      } catch {}
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
      if (cell.element === 'MECH') {
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
      try {
        const tile = getCtx().tileMeshes[r][c];
        const mat = getTileMaterial(nextEl);
        window.__fx.dissolveTileCrossfade(
          tile,
          getTileMaterial(prevEl),
          mat,
          0.9
        );
        try {
          if (NET_ON() && MY_SEAT === gameState.active && window.socket)
            window.socket.emit('tileCrossfade', { r, c, prev: prevEl, next: nextEl });
        } catch {}
      } catch {}
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
            try { gameState.players[u.owner].graveyard.push(CARDS[u.tplId]); } catch {}
            const deadMesh = unitMeshes.find(m => m.userData.row === r && m.userData.col === c);
            if (deadMesh) {
              window.__fx.dissolveAndAsh(deadMesh, new THREE.Vector3(0, 0, 0.6), 0.9);
              setTimeout(() => {
                gameState.board[r][c].unit = null;
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

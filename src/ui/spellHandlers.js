import { spendAndDiscardSpell, burnSpellCard } from './spellUtils.js';

// Handlers for individual spell effects to keep index.html lean.

export function handleBeguilingFog({ tpl, cardMesh, unitMesh }) {
  pendingSpellOrientation = { spellCardMesh: cardMesh, unitMesh };
  addLog(`${tpl.name}: выберите направление для цели.`);
  try { window.__ui.panels.showOrientationPanel(); } catch {}
  return true; // wait for orientation selection before spending
}

export function handleClareWilsBanner({ tpl, pl, idx, r, c, u }) {
  if (!u || u.owner !== gameState.active) { showNotification('Target: friendly unit', 'error'); return true; }
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
          gsap.to(ring.scale, { x: 2.5, y: 2.5, z: 2.5, duration: 0.4, ease: 'power2.out' })
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
  return true;
}

export function handleSummonersErrand({ tpl, pl, idx, tileMesh, cardMesh }) {
  if (tileMesh) burnSpellCard(tpl, tileMesh, cardMesh);
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
  return true;
}

export function handleGoghlieAltar({ tpl, pl, idx, tileMesh, cardMesh }) {
  const countUnits = ownerIdx => {
    let n = 0;
    for (let rr = 0; rr < 3; rr++)
      for (let cc = 0; cc < 3; cc++) {
        const un = gameState.board[rr][cc].unit;
        if (un && un.owner !== ownerIdx) n++;
      }
    return n;
  };
  const g0 = countUnits(0), g1 = countUnits(1);
  gameState.players[0].mana = capMana(gameState.players[0].mana + g0);
  gameState.players[1].mana = capMana(gameState.players[1].mana + g1);
  for (let rr = 0; rr < 3; rr++)
    for (let cc = 0; cc < 3; cc++) {
      const un = gameState.board[rr][cc].unit;
      if (!un) continue;
      const pos = tileMeshes[rr][cc].position.clone().add(new THREE.Vector3(0, 1.2, 0));
      animateManaGainFromWorld(pos, un.owner === 0 ? 1 : 0);
    }
  addLog(`${tpl.name}: оба игрока получают ману от вражеских существ (P1 +${g0}, P2 +${g1}).`);
  if (tileMesh) burnSpellCard(tpl, tileMesh, cardMesh);
  spendAndDiscardSpell(pl, idx);
  resetCardSelection();
  updateHand();
  updateUI();
  return true;
}

export function handleHolyFeastUnit({ tpl, pl }) {
  const handCreatures = pl.hand.filter(x => x && x.type === 'UNIT');
  if (handCreatures.length === 0) {
    showNotification('No units available', 'error');
    return true;
  }
  console.log('[HF:setup] Setting up pendingDiscardSelection for Holy Feast (castSpellOnUnit)');
  pendingDiscardSelection = {
    requiredType: 'UNIT',
    onPicked: handIdx => {
      console.log('[HF:onPicked] Called onPicked (castSpellOnUnit)', {
        handIdx,
        NET_ACTIVE: typeof NET_ACTIVE !== 'undefined' ? NET_ACTIVE : 'undefined',
      });
      const toDiscardTpl = pl.hand[handIdx];
      if (!toDiscardTpl) return;
      const localSpellIdx = pl.hand.indexOf(tpl);
      try {
        if (typeof NET_ACTIVE !== 'undefined' ? NET_ACTIVE : false) {
          PENDING_HIDE_HAND_CARDS = Array.from(new Set([handIdx, localSpellIdx])).filter(i => i >= 0);
        }
      } catch {}
      const handMesh = handCardMeshes.find(m => m.userData?.handIndex === handIdx);
      if (handMesh) {
        try {
          handMesh.userData.isInHand = false;
        } catch {}
        window.__fx.dissolveAndAsh(handMesh, new THREE.Vector3(0, 0.6, 0), 0.9);
      }
      if (typeof NET_ACTIVE !== 'undefined' ? NET_ACTIVE : false) {
        try {
          if (typeof window !== 'undefined' && window.socket)
            window.socket.emit('holyFeast', {
              seat: gameState.active,
              spellIdx: localSpellIdx,
              creatureIdx: handIdx,
            });
        } catch {}
        window.__ui.panels.hidePrompt();
        pendingDiscardSelection = null;
        resetCardSelection();
        updateHand();
        updateUI();
      } else {
        try {
          pl.graveyard.push(toDiscardTpl);
        } catch {}
        pl.hand.splice(handIdx, 1);
        updateHand();
        pl.mana = capMana(pl.mana + 2);
        updateUI();
        addLog(`${tpl.name}: сбрасываете существо из руки и получаете +2 маны (\`${toDiscardTpl.name}\`).`);
        pl.mana = capMana(pl.mana - (tpl.cost || 0));
        const spellIdx2 = pl.hand.indexOf(tpl);
        if (spellIdx2 >= 0) {
          pl.hand.splice(spellIdx2, 1);
        }
        pl.discard.push(tpl);
        resetCardSelection();
        updateHand();
        updateUI();
        schedulePush('spell-holy-feast', { force: true });
      }
    },
  };
  addLog(`${tpl.name}: выберите существо в руке для ритуального сброса.`);
  return true;
}

export function handleWindShift({ tpl, u }) {
  if (u) u.facing = turnCW[u.facing];
  addLog(`${tpl.name}: ${CARDS[u.tplId].name} повёрнут.`);
  return false; // continue with default spending
}

export function handleFreezeStream(ctx) {
  const { tpl, u, r, c, unitMesh } = ctx;
  if (u) {
    const before = u.currentHP;
    u.currentHP = Math.max(0, u.currentHP - 1);
    addLog(`${tpl.name}: ${CARDS[u.tplId].name} получает 1 урона (HP ${before}→${u.currentHP})`);
    try {
      const tMesh = unitMeshes.find(m => m.userData.row === r && m.userData.col === c);
      if (tMesh) window.__fx.spawnDamageText(tMesh, `-1`, '#ef4444');
    } catch {}
    if (u.currentHP <= 0) {
      ctx.delayedApply = true;
      const owner = u.owner;
      try { gameState.players[owner].graveyard.push(CARDS[u.tplId]); } catch {}
      const pos = tileMeshes[r][c].position.clone().add(new THREE.Vector3(0, 1.2, 0));
      animateManaGainFromWorld(pos, owner);
      if (unitMesh) {
        window.__fx.dissolveAndAsh(unitMesh, new THREE.Vector3(0, 0, 0.6), 0.9);
      }
      setTimeout(() => {
        gameState.board[r][c].unit = null;
        updateUnits();
        updateUI();
      }, 1000);
    }
  }
  return false;
}

export function handleRaiseStone({ tpl, u, r, c }) {
  if (!u) {
    showNotification('Need to drag this card to a unit', 'error');
    return true;
  }
  if (u.owner !== gameState.active) {
    showNotification('Only friendly unit', 'error');
    return true;
  }
  const before = u.currentHP;
  u.currentHP += 2;
  addLog(`${tpl.name}: ${CARDS[u.tplId].name} получает +2 HP (HP ${before}→${u.currentHP})`);
  try {
    const tMesh = unitMeshes.find(m => m.userData.row === r && m.userData.col === c);
    if (tMesh) window.__fx.spawnDamageText(tMesh, `+2`, '#22c55e');
  } catch {}
  return false;
}

export function handleFissuresOfGoghlie({ tpl, pl, idx, tileMesh, cardMesh }) {
  if (!tileMesh) {
    showNotification('Drag this card to a board cell', 'error');
    return true;
  }
  const r = tileMesh.userData.row,
    c = tileMesh.userData.col;
  const cell = gameState.board[r][c];
  if (!cell) return true;
  if (cell.element === 'MECH') {
    showNotification('This cell can\\'t be changed', 'error');
    return true;
  }
  const oppMap = { FIRE: 'WATER', WATER: 'FIRE', EARTH: 'FOREST', FOREST: 'EARTH' };
  const prevEl = cell.element;
  const nextEl = oppMap[prevEl] || prevEl;
  cell.element = nextEl;
  try {
    const tile = tileMeshes[r][c];
    const mat = getTileMaterial(nextEl);
    window.__fx.dissolveTileCrossfade(tile, getTileMaterial(prevEl), mat, 0.9);
    try {
      if (NET_ON() && MY_SEAT === gameState.active && typeof window !== 'undefined' && window.socket)
        window.socket.emit('tileCrossfade', { r, c, prev: prevEl, next: nextEl });
    } catch {}
  } catch {}
  const u = gameState.board[r][c].unit;
  if (u) {
    const tplU = CARDS[u.tplId];
    const prevBuff = computeCellBuff(prevEl, tplU.element);
    const nextBuff = computeCellBuff(nextEl, tplU.element);
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
  burnSpellCard(tpl, tileMesh, cardMesh);
  spendAndDiscardSpell(pl, idx);
  updateHand();
  updateUnits();
  updateUI();
  return true;
}

export function handleHolyFeastBoard({ tpl, pl, idx, tileMesh, cardMesh }) {
  const handCreatures = pl.hand.filter(x => x && x.type === 'UNIT');
  if (handCreatures.length === 0) {
    showNotification('No unit in hand for this action', 'error');
    return true;
  }
  try {
    const big = createCard3D(tpl, false);
    const p = tileMesh
      ? tileMesh.position.clone().add(new THREE.Vector3(0, 1.0, 0))
      : new THREE.Vector3(0, 1.0, 0);
    big.position.copy(p);
    (boardGroup || scene).add(big);
    pendingRitualBoardMesh = big;
    spellDragHandled = true;
    try { cardMesh.visible = false; } catch {}
    pendingRitualSpellHandIndex = idx;
    pendingRitualSpellCard = tpl;
  } catch {}
  console.log('[HF:drag] Showing prompt for Holy Feast drag to field');
  window.__ui.panels.showPrompt('Select a unit for this action', () => {
    console.log('[HF:drag] Canceling Holy Feast ritual');
    try {
      if (pendingRitualBoardMesh && pendingRitualBoardMesh.parent)
        pendingRitualBoardMesh.parent.remove(pendingRitualBoardMesh);
    } catch {}
    pendingRitualBoardMesh = null;
    try { cardMesh.visible = true; } catch {}
    pendingRitualSpellHandIndex = null;
    pendingRitualSpellCard = null;
    updateHand();
    pendingDiscardSelection = null;
  });
  if (handCreatures.length > 1) {
    console.log('[HF:setup] Setting up pendingDiscardSelection for Holy Feast (handleSpellDrop)');
    pendingDiscardSelection = {
      requiredType: 'UNIT',
      onPicked: handIdx => {
        console.log('[HF:onPicked] Called onPicked (handleSpellDrop)', { handIdx, NET_ACTIVE });
        const toDiscardTpl = pl.hand[handIdx];
        if (!toDiscardTpl) return;
        const localSpellIdx =
          pendingRitualSpellHandIndex != null ? pendingRitualSpellHandIndex : pl.hand.indexOf(tpl);
        try {
          if (typeof NET_ACTIVE !== 'undefined' ? NET_ACTIVE : false) {
            PENDING_HIDE_HAND_CARDS = Array.from(new Set([handIdx, localSpellIdx])).filter(i => i >= 0);
          }
        } catch {}
        const handMesh = handCardMeshes.find(m => m.userData?.handIndex === handIdx);
        if (handMesh) {
          try {
            handMesh.userData.isInHand = false;
          } catch {}
          window.__fx.dissolveAndAsh(handMesh, new THREE.Vector3(0, 0.6, 0), 0.9);
        }
        if (typeof NET_ACTIVE !== 'undefined' ? NET_ACTIVE : false) {
          try { if (typeof window !== 'undefined') window.__HF_ACK = false; } catch {}
          try {
            if (typeof window !== 'undefined' && window.socket)
              window.socket.emit('debugLog', {
                tag: 'HF:onPicked',
                phase: 'emit',
                localSpellIdx,
                handIdx,
                active: gameState.active,
              });
          } catch {}
          try {
            if (pendingRitualBoardMesh) {
              window.__fx.dissolveAndAsh(pendingRitualBoardMesh, new THREE.Vector3(0, 0.6, 0), 0.9);
              setTimeout(() => {
                try { pendingRitualBoardMesh.parent.remove(pendingRitualBoardMesh); } catch {}
                pendingRitualBoardMesh = null;
              }, 950);
            }
          } catch {}
          try {
            if (typeof window !== 'undefined' && window.socket)
              window.socket.emit('holyFeast', {
                seat: gameState.active,
                spellIdx: localSpellIdx,
                creatureIdx: handIdx,
              });
          } catch {}
          setTimeout(() => {
            try {
              if (typeof window !== 'undefined' && !window.__HF_ACK && window.socket)
                window.socket.emit('holyFeast', {
                  seat: gameState.active,
                  spellIdx: localSpellIdx,
                  creatureIdx: handIdx,
                });
            } catch {}
          }, 350);
          pendingRitualSpellHandIndex = null;
          pendingRitualSpellCard = null;
          console.log('[HF:onPicked] Hiding prompt and clearing selection (online)');
          window.__ui.panels.hidePrompt();
          pendingDiscardSelection = null;
          updateHand();
          updateUI();
        } else {
          console.log('[HF:onPicked] Processing offline (handleSpellDrop)');
          try {
            pl.graveyard.push(toDiscardTpl);
          } catch {}
          pl.hand.splice(handIdx, 1);
          updateHand();
          pl.mana = capMana(pl.mana + 2);
          addLog(`${tpl.name}: ритуал — +2 маны.`);
          try {
            if (pendingRitualBoardMesh) {
              window.__fx.dissolveAndAsh(pendingRitualBoardMesh, new THREE.Vector3(0, 0.6, 0), 0.9);
              setTimeout(() => {
                try { pendingRitualBoardMesh.parent.remove(pendingRitualBoardMesh); } catch {}
                pendingRitualBoardMesh = null;
              }, 950);
            }
          } catch {}
          let spellIdx = localSpellIdx;
          if (spellIdx >= 0) {
            pl.hand.splice(spellIdx, 1);
          }
          pendingRitualSpellHandIndex = null;
          pendingRitualSpellCard = null;
          console.log('[HF:onPicked] Hiding prompt and clearing selection (offline)');
          pendingDiscardSelection = null;
          window.__ui.panels.hidePrompt();
          pl.discard.push(tpl);
          updateHand();
          updateUI();
          schedulePush('spell-holy-feast', { force: true });
        }
      },
    };
    addLog(`${tpl.name}: выберите существо в руке для ритуального сброса.`);
    setTimeout(() => {
      try {
        if (pendingDiscardSelection) {
          window.__ui.panels.hidePrompt();
          pendingDiscardSelection = null;
          updateHand();
          updateUI();
        }
      } catch {}
    }, 3000);
    return true;
  }
  const singleIdx = pl.hand.findIndex(x => x && x.type === 'UNIT');
  if (singleIdx >= 0) {
    const toDiscardTpl = pl.hand[singleIdx];
    const handMesh = handCardMeshes.find(m => m.userData?.handIndex === singleIdx);
    const localSpellIdx =
      pendingRitualSpellHandIndex != null ? pendingRitualSpellHandIndex : pl.hand.indexOf(tpl);
    try {
      if (NET_ON()) {
        PENDING_HIDE_HAND_CARDS = Array.from(new Set([singleIdx, localSpellIdx])).filter(i => i >= 0);
      }
    } catch {}
    if (handMesh) {
      try { handMesh.userData.isInHand = false; } catch {}
      window.__fx.dissolveAndAsh(handMesh, new THREE.Vector3(0, 0.6, 0), 0.9);
    }
    if (NET_ON()) {
      try { if (typeof window !== 'undefined') window.__HF_ACK = false; } catch {}
      try {
        if (typeof window !== 'undefined' && window.socket)
          window.socket.emit('debugLog', { tag: 'HF:single', phase: 'emit', localSpellIdx, singleIdx, active: gameState.active });
      } catch {}
      try {
        if (pendingRitualBoardMesh) {
          window.__fx.dissolveAndAsh(pendingRitualBoardMesh, new THREE.Vector3(0, 0.6, 0), 0.9);
          setTimeout(() => {
            try { pendingRitualBoardMesh.parent.remove(pendingRitualBoardMesh); } catch {}
            pendingRitualBoardMesh = null;
          }, 950);
        }
      } catch {}
      try {
        if (typeof window !== 'undefined' && window.socket)
          window.socket.emit('ritualResolve', { kind: 'HOLY_FEAST', by: gameState.active, card: tpl.id, consumed: toDiscardTpl.id });
      } catch {}
      try {
        if (typeof window !== 'undefined' && window.socket)
          window.socket.emit('holyFeast', {
            seat: gameState.active,
            spellIdx: localSpellIdx,
            creatureIdx: singleIdx,
          });
      } catch {}
      setTimeout(() => {
        try {
          if (typeof window !== 'undefined' && !window.__HF_ACK && window.socket)
            window.socket.emit('holyFeast', {
              seat: gameState.active,
              spellIdx: localSpellIdx,
              creatureIdx: singleIdx,
            });
        } catch {}
      }, 350);
      pendingRitualSpellHandIndex = null;
      pendingRitualSpellCard = null;
      window.__ui.panels.hidePrompt();
      updateHand();
      updateUI();
    } else {
      try { pl.graveyard.push(toDiscardTpl); } catch {}
      pl.hand.splice(singleIdx, 1);
      updateHand();
      pl.mana = capMana(pl.mana + 2);
      addLog(`${tpl.name}: ритуал — +2 маны.`);
      try {
        if (pendingRitualBoardMesh) {
          window.__fx.dissolveAndAsh(pendingRitualBoardMesh, new THREE.Vector3(0, 0.6, 0), 0.9);
          setTimeout(() => {
            try { pendingRitualBoardMesh.parent.remove(pendingRitualBoardMesh); } catch {}
            pendingRitualBoardMesh = null;
          }, 950);
        }
      } catch {}
      let spellIdx = localSpellIdx;
      if (spellIdx >= 0) {
        pl.hand.splice(spellIdx, 1);
      }
      pendingRitualSpellHandIndex = null;
      pendingRitualSpellCard = null;
      pendingDiscardSelection = null;
      pl.discard.push(tpl);
      updateHand();
      updateUI();
      window.__ui.panels.hidePrompt();
      schedulePush('spell-holy-feast', { force: true });
    }
  }
  return true;
}

export const onUnit = {
  SPELL_BEGUILING_FOG: handleBeguilingFog,
  SPELL_CLARE_WILS_BANNER: handleClareWilsBanner,
  SPELL_SUMMONER_MESMERS_ERRAND: handleSummonersErrand,
  SPELL_GOGHLIE_ALTAR: handleGoghlieAltar,
  SPELL_PARMTETIC_HOLY_FEAST: handleHolyFeastUnit,
  WIND_SHIFT: handleWindShift,
  FREEZE_STREAM: handleFreezeStream,
  RAISE_STONE: handleRaiseStone,
};

export const onDrag = {
  SPELL_SUMMONER_MESMERS_ERRAND: handleSummonersErrand,
  SPELL_GOGHLIE_ALTAR: handleGoghlieAltar,
  SPELL_FISSURES_OF_GOGHLIE: handleFissuresOfGoghlie,
  SPELL_PARMTETIC_HOLY_FEAST: handleHolyFeastBoard,
};

const api = { onUnit, onDrag };
try {
  if (typeof window !== 'undefined') {
    window.__ui = window.__ui || {};
    window.__ui.spellHandlers = api;
  }
} catch {}
export default api;

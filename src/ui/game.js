// Game lifecycle helpers extracted from index.html
// Depends on globals exposed via main.js and other modules

export async function initGame() {
  const startGame = window.startGame;
  const STARTER_FIRESET = window.STARTER_FIRESET || [];
  if (typeof startGame !== 'function') return;
  window.gameState = startGame(STARTER_FIRESET, STARTER_FIRESET);
  const gameState = window.gameState;
  try {
    window.createBoard?.();
    window.createMetaObjects?.();
    window.updateUnits?.();
    window.updateHand?.();
    window.updateUI?.();
  } catch {}
  try {
    if (window.__ui && window.__ui.banner) {
      const b = window.__ui.banner; const t = gameState?.turn;
      const fn = (typeof b.ensureTurnSplashVisible === 'function') ? b.ensureTurnSplashVisible : b.forceTurnSplashWithRetry;
      await fn.call(b, 2, t);
    } else if (typeof window.forceTurnSplashWithRetry === 'function') {
      await window.forceTurnSplashWithRetry(2, gameState?.turn);
    }
  } catch {}
  try { if (window.__turnTimerId) clearInterval(window.__turnTimerId); } catch {}
  window.__turnTimerSeconds = 100;
  (function syncBtn(){ try {
    const btn = document.getElementById('end-turn-btn');
    if (btn) {
      const fill = btn.querySelector('.time-fill');
      const txt = btn.querySelector('.sec-text');
      if (txt) txt.textContent = `${window.__turnTimerSeconds}`;
      if (fill) fill.style.top = `0%`;
    }
  } catch {} })();
  try {
    if (window.__ui && window.__ui.turnTimer) {
      const tt = window.__ui.turnTimer.attach('end-turn-btn');
      const online = (typeof window.NET_ON === 'function') ? window.NET_ON() : !!window.NET_ACTIVE;
      if (online) { tt.stop(); } else { tt.reset(100).start(); }
    }
  } catch {}
  window.addLog?.('The game has begun! Player 1 goes first.');
  window.addLog?.('Drag units to the field, use spells by clicking.');
}

export async function endTurn() {
  const gameState = window.gameState;
  if (!gameState || gameState.winner !== null) return;
  try { if (window.isInputLocked && window.isInputLocked()) return; } catch {}
  try {
    if (typeof window.MY_SEAT === 'number') {
      if (gameState.active !== window.MY_SEAT) { window.showNotification?.("Opponent's turn", 'error'); return; }
    }
  } catch {}
  if (typeof window.isInputLocked === 'function' ? window.isInputLocked() : (window.manaGainActive || window.drawAnimationActive || window.splashActive)) {
    window.showNotification?.('Wait for animations to complete', 'warning');
    return;
  }
  window.__endTurnInProgress = true;
  try { if (window.__turnTimerId) clearInterval(window.__turnTimerId); } catch {}
  window.__turnTimerSeconds = 100;
  (function syncBtn(){ try {
    const btn = document.getElementById('end-turn-btn');
    if (btn) {
      const fill = btn.querySelector('.time-fill');
      const txt = btn.querySelector('.sec-text');
      if (txt) txt.textContent = `${window.__turnTimerSeconds}`;
      if (fill) fill.style.top = `0%`;
    }
  } catch {} })();
  window.__turnTimerId = setInterval(() => {
    if (typeof window.__turnTimerSeconds !== 'number') window.__turnTimerSeconds = 100;
    if (window.__turnTimerSeconds > 0) window.__turnTimerSeconds -= 1;
    try {
      const btn = document.getElementById('end-turn-btn');
      if (btn) {
        const fill = btn.querySelector('.time-fill');
        const txt = btn.querySelector('.sec-text');
        const s = Math.max(0, Math.min(100, window.__turnTimerSeconds));
        if (txt) txt.textContent = `${s}`;
        const percent = s / 100;
        if (fill) fill.style.top = `${Math.round((1 - percent) * 100)}%`;
        if (s <= 10) { btn.classList.add('urgent'); } else { btn.classList.remove('urgent'); }
      }
    } catch {}
  }, 1000);
  try { if (window.__turnTimerId) { clearInterval(window.__turnTimerId); window.__turnTimerId = null; } } catch {}
  try {
    if (window.__ui && window.__ui.turnTimer) {
      const tt = window.__ui.turnTimer.attach('end-turn-btn');
      const online = (typeof window.NET_ON === 'function') ? window.NET_ON() : !!window.NET_ACTIVE;
      if (online) { tt.stop(); } else { tt.reset(100).start(); }
    }
  } catch {}
  try {
    const online = (typeof window.NET_ON === 'function') ? window.NET_ON() : !!window.NET_ACTIVE;
    if (online) {
      try { (window.socket || window.socket)?.emit('endTurn'); } catch {}
      window.refreshInputLockUI?.();
      return;
    }
  } catch {}
  const controlledCells = typeof window.countControlled === 'function' ? window.countControlled(gameState, gameState.active) : 0;
  if (controlledCells >= 5) {
    gameState.winner = gameState.active;
    window.showNotification?.(`${gameState.players[gameState.active].name} побеждает!`, 'success');
    return;
  }
  try {
    for (let rr = 0; rr < 3; rr++) for (let cc = 0; cc < 3; cc++) {
      const u = gameState.board[rr][cc].unit; if (!u) continue;
      if (typeof u.tempAtkBuff === 'number' && u.tempBuffOwner === gameState.active) {
        delete u.tempAtkBuff; delete u.tempBuffOwner;
      }
    }
  } catch {}
  try { window.gameState.turn += 1; } catch {}
  try { window.gameState.active = 1 - window.gameState.active; } catch {}
  const player = gameState.players[gameState.active];
  const before = player.mana;
  const manaAfter = Math.min(10, player.mana + 2);
  player._beforeMana = before;
  let drawnTpl = null; let shouldAnimateDraw = false;
  try {
    drawnTpl = window.drawOne?.(player.deck);
    if (drawnTpl) shouldAnimateDraw = true;
  } catch {}
  try { window.updateUnits?.(); window.updateHand?.(); } catch {}
  try {
    if (window.__ui && window.__ui.banner) {
      await window.__ui.banner.requestTurnSplash(gameState.turn);
    }
  } catch {}
  setTimeout(() => { try { window.__ui?.panels?.hideUnitActionPanel(); } catch {}; window.selectedUnit = null; }, 1000);
  try { if (window.__turnTimerId) { clearInterval(window.__turnTimerId); window.__turnTimerId = null; } } catch {}
  try {
    if (window.__ui && window.__ui.turnTimer) {
      const tt = window.__ui.turnTimer.attach('end-turn-btn');
      const online = (typeof window.NET_ON === 'function') ? window.NET_ON() : !!window.NET_ACTIVE;
      if (online) { tt.stop(); } else { tt.reset(100).start(); }
    }
  } catch {}
  try {
    if (window.__ui && window.__ui.mana && typeof window.__ui.mana.animateTurnManaGain === 'function') {
      await window.__ui.mana.animateTurnManaGain(gameState.active, before, manaAfter, 1500);
    }
    player.mana = manaAfter;
  } catch {}
  await new Promise(r => setTimeout(r, 80));
  window.updateUI?.();
  try {
    if (shouldAnimateDraw && drawnTpl) {
      window.pendingDrawCount = 1; window.updateHand?.();
      window.refreshInputLockUI?.();
      await window.animateDrawnCardToHand?.(drawnTpl);
      try { gameState.players[gameState.active].hand.push(drawnTpl); } catch {}
      window.pendingDrawCount = 0; window.updateHand?.();
    }
  } catch { window.pendingDrawCount = 0; }
  window.addLog?.(`Ход ${gameState.turn}. ${player.name} получает +2 маны и добирает карту.`);
  window.__endTurnInProgress = false;
  window.manaGainActive = false;
  window.refreshInputLockUI?.();
}

export function placeUnitWithDirection(direction) {
  if (!window.pendingPlacement) return;
  const { card, row, col, handIndex } = window.pendingPlacement;
  const cardData = card.userData.cardData;
  const player = window.gameState.players[window.gameState.active];
  if (cardData.cost > player.mana) {
    window.showNotification?.('Insufficient mana!', 'error');
    returnCardToHand(card);
    window.__ui?.panels?.hideOrientationPanel();
    window.pendingPlacement = null;
    return;
  }
  const unit = {
    uid: window.uid(),
    owner: window.gameState.active,
    tplId: cardData.id,
    currentHP: cardData.hp,
    facing: direction,
  };
  window.gameState.board[row][col].unit = unit;
  player.mana -= cardData.cost;
  player.discard.push(cardData);
  player.hand.splice(handIndex, 1);
  const cellElement = window.gameState.board[row][col].element;
  const buff = window.computeCellBuff(cellElement, cardData.element);
  if (buff.hp !== 0) {
    const before = unit.currentHP;
    unit.currentHP = Math.max(0, unit.currentHP + buff.hp);
    if (buff.hp > 0) {
      window.addLog?.(`Элемент усиливает ${cardData.name}: HP ${before}→${unit.currentHP}`);
    } else {
      window.addLog?.(`Элемент ослабляет ${cardData.name}: HP ${before}→${unit.currentHP}`);
    }
  }
  if (unit.currentHP <= 0) {
    window.addLog?.(`${cardData.name} погибает от неблагоприятной стихии!`);
    const owner = unit.owner;
    try { window.gameState.players[owner].graveyard.push(window.CARDS[unit.tplId]); } catch {}
    const pos = window.tileMeshes[row][col].position.clone().add(new window.THREE.Vector3(0, 1.2, 0));
    window.animateManaGainFromWorld?.(pos, owner);
    window.gameState.board[row][col].unit = null;
  }
  const targetPos = window.tileMeshes[row][col].position.clone();
  targetPos.y = window.tileMeshes[row][col].position.y + 0.28;
  window.gsap?.to(card.position, {
    x: targetPos.x,
    y: targetPos.y,
    z: targetPos.z,
    duration: 0.5,
    ease: 'power2.inOut',
  });
  window.gsap?.to(card.rotation, {
    x: 0,
    y: (window.facingDeg[direction]) * Math.PI / 180,
    z: 0,
    duration: 0.5,
    onComplete: () => {
      window.updateHand?.();
      window.updateUnits?.();
      window.updateUI?.();
      const hitsNow = typeof window.computeHits === 'function' ? window.computeHits(window.gameState, row, col) : [];
      if (hitsNow && hitsNow.length) window.performBattleSequence?.(row, col, false);
    }
  });
  window.addLog?.(`${player.name} призывает ${cardData.name} на (${row + 1},${col + 1})`);
  window.__ui?.panels?.hideOrientationPanel();
  window.pendingPlacement = null;
}

export function cancelPendingPlacement() {
  if (window.pendingPlacement) {
    returnCardToHand(window.pendingPlacement.card);
    window.pendingPlacement = null;
  }
}

const api = { initGame, endTurn, placeUnitWithDirection, cancelPendingPlacement };
try {
  if (typeof window !== 'undefined') {
    window.__ui = window.__ui || {};
    window.__ui.game = api;
    Object.assign(window, { initGame, endTurn, placeUnitWithDirection });
  }
} catch {}

export default api;

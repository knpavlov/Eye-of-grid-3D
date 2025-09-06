// Игровые действия: инициализация, завершение хода и размещение юнитов
// Вынесено из index.html для переиспользования и явных зависимостей

const g = typeof window !== 'undefined' ? window : globalThis;

let pendingPlacement = null;

export function startPlacement(card, row, col, handIndex) {
  pendingPlacement = { card, row, col, handIndex };
  try { g.__ui?.panels?.showOrientationPanel(); } catch {}
}

export function cancelPlacement() {
  if (pendingPlacement) {
    try {
      const inter = g.__scene?.interactions;
      inter?.returnCardToHand?.(pendingPlacement.card);
    } catch {}
  }
  pendingPlacement = null;
  try { g.__ui?.panels?.hideOrientationPanel(); } catch {}
}

export function placeUnitWithDirection(direction) {
  if (!pendingPlacement) return;
  const { card, row, col, handIndex } = pendingPlacement;
  const cardData = card.userData.cardData;
  const player = g.gameState.players[g.gameState.active];
  if (cardData.cost > player.mana) {
    g.showNotification?.('Insufficient mana!', 'error');
    g.__scene?.interactions?.returnCardToHand?.(card);
    g.__ui?.panels?.hideOrientationPanel?.();
    pendingPlacement = null;
    return;
  }

  const unit = {
    uid: g.uid(),
    owner: g.gameState.active,
    tplId: cardData.id,
    currentHP: cardData.hp,
    facing: direction,
  };

  g.gameState.board[row][col].unit = unit;
  player.mana -= cardData.cost;
  player.discard.push(cardData);
  player.hand.splice(handIndex, 1);

  const cellElement = g.gameState.board[row][col].element;
  const buff = g.computeCellBuff(cellElement, cardData.element);
  if (buff.hp !== 0) {
    const before = unit.currentHP;
    unit.currentHP = Math.max(0, unit.currentHP + buff.hp);
    if (buff.hp > 0) {
      g.addLog?.(`Элемент усиливает ${cardData.name}: HP ${before}→${unit.currentHP}`);
    } else {
      g.addLog?.(`Элемент ослабляет ${cardData.name}: HP ${before}→${unit.currentHP}`);
    }
  }

  if (unit.currentHP <= 0) {
    g.addLog?.(`${cardData.name} погибает от неблагоприятной стихии!`);
    const owner = unit.owner;
    try { g.gameState.players[owner].graveyard.push(g.CARDS[unit.tplId]); } catch {}
    const pos = g.tileMeshes[row][col].position.clone().add(new g.THREE.Vector3(0, 1.2, 0));
    g.animateManaGainFromWorld?.(pos, owner);
    g.gameState.board[row][col].unit = null;
  }

  const targetPos = g.tileMeshes[row][col].position.clone();
  targetPos.y = g.tileMeshes[row][col].position.y + 0.28;

  g.gsap.to(card.position, {
    x: targetPos.x,
    y: targetPos.y,
    z: targetPos.z,
    duration: 0.5,
    ease: 'power2.inOut'
  });

  g.gsap.to(card.rotation, {
    x: 0,
    y: (g.facingDeg[direction]) * Math.PI / 180,
    z: 0,
    duration: 0.5,
    onComplete: () => {
      g.updateHand?.();
      g.updateUnits?.();
      g.updateUI?.();
      const hitsNow = g.computeHits(g.gameState, row, col);
      if (hitsNow && hitsNow.length) g.performBattleSequence?.(row, col, false);
    }
  });

  g.addLog?.(`${player.name} призывает ${cardData.name} на (${row + 1},${col + 1})`);
  g.__ui?.panels?.hideOrientationPanel?.();
  pendingPlacement = null;
}

export async function initGame() {
  g.gameState = g.startGame(g.STARTER_FIRESET, g.STARTER_FIRESET);
  try { g.window && (g.window.gameState = g.gameState); } catch {}
  g.createBoard?.();
  g.createMetaObjects?.();
  g.updateUnits?.();
  g.updateHand?.();
  g.updateUI?.();
  try {
    if (g.__ui && g.__ui.banner) {
      const b = g.__ui.banner; const t = g.gameState?.turn;
      const fn = (typeof b.ensureTurnSplashVisible === 'function') ? b.ensureTurnSplashVisible : b.forceTurnSplashWithRetry;
      await fn.call(b, 2, t);
    } else {
      await g.forceTurnSplashWithRetry?.(2, g.gameState?.turn);
    }
  } catch {}
  try { if (g.__turnTimerId) clearInterval(g.__turnTimerId); } catch {}
  g.__turnTimerSeconds = 100;
  try {
    const btn = g.document.getElementById('end-turn-btn');
    if (btn) {
      const fill = btn.querySelector('.time-fill');
      const txt = btn.querySelector('.sec-text');
      if (txt) txt.textContent = `${g.__turnTimerSeconds}`;
      if (fill) fill.style.top = `0%`;
    }
  } catch {}
  try {
    if (g.__ui && g.__ui.turnTimer) {
      const tt = g.__ui.turnTimer.attach('end-turn-btn');
      const online = (typeof g.NET_ON === 'function') ? g.NET_ON() : !!g.NET_ACTIVE;
      if (online) { tt.stop(); } else { tt.reset(100).start(); }
    }
  } catch {}
  g.addLog?.('The game has begun! Player 1 goes first.');
  g.addLog?.('Drag units to the field, use spells by clicking.');
}

export async function endTurn() {
  if (!g.gameState || g.gameState.winner !== null) return;
  if (typeof g.isInputLocked === 'function' && g.isInputLocked()) return;
  try {
    if (typeof g.MY_SEAT === 'number') {
      if (g.gameState.active !== g.MY_SEAT) { g.showNotification?.("Opponent's turn", 'error'); return; }
    }
  } catch {}
  if (typeof g.isInputLocked === 'function' ? g.isInputLocked() : (g.manaGainActive || g.drawAnimationActive || g.splashActive)) {
    g.showNotification?.('Wait for animations to complete', 'warning');
    return;
  }
  g.__endTurnInProgress = true;
  try { if (g.__turnTimerId) clearInterval(g.__turnTimerId); } catch {}
  g.__turnTimerSeconds = 100;
  try {
    const btn = g.document.getElementById('end-turn-btn');
    if (btn) {
      const fill = btn.querySelector('.time-fill');
      const txt = btn.querySelector('.sec-text');
      if (txt) txt.textContent = `${g.__turnTimerSeconds}`;
      if (fill) fill.style.top = `0%`;
    }
  } catch {}
  g.__turnTimerId = setInterval(() => {
    if (typeof g.__turnTimerSeconds !== 'number') g.__turnTimerSeconds = 100;
    if (g.__turnTimerSeconds > 0) g.__turnTimerSeconds -= 1;
    try {
      const btn = g.document.getElementById('end-turn-btn');
      if (btn) {
        const fill = btn.querySelector('.time-fill');
        const txt = btn.querySelector('.sec-text');
        const s = Math.max(0, Math.min(100, g.__turnTimerSeconds));
        if (txt) txt.textContent = `${s}`;
        const percent = s / 100;
        if (fill) fill.style.top = `${Math.round((1 - percent) * 100)}%`;
        if (s <= 10) { btn.classList.add('urgent'); } else { btn.classList.remove('urgent'); }
      }
    } catch {}
  }, 1000);

  try {
    g.schedulePush?.('endTurn');
  } catch {}

  g.updateHand?.();
  g.__scene?.interactions?.resetCardSelection?.();
  g.updateHand?.();
  g.updateUnits?.();
  try { await g.forceTurnSplashWithRetry?.(2, g.gameState?.turn); } catch {}

  try { if (g.__turnTimerId) clearInterval(g.__turnTimerId); } catch {}
  g.__turnTimerSeconds = 100;
  try {
    const btn = g.document.getElementById('end-turn-btn');
    if (btn) {
      const fill = btn.querySelector('.time-fill');
      const txt = btn.querySelector('.sec-text');
      if (txt) txt.textContent = `${g.__turnTimerSeconds}`;
      if (fill) fill.style.top = `0%`;
    }
  } catch {}
  g.__turnTimerId = setInterval(() => {
    if (typeof g.__turnTimerSeconds !== 'number') g.__turnTimerSeconds = 100;
    if (g.__turnTimerSeconds > 0) g.__turnTimerSeconds -= 1;
    try {
      const btn = g.document.getElementById('end-turn-btn');
      if (btn) {
        const fill = btn.querySelector('.time-fill');
        const txt = btn.querySelector('.sec-text');
        const s = Math.max(0, Math.min(100, g.__turnTimerSeconds));
        if (txt) txt.textContent = `${s}`;
        const percent = s / 100;
        if (fill) fill.style.top = `${Math.round((1 - percent) * 100)}%`;
        if (s <= 10) { btn.classList.add('urgent'); } else { btn.classList.remove('urgent'); }
      }
    } catch {}
  }, 1000);
  try { if (g.__ui && g.__ui.turnTimer) {
    const tt = g.__ui.turnTimer.attach('end-turn-btn');
    const online = (typeof g.NET_ON === 'function') ? g.NET_ON() : !!g.NET_ACTIVE;
    if (online) { tt.stop(); } else { tt.reset(100).start(); }
  } } catch {}

  const player = g.gameState.players[g.gameState.active];
  const before = player.mana;
  const manaAfter = g.capMana(before + 2);
  const drawnTpl = g.drawOneNoAdd(g.gameState, g.gameState.active);
  try {
    if (!g.PENDING_MANA_ANIM && !g.manaGainActive) {
      g.PENDING_MANA_ANIM = { ownerIndex: g.gameState.active, startIdx: Math.max(0, Math.min(9, before)), endIdx: Math.max(-1, Math.min(9, manaAfter - 1)) };
    }
  } catch {}
  try { if (g.gameState?.players?.[g.gameState.active]) { g.gameState.players[g.gameState.active]._beforeMana = before; } } catch {}
  let shouldAnimateDraw = false;
  try {
    const amIActiveNow = (typeof g.MY_SEAT === 'number') ? (g.MY_SEAT === g.gameState.active) : true;
    shouldAnimateDraw = !!(amIActiveNow && drawnTpl);
    if (!shouldAnimateDraw && drawnTpl) {
      try { g.gameState.players[g.gameState.active].hand.push(drawnTpl); } catch {}
    }
  } catch {}
  g.updateHand?.();
  try { g.schedulePush?.('endTurn-apply', { force: true }); } catch {}

  g.__scene?.interactions?.resetCardSelection?.();
  g.updateHand?.();
  g.updateUnits?.();
  try { await g.forceTurnSplashWithRetry?.(2, g.gameState?.turn); } catch {}
  try { if (g.__turnTimerId) clearInterval(g.__turnTimerId); } catch {}
  g.__turnTimerSeconds = 100;
  try {
    const btn = g.document.getElementById('end-turn-btn');
    if (btn) {
      const fill = btn.querySelector('.time-fill');
      const txt = btn.querySelector('.sec-text');
      if (txt) txt.textContent = `${g.__turnTimerSeconds}`;
      if (fill) fill.style.top = `0%`;
    }
  } catch {}
  g.__turnTimerId = setInterval(() => {
    if (typeof g.__turnTimerSeconds !== 'number') g.__turnTimerSeconds = 100;
    if (g.__turnTimerSeconds > 0) g.__turnTimerSeconds -= 1;
    try {
      const btn = g.document.getElementById('end-turn-btn');
      if (btn) {
        const fill = btn.querySelector('.time-fill');
        const txt = btn.querySelector('.sec-text');
        const s = Math.max(0, Math.min(100, g.__turnTimerSeconds));
        if (txt) txt.textContent = `${s}`;
        const percent = s / 100;
        if (fill) fill.style.top = `${Math.round((1 - percent) * 100)}%`;
        if (s <= 10) { btn.classList.add('urgent'); } else { btn.classList.remove('urgent'); }
      }
    } catch {}
  }, 1000);
  try { if (g.__ui && g.__ui.turnTimer) {
    const tt = g.__ui.turnTimer.attach('end-turn-btn');
    const online = (typeof g.NET_ON === 'function') ? g.NET_ON() : !!g.NET_ACTIVE;
    if (online) { tt.stop(); } else { tt.reset(100).start(); }
  } } catch {}

  try {
    const ctx = g.tileMeshes[pendingPlacement?.row]?.[pendingPlacement?.col];
    if (ctx && shouldAnimateDraw && drawnTpl) {
      g.animateDrawnCardToHand?.(drawnTpl);
    } else if (drawnTpl) {
      try { g.gameState.players[g.gameState.active].hand.push(drawnTpl); } catch {}
    }
  } catch {}

  g.manaGainActive = false;
  g.__endTurnInProgress = false;
  g.updateUI?.();
}

export default { initGame, endTurn, placeUnitWithDirection, startPlacement, cancelPlacement };


// UI action helpers for rotating units, triggering attacks и завершения хода
// Эти функции опираются на существующие глобальные переменные, чтобы минимизировать связность.

export function rotateUnit(unitMesh, dir) {
  try {
    if (!unitMesh || typeof window === 'undefined') return;
    const isInputLocked = window.isInputLocked || (() => false);
    if (isInputLocked()) return;
    const gameState = window.gameState;
    const u = unitMesh.userData?.unitData;
    if (!u || !gameState) return;
    if (u.owner !== gameState.active) {
      window.__ui?.notifications?.show("You can't rotate the other player's unit", 'error');
      return;
    }
    if (u.lastRotateTurn === gameState.turn) {
      window.__ui?.notifications?.show('The unit has already rotated in this turn', 'error');
      return;
    }
    const tpl = window.CARDS?.[u.tplId];
    const cost = typeof window.attackCost === 'function' ? window.attackCost(tpl) : 0;
    if (gameState.players[gameState.active].mana < cost) {
      window.__ui?.notifications?.show(`${cost} mana is required to rotate`, 'error');
      return;
    }
    gameState.players[gameState.active].mana -= cost;
    window.__ui?.updateUI?.(gameState);
    const turnCW = window.turnCW || {}; const turnCCW = window.turnCCW || {};
    u.facing = dir === 'cw' ? turnCW[u.facing] : turnCCW[u.facing];
    u.lastRotateTurn = gameState.turn;
    window.__units?.updateUnits?.(gameState);
    try { window.selectedUnit = null; window.__ui?.panels?.hideUnitActionPanel(); } catch {}
  } catch {}
}

export function performUnitAttack(unitMesh) {
  try {
    if (!unitMesh || typeof window === 'undefined') return;
    const isInputLocked = window.isInputLocked || (() => false);
    if (isInputLocked()) return;
    const gameState = window.gameState;
    const r = unitMesh.userData?.row; const c = unitMesh.userData?.col;
    if (r == null || c == null || !gameState) return;
    const unit = gameState.board?.[r]?.[c]?.unit; if (!unit) return;
    const tpl = window.CARDS?.[unit.tplId];
    const cost = typeof window.attackCost === 'function' ? window.attackCost(tpl) : 0;
    if (tpl?.attackType === 'MAGIC') {
      if (gameState.players[gameState.active].mana < cost) {
        window.__ui?.notifications?.show(`${cost} mana is required to attack`, 'error');
        return;
      }
      gameState.players[gameState.active].mana -= cost;
      window.__ui?.updateUI?.(gameState);
      try { window.selectedUnit = null; window.__ui?.panels?.hideUnitActionPanel(); } catch {}
      window.magicFrom = { r, c };
      window.__ui?.log?.add?.(`${tpl.name}: select a target for the magical attack.`);
      return;
    }
    const computeHits = window.computeHits;
    const hits = typeof computeHits === 'function' ? computeHits(gameState, r, c) : [];
    if (!hits.length) {
      window.__ui?.notifications?.show('No available targets for attack', 'error');
      return;
    }
    if (gameState.players[gameState.active].mana < cost) {
      window.__ui?.notifications?.show(`${cost} mana is required to attack`, 'error');
      return;
    }
    gameState.players[gameState.active].mana -= cost;
    window.__ui?.updateUI?.(gameState);
    try { window.selectedUnit = null; window.__ui?.panels?.hideUnitActionPanel(); } catch {}
    if (typeof window.performBattleSequence === 'function') {
      window.performBattleSequence(r, c, true);
    }
  } catch {}
}

// Полная обработка завершения хода
export async function endTurn() {
  const gameState = window.gameState;
  const isInputLocked = window.isInputLocked || (() => false);
  const showNotification = window.showNotification || (() => {});
  const refreshInputLockUI = window.refreshInputLockUI || (() => {});
  const countControlled = window.countControlled || (() => 0);
  const capMana = window.capMana || (v => v);
  const drawOneNoAdd = window.drawOneNoAdd || (() => null);
  const updateHand = window.updateHand || (() => {});
  const updateUnits = window.updateUnits || (() => {});
  const updateUI = window.updateUI || (() => {});
  const schedulePush = window.schedulePush || (() => {});
  const forceTurnSplashWithRetry = window.forceTurnSplashWithRetry || (async () => {});
  const animateDrawnCardToHand = window.animateDrawnCardToHand || (async () => {});
  const addLog = window.addLog || (() => {});
  const sleep = window.sleep || (ms => new Promise(r => setTimeout(r, ms)));

  try {
    if (!gameState || gameState.winner !== null) return;
    if (isInputLocked()) return;
    try {
      if (typeof window.MY_SEAT === 'number' && gameState.active !== window.MY_SEAT) {
        showNotification("Opponent's turn", 'error');
        return;
      }
    } catch {}

    // Защита от преждевременного завершения хода во время анимаций
    if (typeof isInputLocked === 'function'
      ? isInputLocked()
      : (window.manaGainActive || window.drawAnimationActive || window.splashActive)) {
      showNotification('Wait for animations to complete', 'warning');
      return;
    }

    window.__endTurnInProgress = true;

    // Сброс и запуск таймера хода на 100 секунд
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
          const percent = s / 100; // 1 -> top:0%, 0 -> top:100%
          if (fill) fill.style.top = `${Math.round((1 - percent) * 100)}%`;
          if (s <= 10) { btn.classList.add('urgent'); } else { btn.classList.remove('urgent'); }
        }
      } catch {}
    }, 1000);
    try { if (window.__turnTimerId) { clearInterval(window.__turnTimerId); window.__turnTimerId = null; } } catch {}
    try {
      if (window.__ui && window.__ui.turnTimer) {
        const tt = window.__ui.turnTimer.attach('end-turn-btn');
        const online = (typeof window.NET_ON === 'function') ? window.NET_ON() : !!(typeof window.NET_ACTIVE !== 'undefined' && window.NET_ACTIVE);
        if (online) { tt.stop(); } else { tt.reset(100).start(); }
      }
    } catch {}

    // Online: delegate authoritative turn advance to the server
    try {
      const online = (typeof window.NET_ON === 'function') ? window.NET_ON() : !!(typeof window.NET_ACTIVE !== 'undefined' && window.NET_ACTIVE);
      if (online) {
        try { window.socket?.emit('endTurn'); } catch {}
        refreshInputLockUI();
        return;
      }
    } catch {}

    const controlledCells = countControlled(gameState, gameState.active);
    if (controlledCells >= 5) {
      gameState.winner = gameState.active;
      showNotification(`${gameState.players[gameState.active].name} побеждает!`, 'success');
      return;
    }

    // Очистить временные бафы, действующие «до конца хода кастера»
    try {
      for (let rr = 0; rr < 3; rr++) for (let cc = 0; cc < 3; cc++) {
        const u = gameState.board[rr][cc].unit; if (!u) continue;
        if (typeof u.tempAtkBuff === 'number' && u.tempBuffOwner === gameState.active) {
          delete u.tempAtkBuff; delete u.tempBuffOwner;
        }
      }
    } catch {}
    gameState.active = gameState.active === 0 ? 1 : 0;
    gameState.turn += 1;

    // Показ заставки хода перед начислением маны и добором карты
    try {
      if (window.__ui && window.__ui.banner) {
        const b = window.__ui.banner;
        if (typeof b.ensureTurnSplashVisible === 'function') {
          await b.ensureTurnSplashVisible(3, gameState.turn);
        } else if (typeof b.forceTurnSplashWithRetry === 'function') {
          await b.forceTurnSplashWithRetry(3, gameState.turn);
        }
      } else {
        await forceTurnSplashWithRetry(3, gameState.turn);
      }
    } catch {}

    const player = gameState.players[gameState.active];
    const before = player.mana;
    const manaAfter = capMana(before + 2);
    const drawnTpl = drawOneNoAdd(gameState, gameState.active);

    // Заблокировать преждевременное появление новых орбов до анимации вспышки
    try {
      if (!window.PENDING_MANA_ANIM && !window.manaGainActive) {
        window.PENDING_MANA_ANIM = { ownerIndex: gameState.active, startIdx: Math.max(0, Math.min(9, before)), endIdx: Math.max(-1, Math.min(9, manaAfter - 1)) };
      }
    } catch {}
    try { if (window.gameState?.players?.[gameState.active]) { window.gameState.players[gameState.active]._beforeMana = before; } } catch {}

    let shouldAnimateDraw = false;
    try {
      const amIActiveNow = (typeof window.MY_SEAT === 'number') ? (window.MY_SEAT === gameState.active) : true;
      shouldAnimateDraw = !!(amIActiveNow && drawnTpl);
      if (!shouldAnimateDraw && drawnTpl) {
        try { gameState.players[gameState.active].hand.push(drawnTpl); } catch {}
      }
    } catch {}
    updateHand();

    try { schedulePush('endTurn-apply', { force: true }); } catch {}

    window.__interactions?.resetCardSelection();

    updateHand();
    updateUnits();
    try { await forceTurnSplashWithRetry(2, gameState?.turn); } catch {}

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
        const online = (typeof window.NET_ON === 'function') ? window.NET_ON() : !!(typeof window.NET_ACTIVE !== 'undefined' && window.NET_ACTIVE);
        if (online) { tt.stop(); } else { tt.reset(100).start(); }
      }
    } catch {}
    try {
      if (window.__ui && window.__ui.mana && typeof window.__ui.mana.animateTurnManaGain === 'function') {
        await window.__ui.mana.animateTurnManaGain(gameState.active, before, manaAfter, 1500);
      } else {
        console.warn('Module mana animation not available, skipping');
      }
      player.mana = manaAfter;
    } catch {}

    await sleep(80);
    updateUI();
    try {
      if (shouldAnimateDraw && drawnTpl) {
        window.pendingDrawCount = 1; updateHand();
        refreshInputLockUI();
        await animateDrawnCardToHand(drawnTpl);
        try { gameState.players[gameState.active].hand.push(drawnTpl); } catch {}
        window.pendingDrawCount = 0; updateHand();
      }
    } catch { window.pendingDrawCount = 0; }

    addLog(`Ход ${gameState.turn}. ${player.name} получает +2 маны и добирает карту.`);

    window.__endTurnInProgress = false;
    window.manaGainActive = false;
    refreshInputLockUI();
  } catch {}
}

const api = { rotateUnit, performUnitAttack, endTurn };
try {
  if (typeof window !== 'undefined') {
    window.__ui = window.__ui || {};
    window.__ui.actions = api;
    window.endTurn = endTurn;
  }
} catch {}
export default api;

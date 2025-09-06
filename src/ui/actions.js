// UI action helpers for rotating units and triggering attacks
// These functions rely on existing globals to minimize coupling.

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
  try {
    const gameState = window.gameState;
    if (!gameState || gameState.winner !== null) return;
    const isInputLocked = window.isInputLocked || (() => false);
    if (isInputLocked()) return;
    // Онлайн-гейт: не позволяем завершить ход, если сейчас не ваш ход
    try {
      if (typeof window.MY_SEAT === 'number' && gameState.active !== window.MY_SEAT) {
        window.__ui?.notifications?.show("Opponent's turn", 'error');
        return;
      }
    } catch {}

    // Защита от преждевременного завершения хода во время анимаций
    if ((typeof window.isInputLocked === 'function' && window.isInputLocked()) ||
        window.manaGainActive || window.drawAnimationActive || window.splashActive) {
      window.__ui?.notifications?.show('Wait for animations to complete', 'warning');
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
          // Пульсация рамки в последние 10 секунд
          if (s <= 10) { btn.classList.add('urgent'); } else { btn.classList.remove('urgent'); }
        }
      } catch {}
    }, 1000);
    try { if (window.__turnTimerId) { clearInterval(window.__turnTimerId); window.__turnTimerId = null; } } catch {}
    try {
      const tt = window.__ui?.turnTimer?.attach?.('end-turn-btn');
      const online = (typeof window.NET_ON === 'function') ? window.NET_ON() : !!window.NET_ACTIVE;
      if (tt) { online ? tt.stop() : tt.reset(100).start(); }
    } catch {}

    // Online: delegate authoritative turn advance to the server
    try {
      const online = (typeof window.NET_ON === 'function') ? window.NET_ON() : !!window.NET_ACTIVE;
      if (online) {
        try { window.socket && window.socket.emit('endTurn'); } catch {}
        window.refreshInputLockUI && window.refreshInputLockUI();
        return;
      }
    } catch {}

    const controlledCells = window.countControlled ? window.countControlled(gameState, gameState.active) : 0;
    if (controlledCells >= 5) {
      gameState.winner = gameState.active;
      window.__ui?.notifications?.show(`${gameState.players[gameState.active].name} побеждает!`, 'success');
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

    // Show start-of-turn splash reliably in offline mode before mana/draw
    try {
      const b = window.__ui?.banner;
      if (b?.ensureTurnSplashVisible) {
        await b.ensureTurnSplashVisible(3, gameState.turn);
      } else if (b?.forceTurnSplashWithRetry) {
        await b.forceTurnSplashWithRetry(3, gameState.turn);
      } else if (typeof window.forceTurnSplashWithRetry === 'function') {
        await window.forceTurnSplashWithRetry(3, gameState.turn);
      }
    } catch {}

    const player = gameState.players[gameState.active];
    const before = player.mana;
    const manaAfter = window.capMana ? window.capMana(before + 2) : before + 2;
    // Карта для анимации: извлекаем
    const drawnTpl = window.drawOneNoAdd ? window.drawOneNoAdd(gameState, gameState.active) : null;

    // ВАЖНО: НЕ применяем ману к gameState до анимации - это предотвратит появление орбов до вспышки
    // Заблокировать преждевременное появление новых орбов до анимации вспышки
    try {
      if (!window.PENDING_MANA_ANIM && !window.manaGainActive) {
        window.PENDING_MANA_ANIM = { ownerIndex: gameState.active, startIdx: Math.max(0, Math.min(9, before)), endIdx: Math.max(-1, Math.min(9, manaAfter - 1)) };
      }
    } catch {}
    // Clamp UI to beforeMana until animation completes
    try { if (window.gameState?.players?.[gameState.active]) { window.gameState.players[gameState.active]._beforeMana = before; } } catch {}
    let shouldAnimateDraw = false;
    try {
      const amIActiveNow = (typeof window.MY_SEAT === 'number') ? (window.MY_SEAT === gameState.active) : true;
      shouldAnimateDraw = !!(amIActiveNow && drawnTpl);
      if (!shouldAnimateDraw && drawnTpl) {
        gameState.players[gameState.active].hand.push(drawnTpl);
      }
    } catch {}
    window.updateHand && window.updateHand();
    // Offline: locally apply state, online path returned earlier
    try { window.schedulePush && window.schedulePush('endTurn-apply', { force: true }); } catch {}

    window.__interactions?.resetCardSelection?.();

    window.updateHand && window.updateHand();
    window.updateUnits && window.updateUnits();
    // updateUI выполнится вместе с анимацией маны (после заставки)
    // Показ заставки хода: строго блокирующе (визуальная последовательность)
    try {
      const b = window.__ui?.banner;
      if (b?.forceTurnSplashWithRetry) {
        await b.forceTurnSplashWithRetry(2, gameState?.turn);
      } else if (typeof window.forceTurnSplashWithRetry === 'function') {
        await window.forceTurnSplashWithRetry(2, gameState?.turn);
      }
    } catch {}
    // Перезапустить таймер хода на 100 сек после заставки (анимация таймера локально у обоих)
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
    // Эффектная анимация маны: показываем у обоих игроков, но для активного — анимируем его панель
    try { if (window.__turnTimerId) { clearInterval(window.__turnTimerId); window.__turnTimerId = null; } } catch {}
    try {
      const tt = window.__ui?.turnTimer?.attach?.('end-turn-btn');
      const online = (typeof window.NET_ON === 'function') ? window.NET_ON() : !!window.NET_ACTIVE;
      if (tt) { online ? tt.stop() : tt.reset(100).start(); }
    } catch {}
    try {
      if (window.__ui?.mana?.animateTurnManaGain) {
        await window.__ui.mana.animateTurnManaGain(gameState.active, before, manaAfter, 1500);
      }
      // Применяем ману ПОСЛЕ анимации вспышки
      player.mana = manaAfter;
    } catch {}
    // Минимальная задержка (<0.1с) перед началом проявления большой карты
    const sleepFn = window.sleep || (ms => new Promise(r => setTimeout(r, ms)));
    await sleepFn(80);
    // ВИЗУАЛ: локально проигрываем анимации добора ТОЛЬКО если это наш клиент
    window.updateUI && window.updateUI();
    try {
      if (shouldAnimateDraw && drawnTpl) {
        // Скрываем «задержанную» карту из руки, пока идёт полёт
        window.pendingDrawCount = 1; window.updateHand && window.updateHand();
        window.refreshInputLockUI && window.refreshInputLockUI();
        await (window.animateDrawnCardToHand ? window.animateDrawnCardToHand(drawnTpl) : Promise.resolve());
        // После полёта добавляем карту в руку и показываем её
        gameState.players[gameState.active].hand.push(drawnTpl);
        window.pendingDrawCount = 0; window.updateHand && window.updateHand();
      }
    } catch { window.pendingDrawCount = 0; }

    window.__ui?.log?.add && window.__ui.log.add(`Ход ${gameState.turn}. ${player.name} получает +2 маны и добирает карту.`);

    // Гарантированная разблокировка ввода
    window.__endTurnInProgress = false;
    window.manaGainActive = false;
    window.refreshInputLockUI && window.refreshInputLockUI();
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

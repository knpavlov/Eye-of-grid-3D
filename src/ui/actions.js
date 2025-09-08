// UI action helpers for rotating units and triggering attacks
// These functions rely on existing globals to minimize coupling.
import { highlightTiles, clearHighlights } from '../scene/highlight.js';

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
    const iState = window.__interactions?.interactionState;
    if (tpl?.attackType === 'MAGIC') {
      if (gameState.players[gameState.active].mana < cost) {
        window.__ui?.notifications?.show(`${cost} mana is required to attack`, 'error');
        return;
      }
      gameState.players[gameState.active].mana -= cost;
      window.__ui?.updateUI?.(gameState);
      try { window.selectedUnit = null; window.__ui?.panels?.hideUnitActionPanel(); } catch {}
      if (iState) {
        iState.magicFrom = { r, c };
        const hits = typeof window.computeHits === 'function' ? window.computeHits(gameState, r, c) : [];
        highlightTiles(hits);
      }
      window.__ui?.log?.add?.(`${tpl.name}: select a target for the magical attack.`);
      return;
    }
    const computeHits = window.computeHits;
    const attacks = tpl?.attacks || [];
    const needsChoice = tpl?.chooseDir || attacks.some(a => a.mode === 'ANY');
    const hitsAll = typeof computeHits === 'function' ? computeHits(gameState, r, c, { union: true }) : [];
    const hasEnemy = hitsAll.some(h => gameState.board?.[h.r]?.[h.c]?.unit?.owner !== unit.owner);
    if (!hitsAll.length || !hasEnemy) {
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
    if (needsChoice && hitsAll.length > 1) {
      if (iState) iState.pendingAttack = { r, c };
      highlightTiles(hitsAll);
      window.__ui?.log?.add?.(`${tpl.name}: выберите цель для атаки.`);
      window.__ui?.notifications?.show('Выберите цель', 'info');
      return;
    }
    // если выбор не нужен или доступна единственная цель, атакуем сразу
    let opts = {};
    if (needsChoice && hitsAll.length === 1) {
      const h = hitsAll[0];
      const dr = h.r - r, dc = h.c - c;
      const absDir = dr < 0 ? 'N' : dr > 0 ? 'S' : dc > 0 ? 'E' : 'W';
      const ORDER = ['N', 'E', 'S', 'W'];
      const relDir = ORDER[(ORDER.indexOf(absDir) - ORDER.indexOf(unit.facing) + 4) % 4];
      const dist = Math.max(Math.abs(dr), Math.abs(dc));
      opts = { chosenDir: relDir, rangeChoices: { [relDir]: dist } };
    }
    if (typeof window.performBattleSequence === 'function') {
      window.performBattleSequence(r, c, true, opts);
    }
  } catch {}
}

// Полная обработка завершения хода
export async function endTurn() {
  try {
    if (typeof window === 'undefined') return;
    const w = window;
    const gameState = w.gameState;
    if (!gameState || gameState.winner !== null) return;
    const isInputLocked = w.isInputLocked || (() => false);
    if (isInputLocked()) return;
    try {
      if (typeof w.MY_SEAT === 'number' && gameState.active !== w.MY_SEAT) {
        w.showNotification?.("Opponent's turn", 'error');
        return;
      }
    } catch {}
    const manaGainActive = w.manaGainActive || false;
    const drawAnimationActive = w.drawAnimationActive || false;
    const splashActive = (w.__ui && w.__ui.banner)
      ? !!w.__ui.banner.getState()._splashActive
      : !!w.splashActive;
    if (isInputLocked() || manaGainActive || drawAnimationActive || splashActive) {
      w.showNotification?.('Wait for animations to complete', 'warning');
      return;
    }

    w.__endTurnInProgress = true;
    try { if (w.__turnTimerId) clearInterval(w.__turnTimerId); } catch {}
    w.__turnTimerSeconds = 100;
    (function syncBtn(){ try {
      const btn = document.getElementById('end-turn-btn');
      if (btn) {
        const fill = btn.querySelector('.time-fill');
        const txt = btn.querySelector('.sec-text');
        if (txt) txt.textContent = `${w.__turnTimerSeconds}`;
        if (fill) fill.style.top = `0%`;
      }
    } catch {} })();
    w.__turnTimerId = setInterval(() => {
      if (typeof w.__turnTimerSeconds !== 'number') w.__turnTimerSeconds = 100;
      if (w.__turnTimerSeconds > 0) w.__turnTimerSeconds -= 1;
      try {
        const btn = document.getElementById('end-turn-btn');
        if (btn) {
          const fill = btn.querySelector('.time-fill');
          const txt = btn.querySelector('.sec-text');
          const s = Math.max(0, Math.min(100, w.__turnTimerSeconds));
          if (txt) txt.textContent = `${s}`;
          const percent = s / 100;
          if (fill) fill.style.top = `${Math.round((1 - percent) * 100)}%`;
          if (s <= 10) { btn.classList.add('urgent'); } else { btn.classList.remove('urgent'); }
        }
      } catch {}
    }, 1000);
    try { if (w.__turnTimerId) { clearInterval(w.__turnTimerId); w.__turnTimerId = null; } } catch {}
    try {
      if (w.__ui && w.__ui.turnTimer) {
        const tt = w.__ui.turnTimer.attach('end-turn-btn');
        const online = (typeof w.NET_ON === 'function') ? w.NET_ON() : !!w.NET_ACTIVE;
        if (online) { tt.stop(); } else { tt.reset(100).start(); }
      }
    } catch {}

    try {
      const online = (typeof w.NET_ON === 'function') ? w.NET_ON() : !!w.NET_ACTIVE;
      if (online) {
        try { (w.socket || socket).emit('endTurn'); } catch {}
        w.refreshInputLockUI?.();
        return;
      }
    } catch {}

    const controlledCells = typeof w.countControlled === 'function'
      ? w.countControlled(gameState, gameState.active)
      : 0;
    if (controlledCells >= 5) {
      gameState.winner = gameState.active;
      w.showNotification?.(`${gameState.players[gameState.active].name} побеждает!`, 'success');
      return;
    }

    try {
      for (let rr = 0; rr < 3; rr++) for (let cc = 0; cc < 3; cc++) {
        const u = gameState.board?.[rr]?.[cc]?.unit; if (!u) continue;
        if (typeof u.tempAtkBuff === 'number' && u.tempBuffOwner === gameState.active) {
          delete u.tempAtkBuff; delete u.tempBuffOwner;
        }
      }
    } catch {}
    gameState.active = gameState.active === 0 ? 1 : 0;
    gameState.turn += 1;

    try {
      if (w.__ui && w.__ui.banner) {
        const b = w.__ui.banner;
        if (typeof b.ensureTurnSplashVisible === 'function') {
          await b.ensureTurnSplashVisible(3, gameState.turn);
        } else if (typeof b.forceTurnSplashWithRetry === 'function') {
          await b.forceTurnSplashWithRetry(3, gameState.turn);
        }
      } else if (typeof w.forceTurnSplashWithRetry === 'function') {
        await w.forceTurnSplashWithRetry(3);
      }
    } catch {}

    const player = gameState.players[gameState.active];
    const before = player.mana;
    const manaAfter = (typeof w.capMana === 'function') ? w.capMana(before + 2) : before + 2;
    const drawnTpl = (typeof w.drawOneNoAdd === 'function')
      ? w.drawOneNoAdd(gameState, gameState.active)
      : null;

    try {
      if (!w.PENDING_MANA_ANIM && !manaGainActive) {
        w.PENDING_MANA_ANIM = { ownerIndex: gameState.active, startIdx: Math.max(0, Math.min(9, before)), endIdx: Math.max(-1, Math.min(9, manaAfter - 1)) };
      }
    } catch {}
    try { if (w.gameState && w.gameState.players && w.gameState.players[gameState.active]) { w.gameState.players[gameState.active]._beforeMana = before; } } catch {}
    let shouldAnimateDraw = false;
    try {
      const amIActiveNow = (typeof w.MY_SEAT === 'number') ? (w.MY_SEAT === gameState.active) : true;
      shouldAnimateDraw = !!(amIActiveNow && drawnTpl);
      if (!shouldAnimateDraw && drawnTpl) {
        try { gameState.players[gameState.active].hand.push(drawnTpl); } catch {}
      }
    } catch {}
    w.pendingDrawCount = shouldAnimateDraw ? 1 : 0;
    w.updateHand?.();
    try { w.schedulePush?.('endTurn-apply', { force: true }); } catch {}

    try { w.__interactions?.resetCardSelection?.(); } catch {}

    w.updateHand?.();
    w.updateUnits?.();
    try { await w.forceTurnSplashWithRetry?.(2, gameState?.turn); } catch {}
    try { if (w.__turnTimerId) clearInterval(w.__turnTimerId); } catch {}
    w.__turnTimerSeconds = 100;
    (function syncBtn(){ try {
      const btn = document.getElementById('end-turn-btn');
      if (btn) {
        const fill = btn.querySelector('.time-fill');
        const txt = btn.querySelector('.sec-text');
        if (txt) txt.textContent = `${w.__turnTimerSeconds}`;
        if (fill) fill.style.top = `0%`;
      }
    } catch {} })();
    w.__turnTimerId = setInterval(() => {
      if (typeof w.__turnTimerSeconds !== 'number') w.__turnTimerSeconds = 100;
      if (w.__turnTimerSeconds > 0) w.__turnTimerSeconds -= 1;
      try {
        const btn = document.getElementById('end-turn-btn');
        if (btn) {
          const fill = btn.querySelector('.time-fill');
          const txt = btn.querySelector('.sec-text');
          const s = Math.max(0, Math.min(100, w.__turnTimerSeconds));
          if (txt) txt.textContent = `${s}`;
          const percent = s / 100;
          if (fill) fill.style.top = `${Math.round((1 - percent) * 100)}%`;
          if (s <= 10) { btn.classList.add('urgent'); } else { btn.classList.remove('urgent'); }
        }
      } catch {}
    }, 1000);
    try { if (w.__turnTimerId) { clearInterval(w.__turnTimerId); w.__turnTimerId = null; } } catch {}
    try {
      if (w.__ui && w.__ui.turnTimer) {
        const tt = w.__ui.turnTimer.attach('end-turn-btn');
        const online = (typeof w.NET_ON === 'function') ? w.NET_ON() : !!w.NET_ACTIVE;
        if (online) { tt.stop(); } else { tt.reset(100).start(); }
      }
    } catch {}
    try {
      if (w.__ui && w.__ui.mana && typeof w.__ui.mana.animateTurnManaGain === 'function') {
        await w.__ui.mana.animateTurnManaGain(gameState.active, before, manaAfter, 1500);
      } else {
        console.warn('Module mana animation not available, skipping');
      }
      player.mana = manaAfter;
    } catch {}
    await w.sleep?.(80);
    w.updateUI?.();
    try {
      if (shouldAnimateDraw && drawnTpl) {
        w.refreshInputLockUI?.();
        await w.animateDrawnCardToHand?.(drawnTpl);
        try { gameState.players[gameState.active].hand.push(drawnTpl); } catch {}
        w.pendingDrawCount = 0; w.updateHand?.();
      }
    } catch { w.pendingDrawCount = 0; }

    w.addLog?.(`Ход ${gameState.turn}. ${player.name} получает +2 маны и добирает карту.`);

    w.__endTurnInProgress = false;
    w.manaGainActive = false;
    w.refreshInputLockUI?.();
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


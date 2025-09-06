import { STARTER_FIRESET, CARDS } from '../core/cards.js';
import { startGame, drawOneNoAdd, countControlled } from '../core/state.js';
import { uid, capMana, facingDeg } from '../core/constants.js';
import { computeCellBuff, computeHits } from '../core/rules.js';
import { updateHand, animateDrawnCardToHand } from '../scene/hand.js';
import { updateUnits } from '../scene/units.js';
import { createBoard } from '../scene/board.js';
import { preloadCardTextures } from '../scene/cards.js';
import { updateUI } from './update.js';
import { add as addLog } from './log.js';
import { show as showNotification } from './notifications.js';
import * as UIPanels from './panels.js';
import { animateManaGainFromWorld } from './mana.js';
import { getCtx } from '../scene/context.js';

// Глобальное состояние игры (экспортируется для совместимости)
let gameState = null;
let pendingPlacement = null; // { card, row, col, handIndex }
let manaGainActive = false;
let PENDING_MANA_ANIM = null; // { ownerIndex, startIdx, endIdx }
let PENDING_MANA_BLOCK = [0,0];
let pendingRitualSpellHandIndex = null;
let pendingRitualSpellCard = null;
let pendingRitualBoardMesh = null;
let pendingDrawCount = 0;

try {
  if (typeof window !== 'undefined') {
    Object.defineProperties(window, {
      gameState: { get: () => gameState, set: v => { gameState = v; } },
      pendingPlacement: { get: () => pendingPlacement, set: v => { pendingPlacement = v; } },
      manaGainActive: { get: () => manaGainActive, set: v => { manaGainActive = v; } },
      PENDING_MANA_ANIM: { get: () => PENDING_MANA_ANIM, set: v => { PENDING_MANA_ANIM = v; } },
      PENDING_MANA_BLOCK: { get: () => PENDING_MANA_BLOCK, set: v => { PENDING_MANA_BLOCK = v; } },
      pendingRitualSpellHandIndex: { get: () => pendingRitualSpellHandIndex, set: v => { pendingRitualSpellHandIndex = v; } },
      pendingRitualSpellCard: { get: () => pendingRitualSpellCard, set: v => { pendingRitualSpellCard = v; } },
      pendingRitualBoardMesh: { get: () => pendingRitualBoardMesh, set: v => { pendingRitualBoardMesh = v; } },
      pendingDrawCount: { get: () => pendingDrawCount, set: v => { pendingDrawCount = v; } },
    });
  }
} catch {}

// Инициализация новой игры
export async function initGame() {
  gameState = startGame(STARTER_FIRESET, STARTER_FIRESET);
  try { window.gameState = gameState; } catch {}
  try { preloadCardTextures(); } catch {}
  createBoard(gameState);
  try {
    const ctx = getCtx();
    window.tileMeshes = ctx.tileMeshes;
    window.tileFrames = ctx.tileFrames;
  } catch {}
  window.__scene?.interactions?.createMetaObjects(gameState);
  updateUnits(gameState);
  updateHand(gameState);
  try { window.handCardMeshes = getCtx().handCardMeshes; } catch {}
  updateUI(gameState);
  try {
    if (window.__ui && window.__ui.banner) {
      const b = window.__ui.banner; const t = gameState?.turn;
      const fn = (typeof b.ensureTurnSplashVisible === 'function') ? b.ensureTurnSplashVisible : b.forceTurnSplashWithRetry;
      await fn.call(b, 2, t);
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
      const online = (typeof window.NET_ON === 'function') ? window.NET_ON() : !!(typeof window.NET_ACTIVE !== 'undefined' && window.NET_ACTIVE);
      if (online) { tt.stop(); } else { tt.reset(100).start(); }
    }
  } catch {}
  addLog('The game has begun! Player 1 goes first.');
  addLog('Drag units to the field, use spells by clicking.');
}

// Установка отложенного размещения существа
export function setPendingPlacement(data) { pendingPlacement = data; }
export function getPendingPlacement() { return pendingPlacement; }

export function cancelPendingPlacement() {
  if (pendingPlacement) {
    window.__scene?.interactions?.returnCardToHand(pendingPlacement.card);
  }
  UIPanels.hideOrientationPanel();
  pendingPlacement = null;
}

// Размещение существа после выбора направления
export function placeUnitWithDirection(direction) {
  if (!pendingPlacement) return;
  const { card, row, col, handIndex } = pendingPlacement;
  const cardData = card.userData.cardData;
  const player = gameState.players[gameState.active];
  if (cardData.cost > player.mana) {
    showNotification('Insufficient mana!', 'error');
    window.__scene?.interactions?.returnCardToHand(card);
    UIPanels.hideOrientationPanel();
    pendingPlacement = null;
    return;
  }
  const unit = {
    uid: uid(),
    owner: gameState.active,
    tplId: cardData.id,
    currentHP: cardData.hp,
    facing: direction,
  };
  gameState.board[row][col].unit = unit;
  player.mana -= cardData.cost;
  player.discard.push(cardData);
  player.hand.splice(handIndex, 1);
  const cellElement = gameState.board[row][col].element;
  const buff = computeCellBuff(cellElement, cardData.element);
  if (buff.hp !== 0) {
    const before = unit.currentHP;
    unit.currentHP = Math.max(0, unit.currentHP + buff.hp);
    if (buff.hp > 0) {
      addLog(`Элемент усиливает ${cardData.name}: HP ${before}→${unit.currentHP}`);
    } else {
      addLog(`Элемент ослабляет ${cardData.name}: HP ${before}→${unit.currentHP}`);
    }
  }
  if (unit.currentHP <= 0) {
    addLog(`${cardData.name} погибает от неблагоприятной стихии!`);
    const owner = unit.owner;
    try { gameState.players[owner].graveyard.push(CARDS[unit.tplId]); } catch {}
    const pos = getCtx().tileMeshes[row][col].position.clone().add(new (getCtx().THREE).Vector3(0, 1.2, 0));
    animateManaGainFromWorld(pos, owner);
    gameState.board[row][col].unit = null;
  }
  const targetPos = getCtx().tileMeshes[row][col].position.clone();
  targetPos.y = getCtx().tileMeshes[row][col].position.y + 0.28;
  const gsap = window.gsap;
  gsap.to(card.position, {
    x: targetPos.x,
    y: targetPos.y,
    z: targetPos.z,
    duration: 0.5,
    ease: 'power2.inOut'
  });
  gsap.to(card.rotation, {
    x: 0,
    y: (facingDeg[direction]) * Math.PI / 180,
    z: 0,
    duration: 0.5,
    onComplete: () => {
      updateHand(gameState);
      updateUnits(gameState);
      updateUI(gameState);
      const hitsNow = computeHits(gameState, row, col);
      if (hitsNow && hitsNow.length) window.performBattleSequence?.(row, col, false);
    }
  });
  addLog(`${player.name} призывает ${cardData.name} на (${row + 1},${col + 1})`);
  UIPanels.hideOrientationPanel();
  pendingPlacement = null;
}

// Завершение хода
export async function endTurn() {
  if (!gameState || gameState.winner !== null) return;
  if (window.isInputLocked && window.isInputLocked()) return;
  try {
    if (typeof window !== 'undefined' && typeof window.MY_SEAT === 'number') {
      if (gameState.active !== window.MY_SEAT) { showNotification("Opponent's turn", 'error'); return; }
    }
  } catch {}
  if (window.isInputLocked ? window.isInputLocked() : (manaGainActive || window.drawAnimationActive || window.splashActive)) {
    showNotification('Wait for animations to complete', 'warning');
    return;
  }
  window.__netState.__endTurnInProgress = true;
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
      const online = (typeof window.NET_ON === 'function') ? window.NET_ON() : !!(typeof window.NET_ACTIVE !== 'undefined' && window.NET_ACTIVE);
      if (online) { tt.stop(); } else { tt.reset(100).start(); }
    }
  } catch {}
  try {
    const online = (typeof window.NET_ON === 'function') ? window.NET_ON() : !!(typeof window.NET_ACTIVE !== 'undefined' && window.NET_ACTIVE);
    if (online) {
      try { (window.socket || window.socket)?.emit('endTurn'); } catch {}
      window.refreshInputLockUI?.();
      return;
    }
  } catch {}
  const controlledCells = countControlled(gameState, gameState.active);
  if (controlledCells >= 5) {
    gameState.winner = gameState.active;
    showNotification(`${gameState.players[gameState.active].name} побеждает!`, 'success');
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
  gameState.active = gameState.active === 0 ? 1 : 0;
  gameState.turn += 1;
  try {
    if (window.__ui && window.__ui.banner) {
      const b = window.__ui.banner;
      if (typeof b.ensureTurnSplashVisible === 'function') {
        await b.ensureTurnSplashVisible(3, gameState.turn);
      } else if (typeof b.forceTurnSplashWithRetry === 'function') {
        await b.forceTurnSplashWithRetry(3, gameState.turn);
      }
    } else if (window.forceTurnSplashWithRetry) {
      await window.forceTurnSplashWithRetry(3);
    }
  } catch {}
  const player = gameState.players[gameState.active];
  const before = player.mana;
  const manaAfter = capMana(before + 2);
  const drawnTpl = drawOneNoAdd(gameState, gameState.active);
  try {
    if (!PENDING_MANA_ANIM && !manaGainActive) {
      PENDING_MANA_ANIM = { ownerIndex: gameState.active, startIdx: Math.max(0, Math.min(9, before)), endIdx: Math.max(-1, Math.min(9, manaAfter - 1)) };
    }
  } catch {}
  try { if (window.gameState && window.gameState.players && window.gameState.players[gameState.active]) { window.gameState.players[gameState.active]._beforeMana = before; } } catch {}
  let shouldAnimateDraw = false;
  try {
    const amIActiveNow = (typeof window !== 'undefined' && typeof window.MY_SEAT === 'number') ? (window.MY_SEAT === gameState.active) : true;
    shouldAnimateDraw = !!(amIActiveNow && drawnTpl);
    if (!shouldAnimateDraw && drawnTpl) {
      try { gameState.players[gameState.active].hand.push(drawnTpl); } catch {}
    }
  } catch {}
  updateHand(gameState);
  try { window.schedulePush?.('endTurn-apply', { force: true }); } catch {}
  window.__scene?.interactions?.resetCardSelection();
  updateHand(gameState);
  updateUnits(gameState);
  try { await window.forceTurnSplashWithRetry?.(2, gameState?.turn); } catch {}
  try { if (window.__turnTimerId) clearInterval(window.__turnTimerId); } catch {}
  window.__turnTimerSeconds = 100;
  (function syncBtn2(){ try {
    const btn = document.getElementById('end-turn-btn');
    if (btn) {
      const fill = btn.querySelector('.time-fill');
      const txt = btn.querySelector('.sec-text');
      if (txt) txt.textContent = `${window.__turnTimerSeconds}`;
      if (fill) fill.style.top = `0%`;
    }
  } catch {} })();
  const online2 = (typeof window.NET_ON === 'function') ? window.NET_ON() : !!(typeof window.NET_ACTIVE !== 'undefined' && window.NET_ACTIVE);
  try {
    if (window.__ui && window.__ui.turnTimer) {
      const tt = window.__ui.turnTimer.attach('end-turn-btn');
      if (online2) { tt.stop(); } else { tt.reset(100).start(); }
    }
  } catch {}
  try {
    manaGainActive = true;
    player.mana = manaAfter;
  } catch {}
  await new Promise(r => setTimeout(r, 80));
  updateUI(gameState);
  try {
    if (shouldAnimateDraw && drawnTpl) {
      pendingDrawCount = 1; updateHand(gameState);
      window.refreshInputLockUI?.();
      await animateDrawnCardToHand(drawnTpl);
      try { gameState.players[gameState.active].hand.push(drawnTpl); } catch {}
      pendingDrawCount = 0; updateHand(gameState);
    }
  } catch { pendingDrawCount = 0; }
  addLog(`Ход ${gameState.turn}. ${player.name} получает +2 маны и добирает карту.`);
  window.__netState.__endTurnInProgress = false;
  manaGainActive = false;
  window.refreshInputLockUI?.();
}

const api = { initGame, endTurn, placeUnitWithDirection, cancelPendingPlacement, setPendingPlacement, getPendingPlacement };
try { if (typeof window !== 'undefined') { window.__ui = window.__ui || {}; window.__ui.game = api; } } catch {}
export default api;

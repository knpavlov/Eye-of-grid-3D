// Game lifecycle actions extracted from index.html
// Provides initialization, turn handling and unit placement helpers

// UI state previously global
let selectedCard = null;
let pendingPlacement = null; // { card, row, col, handIndex }
let selectedUnit = null;
let magicFrom = null; // { r, c }
let pendingSpellOrientation = null; // { spellCardMesh, unitMesh }
let pendingDiscardSelection = null; // { requiredType, onPicked }
let pendingRitualBoardMesh = null;
let spellDragHandled = false;

// Cancel currently selected card and restore its visuals.
export function resetCardSelection() {
  if (selectedCard) {
    try { window.__scene?.interactions.returnCardToHand(selectedCard); } catch {}
    try { selectedCard.material[2].emissive = new THREE.Color(0x000000); selectedCard.material[2].emissiveIntensity = 0; } catch {}
    selectedCard = null;
  }
}

// Resolve unit card placement on board after choosing orientation.
export function placeUnitWithDirection(direction) {
  if (!pendingPlacement) return;
  const { card, row, col, handIndex } = pendingPlacement;
  const cardData = card.userData.cardData;
  const player = window.gameState.players[window.gameState.active];

  if (cardData.cost > player.mana) {
    try { window.showNotification('Insufficient mana!', 'error'); } catch {}
    try { window.__scene?.interactions.returnCardToHand(card); } catch {}
    window.__ui?.panels.hideOrientationPanel();
    pendingPlacement = null;
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
      window.addLog(`Элемент усиливает ${cardData.name}: HP ${before}→${unit.currentHP}`);
    } else {
      window.addLog(`Элемент ослабляет ${cardData.name}: HP ${before}→${unit.currentHP}`);
    }
  }

  if (unit.currentHP <= 0) {
    window.addLog(`${cardData.name} погибает от неблагоприятной стихии!`);
    const owner = unit.owner;
    try { window.gameState.players[owner].graveyard.push(window.CARDS[unit.tplId]); } catch {}
    const pos = window.tileMeshes[row][col].position.clone().add(new THREE.Vector3(0, 1.2, 0));
    window.animateManaGainFromWorld(pos, owner);
    window.gameState.board[row][col].unit = null;
  }

  const targetPos = window.tileMeshes[row][col].position.clone();
  targetPos.y = window.tileMeshes[row][col].position.y + 0.28;

  gsap.to(card.position, {
    x: targetPos.x,
    y: targetPos.y,
    z: targetPos.z,
    duration: 0.5,
    ease: 'power2.inOut',
  });

  gsap.to(card.rotation, {
    x: 0,
    y: (window.facingDeg[direction]) * Math.PI / 180,
    z: 0,
    duration: 0.5,
    onComplete: () => {
      window.updateHand();
      window.updateUnits();
      window.updateUI();
      const hitsNow = window.computeHits(window.gameState, row, col);
      if (hitsNow && hitsNow.length) window.performBattleSequence(row, col, false);
    },
  });

  window.addLog(`${player.name} призывает ${cardData.name} на (${row + 1},${col + 1})`);
  window.__ui?.panels.hideOrientationPanel();
  pendingPlacement = null;
}

// Initialize a new game state and scene
export async function initGame() {
  window.gameState = window.startGame(window.STARTER_FIRESET, window.STARTER_FIRESET);
  window.createBoard();
  window.createMetaObjects();
  window.updateUnits();
  window.updateHand();
  window.updateUI();
  try {
    const b = window.__ui?.banner; const t = window.gameState?.turn;
    const fn = (typeof b?.ensureTurnSplashVisible === 'function') ? b.ensureTurnSplashVisible : b?.forceTurnSplashWithRetry;
    if (fn) await fn.call(b, 2, t);
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
    const tt = window.__ui?.turnTimer.attach('end-turn-btn');
    const online = (typeof NET_ON === 'function') ? NET_ON() : !!(typeof NET_ACTIVE !== 'undefined' && NET_ACTIVE);
    if (online) { tt.stop(); } else { tt.reset(100).start(); }
  } catch {}
  window.addLog('The game has begun! Player 1 goes first.');
  window.addLog('Drag units to the field, use spells by clicking.');
}

// End the current player's turn
export async function endTurn() {
  if (!window.gameState || window.gameState.winner !== null) return;
  if (typeof window.isInputLocked === 'function' && window.isInputLocked()) return;
  try {
    if (typeof window.MY_SEAT === 'number') {
      if (window.gameState.active !== window.MY_SEAT) { window.showNotification("Opponent's turn", 'error'); return; }
    }
  } catch {}
  if (typeof window.isInputLocked === 'function' ? window.isInputLocked() : (window.manaGainActive || window.drawAnimationActive || window.splashActive)) {
    window.showNotification('Wait for animations to complete', 'warning');
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
    const tt = window.__ui?.turnTimer.attach('end-turn-btn');
    const online = (typeof NET_ON === 'function') ? NET_ON() : !!(typeof NET_ACTIVE !== 'undefined' && NET_ACTIVE);
    if (online) { tt.stop(); } else { tt.reset(100).start(); }
  } catch {}
  try {
    const online = (typeof NET_ON === 'function') ? NET_ON() : !!(typeof NET_ACTIVE !== 'undefined' && NET_ACTIVE);
    if (online) {
      try { (window.socket || socket).emit('endTurn'); } catch {}
      window.refreshInputLockUI();
      return;
    }
  } catch {}
  const controlledCells = window.countControlled(window.gameState, window.gameState.active);
  if (controlledCells >= 5) {
    window.gameState.winner = window.gameState.active;
    window.showNotification(`${window.gameState.players[window.gameState.active].name} побеждает!`, 'success');
    return;
  }
  try {
    for (let rr = 0; rr < 3; rr++) for (let cc = 0; cc < 3; cc++) {
      const u = window.gameState.board[rr][cc].unit; if (!u) continue;
      if (typeof u.tempAtkBuff === 'number' && u.tempBuffOwner === window.gameState.active) {
        delete u.tempAtkBuff; delete u.tempBuffOwner;
      }
    }
  } catch {}
  window.gameState.active = window.gameState.active === 0 ? 1 : 0;
  window.gameState.turn += 1;
  try {
    const b = window.__ui?.banner;
    if (typeof b?.ensureTurnSplashVisible === 'function') {
      await b.ensureTurnSplashVisible(3, window.gameState.turn);
    } else if (typeof b?.forceTurnSplashWithRetry === 'function') {
      await b.forceTurnSplashWithRetry(3, window.gameState.turn);
    } else if (typeof window.forceTurnSplashWithRetry === 'function') {
      await window.forceTurnSplashWithRetry(3);
    }
  } catch {}
  const player = window.gameState.players[window.gameState.active];
  const before = player.mana;
  const manaAfter = window.capMana(before + 2);
  const drawnTpl = window.drawOneNoAdd(window.gameState, window.gameState.active);
  try {
    if (!window.PENDING_MANA_ANIM && !window.manaGainActive) {
      window.PENDING_MANA_ANIM = { ownerIndex: window.gameState.active, startIdx: Math.max(0, Math.min(9, before)), endIdx: Math.max(-1, Math.min(9, manaAfter - 1)) };
    }
  } catch {}
  try { if (window.gameState && window.gameState.players && window.gameState.players[window.gameState.active]) { window.gameState.players[window.gameState.active]._beforeMana = before; } } catch {}
  let shouldAnimateDraw = false;
  try {
    const amIActiveNow = (typeof window.MY_SEAT === 'number') ? (window.MY_SEAT === window.gameState.active) : true;
    shouldAnimateDraw = !!(amIActiveNow && drawnTpl);
    if (!shouldAnimateDraw && drawnTpl) {
      try { window.gameState.players[window.gameState.active].hand.push(drawnTpl); } catch {}
    }
  } catch {}
  window.updateHand();
  try { window.schedulePush('endTurn-apply', { force: true }); } catch {}
  resetCardSelection();
  window.updateHand();
  window.updateUnits();
  try { await window.forceTurnSplashWithRetry(2, window.gameState?.turn); } catch {}
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
    const tt = window.__ui?.turnTimer.attach('end-turn-btn');
    const online = (typeof NET_ON === 'function') ? NET_ON() : !!(typeof NET_ACTIVE !== 'undefined' && NET_ACTIVE);
    if (online) { tt.stop(); } else { tt.reset(100).start(); }
  } catch {}
  try {
    if (window.__ui && window.__ui.mana && typeof window.__ui.mana.animateTurnManaGain === 'function') {
      await window.__ui.mana.animateTurnManaGain(window.gameState.active, before, manaAfter, 1500);
    } else {
      console.warn('Module mana animation not available, skipping');
    }
    player.mana = manaAfter;
    if (shouldAnimateDraw) {
      window.pendingDrawCount = 1;
      window.refreshInputLockUI();
      await window.animateDrawnCardToHand(drawnTpl);
      try { window.gameState.players[window.gameState.active].hand.push(drawnTpl); } catch {}
      window.pendingDrawCount = 0; window.updateHand();
    }
  } catch { window.pendingDrawCount = 0; }
  window.addLog(`Ход ${window.gameState.turn}. ${player.name} получает +2 маны и добирает карту.`);
  window.__endTurnInProgress = false;
  window.manaGainActive = false;
  window.refreshInputLockUI();
}

// Cancel pending unit placement and return card to hand
export function cancelPendingPlacement() {
  if (pendingPlacement) {
    try { window.__scene?.interactions.returnCardToHand(pendingPlacement.card); } catch {}
    pendingPlacement = null;
  }
  try { window.__ui?.panels.hideOrientationPanel(); } catch {}
}

const api = {
  initGame,
  endTurn,
  placeUnitWithDirection,
  cancelPendingPlacement,
  resetCardSelection,
  get selectedCard() { return selectedCard; },
  set selectedCard(v) { selectedCard = v; },
  get pendingPlacement() { return pendingPlacement; },
  set pendingPlacement(v) { pendingPlacement = v; },
  get selectedUnit() { return selectedUnit; },
  set selectedUnit(v) { selectedUnit = v; },
  get magicFrom() { return magicFrom; },
  set magicFrom(v) { magicFrom = v; },
  get pendingSpellOrientation() { return pendingSpellOrientation; },
  set pendingSpellOrientation(v) { pendingSpellOrientation = v; },
  get pendingDiscardSelection() { return pendingDiscardSelection; },
  set pendingDiscardSelection(v) { pendingDiscardSelection = v; },
  get pendingRitualBoardMesh() { return pendingRitualBoardMesh; },
  set pendingRitualBoardMesh(v) { pendingRitualBoardMesh = v; },
  get spellDragHandled() { return spellDragHandled; },
  set spellDragHandled(v) { spellDragHandled = v; },
};

try {
  if (typeof window !== 'undefined') {
    window.__ui = window.__ui || {};
    window.__ui.game = api;
    Object.defineProperties(window, {
      selectedCard: { get: () => selectedCard, set: v => { selectedCard = v; } },
      pendingPlacement: { get: () => pendingPlacement, set: v => { pendingPlacement = v; } },
      selectedUnit: { get: () => selectedUnit, set: v => { selectedUnit = v; } },
      magicFrom: { get: () => magicFrom, set: v => { magicFrom = v; } },
      pendingSpellOrientation: { get: () => pendingSpellOrientation, set: v => { pendingSpellOrientation = v; } },
      pendingDiscardSelection: { get: () => pendingDiscardSelection, set: v => { pendingDiscardSelection = v; } },
      pendingRitualBoardMesh: { get: () => pendingRitualBoardMesh, set: v => { pendingRitualBoardMesh = v; } },
      spellDragHandled: { get: () => spellDragHandled, set: v => { spellDragHandled = v; } },
    });
  }
} catch {}

export default api;

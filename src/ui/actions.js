// UI action helpers for rotating units and triggering attacks
// These functions rely on existing globals to minimize coupling.
import { highlightTiles, clearHighlights } from '../scene/highlight.js';
import { enforceHandLimit } from './handLimit.js';
import { refreshPossessionsUI } from './possessions.js';
import {
  canAttack,
  collectUnitActions,
  executeUnitAction,
  applyTurnStartManaEffects,
} from '../core/abilities.js';
import {
  interactionState,
  setPendingUnitAbility,
  getPendingUnitAbility,
  clearPendingUnitAbility,
  setPendingAbilityOrientation,
  getPendingAbilityOrientation,
  clearPendingAbilityOrientation,
  showOracleDeathBuff,
  hasPendingForcedDiscards,
} from '../scene/interactions.js';

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
    const row = unitMesh.userData?.row;
    const col = unitMesh.userData?.col;
    const fieldElement = (typeof row === 'number' && typeof col === 'number')
      ? gameState.board?.[row]?.[col]?.element
      : undefined;
    const cost = typeof window.rotateCost === 'function'
      ? window.rotateCost(tpl, fieldElement, { state: gameState, r: row, c: col, unit: u, owner: u.owner })
      : 0;
    if (gameState.players[gameState.active].mana < cost) {
      window.__ui?.notifications?.show(`${cost} mana is required to rotate`, 'error');
      return;
    }
    gameState.players[gameState.active].mana -= cost;
    window.__ui?.updateUI?.(gameState);
    const turnCW = window.turnCW || {}; const turnCCW = window.turnCCW || {};
    u.facing = dir === 'cw' ? turnCW[u.facing] : turnCCW[u.facing];
    u.lastRotateTurn = gameState.turn;
    const possessionEvents = refreshPossessionsUI(gameState, { addLog: window.addLog });
    window.__units?.updateUnits?.(gameState);
    window.updateUnits?.(gameState);
    if (possessionEvents.possessions?.length || possessionEvents.releases?.length) {
      window.updateUI?.(gameState);
    }
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
    // запрет на повторную атаку и на атаку укреплений
    const tpl = window.CARDS?.[unit.tplId];
    if (!canAttack(tpl)) {
      window.__ui?.notifications?.show('This fortress cannot attack', 'error');
      return;
    }
    // запрет на повторную атаку в пределах одного хода
    if (unit.lastAttackTurn === gameState.turn) {
      window.__ui?.notifications?.show('This unit has already attacked this turn', 'error');
      return;
    }
    const fieldElement = gameState.board?.[r]?.[c]?.element;
    const cost = typeof window.attackCost === 'function'
      ? window.attackCost(tpl, fieldElement, { state: gameState, r, c, unit, owner: unit.owner })
      : 0;
    const iState = window.__interactions?.interactionState;
    const profile = window.resolveAttackProfile
      ? window.resolveAttackProfile(gameState, r, c, tpl)
      : { attacks: tpl?.attacks || [], chooseDir: tpl?.chooseDir, attackType: tpl?.attackType };
    const usesMagic = profile?.attackType === 'MAGIC';
    if (usesMagic) {
      const allowFriendly = !!tpl.friendlyFire;
      const cells = [];
      let hasEnemy = false;
      for (let rr = 0; rr < 3; rr++) {
        for (let cc = 0; cc < 3; cc++) {
          if (rr === r && cc === c) continue; // нельзя бить себя
          const u = gameState.board?.[rr]?.[cc]?.unit;
          if (allowFriendly || (u && u.owner !== unit.owner)) {
            cells.push({ r: rr, c: cc });
          }
          if (u && u.owner !== unit.owner) hasEnemy = true;
        }
      }
      if (!cells.length || (!allowFriendly && !hasEnemy)) {
        window.__ui?.notifications?.show('No available targets for magic attack', 'error');
        return;
      }
      if (gameState.players[gameState.active].mana < cost) {
        window.__ui?.notifications?.show(`${cost} mana is required to attack`, 'error');
        return;
      }
      gameState.players[gameState.active].mana -= cost;
      window.__ui?.updateUI?.(gameState);
      try { window.selectedUnit = null; window.__ui?.panels?.hideUnitActionPanel(); } catch {}
      if (iState) {
        iState.magicFrom = { r, c, cancelMode: 'attack', owner: unit.owner, spentMana: cost };
        highlightTiles(cells);
        // Подсказка игроку о необходимости выбрать цель
        window.__ui?.notifications?.show('Select a target', 'info');
        try { window.__ui?.cancelButton?.refreshCancelButton(); } catch {}
      }
      window.__ui?.log?.add?.(`${tpl.name}: select a target for the magical attack.`);
      return;
    }
    const computeHits = window.computeHits;
    const attacks = Array.isArray(profile?.attacks) ? profile.attacks : (tpl?.attacks || []);
    const needsChoice = !!profile?.chooseDir || attacks.some(a => a.mode === 'ANY');
    const includeEmpty = attacks.some(a => Array.isArray(a.ranges) && a.ranges.length > 1 && !a.mode);
    const hitsAll = typeof computeHits === 'function'
      ? computeHits(gameState, r, c, { union: true, includeEmpty, profile })
      : [];
    const allowFriendly = !!tpl?.friendlyFire;
    const targets = hitsAll.filter(h => {
      const u2 = gameState.board?.[h.r]?.[h.c]?.unit;
      if (!u2) return false;
      if (u2.owner === unit.owner && !allowFriendly) return false;
      return true;
    });
    if (!targets.length) {
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
    if (needsChoice && targets.length > 1) {
      if (iState) {
        iState.pendingAttack = { r, c, cancelMode: 'attack', owner: unit.owner, spentMana: cost, profile };
        highlightTiles(targets);
        try { window.__ui?.cancelButton?.refreshCancelButton(); } catch {}
      }
      window.__ui?.log?.add?.(`${tpl.name}: choose a target for the attack.`);
      window.__ui?.notifications?.show('Select a target', 'info');
      return;
    }
    // если выбор не нужен или доступна единственная цель, атакуем сразу
    let opts = {};
    if (needsChoice && targets.length === 1) {
      const h = targets[0];
      const dr = h.r - r, dc = h.c - c;
      const absDir = dr < 0 ? 'N' : dr > 0 ? 'S' : dc > 0 ? 'E' : 'W';
      const ORDER = ['N', 'E', 'S', 'W'];
      const relDir = ORDER[(ORDER.indexOf(absDir) - ORDER.indexOf(unit.facing) + 4) % 4];
      const dist = Math.max(Math.abs(dr), Math.abs(dc));
      opts = { chosenDir: relDir, profile };
      if (attacks.some(a => a.mode === 'ANY')) {
        opts.rangeChoices = { [relDir]: dist };
      }
    }
    if (typeof window.performBattleSequence === 'function') {
      window.performBattleSequence(r, c, true, opts);
    }
  } catch {}
}

export function performUnitAbility(unitMesh, actionId) {
  try {
    if (!unitMesh || typeof window === 'undefined') return;
    const w = window;
    const isInputLocked = w.isInputLocked || (() => false);
    if (isInputLocked()) return;
    const gameState = w.gameState;
    if (!gameState) return;
    const r = unitMesh.userData?.row;
    const c = unitMesh.userData?.col;
    if (r == null || c == null) return;

    clearPendingUnitAbility();
    clearPendingAbilityOrientation();
    interactionState.pendingDiscardSelection = null;
    w.__ui?.panels?.hidePrompt?.();
    w.__ui?.panels?.hideOrientationPanel?.();
    w.__ui?.cancelButton?.refreshCancelButton?.();

    const actions = collectUnitActions(gameState, r, c);
    unitMesh.userData = unitMesh.userData || {};
    unitMesh.userData.availableActions = actions;

    const action = actions.find(a => a.actionId === actionId);
    if (!action) return;

    const owner = typeof action.owner === 'number'
      ? action.owner
      : unitMesh.userData?.unitData?.owner ?? gameState.active;
    if (owner !== gameState.active) {
      w.showNotification?.('This action can be used only during your turn', 'error');
      return;
    }

    if (!action.available) {
      if (action.unavailableReason) w.showNotification?.(action.unavailableReason, 'error');
      return;
    }

    const player = gameState.players?.[owner];
    if (!player) {
      w.showNotification?.('Player context is unavailable for this action', 'error');
      return;
    }

    if (action.requiresHandSelection) {
      const candidates = action.candidates || [];
      if (!candidates.length) {
        if (action.unavailableReason) w.showNotification?.(action.unavailableReason, 'error');
        return;
      }
      setPendingUnitAbility({ unitMesh, action, owner, r, c, playerRef: player });
      interactionState.pendingDiscardSelection = {
        requiredType: 'UNIT',
        filter: (_, idx) => candidates.some(c => c.handIdx === idx),
        invalidMessage: 'This card cannot be used for the sacrifice',
        onPicked: (handIdx) => {
          const ctx = getPendingUnitAbility();
          if (!ctx) return;
          const currentPlayer = ctx.playerRef || gameState.players?.[ctx.owner];
          const cardTpl = currentPlayer?.hand?.[handIdx];
          if (!cardTpl) {
            w.showNotification?.('Card is no longer available', 'error');
            return;
          }
          ctx.selectedHandIdx = handIdx;
          ctx.selectedTpl = cardTpl;
          setPendingUnitAbility(ctx);
          setPendingAbilityOrientation({
            unitMesh: ctx.unitMesh,
            action: ctx.action,
            handIdx,
            tpl: cardTpl,
            owner: ctx.owner,
            r: ctx.r,
            c: ctx.c,
          });
          interactionState.pendingDiscardSelection = null;
          w.__ui?.panels?.hidePrompt?.();
          w.__ui?.panels?.showOrientationPanel?.();
          w.__ui?.cancelButton?.refreshCancelButton?.();
          w.addLog?.(`${ctx.action.label}: выберите направление для ${cardTpl.name}.`);
        },
      };
      w.__ui?.panels?.showPrompt?.(
        action.prompt || 'Select a card for this action',
        () => {
          interactionState.pendingDiscardSelection = null;
          clearPendingUnitAbility();
          clearPendingAbilityOrientation();
          w.__ui?.panels?.hideOrientationPanel?.();
          w.__ui?.cancelButton?.refreshCancelButton?.();
        },
        true,
      );
      w.addLog?.(`${action.label}: выберите подходящую карту в руке.`);
      w.__ui?.panels?.hideUnitActionPanel?.();
      w.__ui?.cancelButton?.refreshCancelButton?.();
      return;
    }

    const result = executeUnitAction(gameState, action, { uidFn: w.uid });
    if (!result?.ok) {
      const reason = result?.reason || 'Action failed';
      w.showNotification?.(`Ability failed: ${reason}`, 'error');
      return;
    }

    if (unitMesh?.userData) delete unitMesh.userData.availableActions;
    w.__ui?.panels?.hideUnitActionPanel?.();
    w.__ui?.cancelButton?.refreshCancelButton?.();
    clearPendingUnitAbility();
    clearPendingAbilityOrientation();
    interactionState.pendingDiscardSelection = null;
    w.updateHand?.(gameState);
    w.updateUnits?.(gameState);
    w.updateUI?.(gameState);
  } catch (err) {
    console.error('[performUnitAbility]', err);
  }
}

export function confirmUnitAbilityOrientation(context, direction) {
  try {
    if (typeof window === 'undefined') return;
    const w = window;
    const gameState = w.gameState;
    if (!gameState) return;
    const info = context || getPendingAbilityOrientation();
    if (!info || !info.action) return;
    const payload = {
      handIdx: info.handIdx,
      facing: direction,
      uidFn: typeof w.uid === 'function' ? () => w.uid() : undefined,
    };
    const result = executeUnitAction(gameState, info.action, payload);
    if (!result?.ok) {
      const reason = result?.reason || 'Action failed';
      w.showNotification?.(`Ability failed: ${reason}`, 'error');
      clearPendingAbilityOrientation();
      clearPendingUnitAbility();
      interactionState.pendingDiscardSelection = null;
      w.__ui?.cancelButton?.refreshCancelButton?.();
      return;
    }

    const sacrificedName = result.sacrifice?.tplName || 'Существо';
    const replacementName = result.replacement?.tplName || 'существо';
    w.addLog?.(`${sacrificedName} приносится в жертву ради ${replacementName}.`);

    const buffInfo = result.replacement?.buff;
    if (buffInfo && typeof buffInfo.amount === 'number' && buffInfo.amount !== 0) {
      if (buffInfo.amount > 0) {
        w.addLog?.(`${replacementName}: поле усиливает юнита: HP ${buffInfo.before}→${buffInfo.after}.`);
      } else {
        w.addLog?.(`${replacementName}: поле ослабляет юнита: HP ${buffInfo.before}→${buffInfo.after}.`);
      }
    }

    if (result.replacement?.alive === false) {
      const deathReason = result.replacement.deathReason;
      const label = deathReason === 'OFF_ELEMENT'
        ? 'не выдерживает чужой стихии'
        : deathReason === 'ON_ELEMENT'
          ? 'погибает на враждебном поле'
          : 'не выжил при призыве';
      w.addLog?.(`${replacementName} ${label}.`);
    }

    if (result.events?.oracleBuff) {
      const { owner, amount } = result.events.oracleBuff;
      showOracleDeathBuff(owner, amount);
      w.addLog?.(`${replacementName}: союзники получают +${amount} HP.`);
    }

    if (Array.isArray(result.events?.discardLogs) && result.events.discardLogs.length) {
      for (const text of result.events.discardLogs) {
        if (text) w.addLog?.(text);
      }
    }

    if (result.summonEvents?.possessions?.length) {
      for (const ev of result.summonEvents.possessions) {
        const unitTaken = gameState.board?.[ev.r]?.[ev.c]?.unit;
        const tplTaken = unitTaken ? w.CARDS?.[unitTaken.tplId] : null;
        const name = tplTaken?.name || 'Существо';
        w.addLog?.(`${name}: контроль переходит к игроку ${gameState.active + 1}.`);
      }
    }

    if (Array.isArray(result.summonEvents?.heals) && result.summonEvents.heals.length) {
      for (const heal of result.summonEvents.heals) {
        const tplSource = w.CARDS?.[heal?.source?.tplId];
        const sourceName = tplSource?.name || 'Существо';
        const totalHealed = Array.isArray(heal.healed)
          ? heal.healed.reduce((acc, item) => acc + (item?.amount || 0), 0)
          : heal.amount;
        w.addLog?.(`${sourceName}: союзники восстанавливают ${totalHealed} HP.`);
        if (Array.isArray(heal.healed)) {
          for (const healed of heal.healed) {
            if (!healed || !healed.increaseMax) continue;
            const amount = Number.isFinite(healed.amount) ? healed.amount : 0;
            if (amount <= 0) continue;
            const { r: hr, c: hc } = healed;
            if (typeof hr !== 'number' || typeof hc !== 'number') continue;
            w.__fx?.scheduleHpPopup?.(hr, hc, amount, 600);
          }
        }
      }
    }

    if (result.freedonianMana > 0) {
      w.addLog?.(`Фридонийский Странник приносит ${result.freedonianMana} маны.`);
    }

    if (info.unitMesh?.userData) delete info.unitMesh.userData.availableActions;
    clearPendingAbilityOrientation();
    clearPendingUnitAbility();
    interactionState.pendingDiscardSelection = null;
    w.__ui?.panels?.hideOrientationPanel?.();
    w.__ui?.panels?.hidePrompt?.();
    w.__interactions?.clearSelectedUnit?.();
    w.__ui?.panels?.hideUnitActionPanel?.();
    w.__ui?.cancelButton?.refreshCancelButton?.();

    w.updateHand?.(gameState);
    w.updateUnits?.(gameState);
    w.updateUI?.(gameState);
  } catch (err) {
    console.error('[confirmUnitAbilityOrientation]', err);
  }
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
    const forcedPending = hasPendingForcedDiscards();
    if (forcedPending) {
      w.showNotification?.('Нельзя завершить ход до окончания принудительного сброса.', 'error');
      return;
    }
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
    w.refreshInputLockUI?.();
    try {
      if (gameState.players && gameState.players[gameState.active]) {
        gameState.players[gameState.active]._drewThisTurn = false;
      }
    } catch {}
    await enforceHandLimit(gameState.players[gameState.active], 7);
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
      w.showNotification?.(`${gameState.players[gameState.active].name} wins!`, 'success');
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
        if (typeof b.forceTurnSplashWithRetry === 'function') {
          await b.forceTurnSplashWithRetry(3, gameState.turn);
        } else if (typeof b.requestTurnSplash === 'function') {
          await b.requestTurnSplash(gameState.turn);
        } else if (typeof b.queueTurnSplash === 'function') {
          await b.queueTurnSplash(`Turn ${gameState.turn}`);
        }
      } else if (typeof w.forceTurnSplashWithRetry === 'function') {
        await w.forceTurnSplashWithRetry(3, gameState.turn);
      }
    } catch {}

    const player = gameState.players[gameState.active];
    const before = player.mana;
    const capFn = (typeof w.capMana === 'function')
      ? w.capMana
      : ((value) => Math.min(10, value));
    let manaAfter = capFn(before + 2);
    player.mana = manaAfter;
    const manaEffects = applyTurnStartManaEffects(gameState, gameState.active) || { total: 0, entries: [] };
    manaAfter = player.mana;
    let drawnTpl = null;
    try {
      if (typeof w.drawOneNoAdd === 'function' && !player._drewThisTurn) {
        drawnTpl = w.drawOneNoAdd(gameState, gameState.active);
        player._drewThisTurn = true;
      }
    } catch {}

    try {
      if (!w.PENDING_MANA_ANIM && !manaGainActive) {
        w.PENDING_MANA_ANIM = {
          ownerIndex: gameState.active,
          startIdx: Math.max(0, Math.min(9, before)),
          endIdx: Math.max(-1, Math.min(9, manaAfter - 1)),
        };
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
    const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    let manaAnimationPromise = Promise.resolve();
    let drawDelayMs = 0;
    try {
      if (w.__ui && w.__ui.mana && typeof w.__ui.mana.animateTurnManaGain === 'function') {
        const requestedDuration = 900;
        drawDelayMs = Math.max(0, requestedDuration - 1000);
        manaAnimationPromise = w.__ui.mana.animateTurnManaGain(gameState.active, before, manaAfter, requestedDuration)
          .catch(e => { console.error('Mana animation failed:', e); });
      } else {
        console.warn('Module mana animation not available, skipping');
      }
    } catch (e) {
      console.error('Mana animation failed:', e);
    }
    // После получения маны сразу запускаем добор карты без лишней паузы
    w.updateUI?.();
    const runDrawAnimation = async () => {
      try {
        if (shouldAnimateDraw && drawnTpl) {
          if (drawDelayMs > 0) await wait(drawDelayMs);
          w.pendingDrawCount = 1; w.updateHand?.();
          w.refreshInputLockUI?.();
          await w.animateDrawnCardToHand?.(drawnTpl);
          try { gameState.players[gameState.active].hand.push(drawnTpl); } catch {}
          w.pendingDrawCount = 0; w.updateHand?.();
        } else {
          w.pendingDrawCount = 0; w.updateHand?.();
        }
      } catch {
        w.pendingDrawCount = 0;
      }
    };
    await Promise.all([manaAnimationPromise, runDrawAnimation()]);
    player.mana = manaAfter;

    if (Array.isArray(manaEffects.entries) && manaEffects.entries.length) {
      const cards = w.CARDS || {};
      for (const entry of manaEffects.entries) {
        const tpl = cards[entry.tplId];
        const sourceName = tpl?.name || 'Существо';
        const field = entry.fieldElement ? `поле ${entry.fieldElement}` : 'нейтральное поле';
        w.addLog?.(`${sourceName}: дополнительная мана +${entry.amount} (${field}).`);
      }
    }
    const totalGain = Math.max(0, manaAfter - before);
    w.addLog?.(`Ход ${gameState.turn}. ${player.name} получает +${totalGain} маны и добирает карту.`);

    w.__endTurnInProgress = false;
    w.manaGainActive = false;
    w.refreshInputLockUI?.();
  } catch {}
}

const api = {
  rotateUnit,
  performUnitAttack,
  performUnitAbility,
  confirmUnitAbilityOrientation,
  endTurn,
};
try {
  if (typeof window !== 'undefined') {
    window.__ui = window.__ui || {};
    window.__ui.actions = api;
    window.endTurn = endTurn;
  }
} catch {}
export default api;


// UI action helpers: rotate unit, perform unit attack

export function rotateUnit(unitMesh, dir) {
  if (typeof window === 'undefined') return;
  try {
    if (typeof window.isInputLocked === 'function' && window.isInputLocked()) return;
    const gameState = window.gameState;
    if (!gameState || !unitMesh) return;
    const u = unitMesh.userData?.unitData;
    if (!u) return;
    if (u.owner !== gameState.active) {
      window.showNotification?.("You can't rotate the other player's unit", 'error');
      return;
    }
    if (u.lastRotateTurn === gameState.turn) {
      window.showNotification?.('The unit has already rotated in this turn', 'error');
      return;
    }
    const tpl = window.CARDS?.[u.tplId];
    const cost = window.attackCost?.(tpl);
    if (gameState.players[gameState.active].mana < cost) {
      window.showNotification?.(`${cost} mana is required to rotate`, 'error');
      return;
    }
    gameState.players[gameState.active].mana -= cost;
    window.updateUI?.();
    const turnCW = window.turnCW || {};
    const turnCCW = window.turnCCW || {};
    u.facing = dir === 'cw' ? turnCW[u.facing] : turnCCW[u.facing];
    u.lastRotateTurn = gameState.turn;
    window.updateUnits?.();
    window.__ui?.panels.hideUnitActionPanel?.();
  } catch {}
}

export function performUnitAttack(unitMesh) {
  if (typeof window === 'undefined' || !unitMesh) return;
  try {
    if (typeof window.isInputLocked === 'function' && window.isInputLocked()) return;
    const gameState = window.gameState;
    if (!gameState) return;
    const r = unitMesh.userData?.row;
    const c = unitMesh.userData?.col;
    const unit = gameState.board?.[r]?.[c]?.unit;
    if (!unit) return;
    const tpl = window.CARDS?.[unit.tplId];
    const cost = window.attackCost?.(tpl);
    if (tpl?.attackType === 'MAGIC') {
      if (gameState.players[gameState.active].mana < cost) {
        window.showNotification?.(`${cost} mana is required to attack`, 'error');
        return;
      }
      gameState.players[gameState.active].mana -= cost;
      window.updateUI?.();
      window.magicFrom = { r, c };
      window.addLog?.(`${tpl.name}: select a target for the magical attack.`);
      return;
    }
    const hits = window.computeHits?.(gameState, r, c) || [];
    if (!hits.length) {
      window.showNotification?.('No available targets for attack', 'error');
      return;
    }
    if (gameState.players[gameState.active].mana < cost) {
      window.showNotification?.(`${cost} mana is required to attack`, 'error');
      return;
    }
    gameState.players[gameState.active].mana -= cost;
    window.updateUI?.();
    window.__ui?.panels.hideUnitActionPanel?.();
    window.performBattleSequence?.(r, c, true);
  } catch {}
}

const api = { rotateUnit, performUnitAttack };
try {
  if (typeof window !== 'undefined') {
    window.__ui = window.__ui || {};
    window.__ui.actions = api;
  }
} catch {}

export default api;

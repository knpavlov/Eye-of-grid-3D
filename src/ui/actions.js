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

const api = { rotateUnit, performUnitAttack };
try { if (typeof window !== 'undefined') { window.__ui = window.__ui || {}; window.__ui.actions = api; } } catch {}
export default api;

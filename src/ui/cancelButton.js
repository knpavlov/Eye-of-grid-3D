// Кнопка отмены действий при установке карты или выборе цели
import { interactionState, returnCardToHand } from '../scene/interactions.js';
import { clearHighlights } from '../scene/highlight.js';

function refundSummon(row, col) {
  const gs = window.gameState;
  if (!gs) return;
  const cell = gs.board?.[row]?.[col];
  const unit = cell?.unit;
  if (!unit) return;
  const tpl = window.CARDS?.[unit.tplId];
  if (!tpl) return;
  const player = gs.players[unit.owner];
  // возврат маны
  player.mana += tpl.cost;
  // вернуть карту из сброса в руку
  const idx = player.discard.findIndex(c => c.id === tpl.id);
  if (idx >= 0) player.discard.splice(idx, 1);
  player.hand.push(tpl);
  // убрать юнита с поля
  cell.unit = null;
}

export function refreshCancelButton() {
  const btn = document.getElementById('cancel-play-btn');
  if (!btn) return;
  const vis = interactionState.pendingPlacement || interactionState.pendingAttack || interactionState.magicFrom || interactionState.pendingSpellOrientation || interactionState.selectedCard;
  btn.classList.toggle('hidden', !vis);
}

export function setupCancelButton() {
  const btn = document.getElementById('cancel-play-btn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    try {
      if (interactionState.pendingPlacement) {
        returnCardToHand(interactionState.pendingPlacement.card);
        interactionState.pendingPlacement = null;
        window.__ui?.panels?.hideOrientationPanel?.();
      } else if (interactionState.magicFrom || interactionState.pendingAttack) {
        const pos = interactionState.magicFrom || interactionState.pendingAttack;
        refundSummon(pos.r, pos.c);
        interactionState.magicFrom = null;
        interactionState.pendingAttack = null;
        interactionState.autoEndTurnAfterAttack = false;
        window.updateUnits?.();
        window.updateHand?.();
        window.updateUI?.();
      } else if (interactionState.pendingSpellOrientation) {
        interactionState.pendingSpellOrientation = null;
        window.__ui?.panels?.hideOrientationPanel?.();
        interactionState.selectedCard && returnCardToHand(interactionState.selectedCard);
      } else if (interactionState.selectedCard) {
        returnCardToHand(interactionState.selectedCard);
        interactionState.selectedCard = null;
      }
    } catch {}
    clearHighlights();
    refreshCancelButton();
  });
  refreshCancelButton();
}

const api = { setupCancelButton, refreshCancelButton };
try { if (typeof window !== 'undefined') { window.__ui = window.__ui || {}; window.__ui.cancelButton = api; } } catch {}
export default api;

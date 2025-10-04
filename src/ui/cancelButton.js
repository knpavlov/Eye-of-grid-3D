// Кнопка отмены действий при установке карты или выборе цели
import { interactionState, returnCardToHand, undoPendingSummonManaGain } from '../scene/interactions.js';
import { clearHighlights } from '../scene/highlight.js';
import { capMana } from '../core/constants.js';
import { refreshPossessionsUI } from './possessions.js';
import { cancelElementalDominionSelection as cancelDominionRitual } from '../spells/handlers.js';

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
  player.mana = capMana((player.mana || 0) + tpl.cost);
  // вернуть карту из сброса в руку
  const idx = player.discard.findIndex(c => c.id === tpl.id);
  if (idx >= 0) player.discard.splice(idx, 1);
  player.hand.push(tpl);
  // убрать юнита с поля
  cell.unit = null;
  // отменить бонусную ману от способностей призыва
  try { undoPendingSummonManaGain(); } catch {}
  refreshPossessionsUI(gs);
}

function cancelTargetSelection() {
  const gs = window.gameState;
  if (!gs) return;
  const source = interactionState.magicFrom || interactionState.pendingAttack;
  if (!source) return;
  const mode = source.cancelMode || 'attack';
  const r = source.r;
  const c = source.c;
  if (mode === 'summon') {
    refundSummon(r, c);
  } else {
    const owner = (typeof source.owner === 'number')
      ? source.owner
      : gs.board?.[r]?.[c]?.unit?.owner;
    const spent = typeof source.spentMana === 'number' ? source.spentMana : 0;
    if (spent > 0 && owner != null && gs.players?.[owner]) {
      const player = gs.players[owner];
      player.mana = capMana((player.mana || 0) + spent);
    }
    refreshPossessionsUI(gs);
  }
  interactionState.magicFrom = null;
  interactionState.pendingAttack = null;
  interactionState.autoEndTurnAfterAttack = false;
  try { window.__ui?.panels?.hideUnitActionPanel?.(); } catch {}
  window.updateUnits?.();
  window.updateHand?.();
  window.updateUI?.();
}

export function refreshCancelButton() {
  const btn = document.getElementById('cancel-play-btn');
  if (!btn) return;
  const vis = interactionState.pendingPlacement
    || interactionState.pendingAttack
    || interactionState.magicFrom
    || interactionState.pendingSpellOrientation
    || interactionState.pendingSpellFieldExchange
    || interactionState.pendingSpellLapse
    || interactionState.pendingDiscardSelection
    || interactionState.selectedCard;
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
        cancelTargetSelection();
      } else if (interactionState.pendingSpellOrientation) {
        interactionState.pendingSpellOrientation = null;
        window.__ui?.panels?.hideOrientationPanel?.();
        interactionState.selectedCard && returnCardToHand(interactionState.selectedCard);
      } else if (interactionState.pendingSpellFieldExchange) {
        window.__spells?.cancelFieldExchangeSelection?.();
      } else if (interactionState.pendingSpellLapse) {
        window.__spells?.cancelMesmerLapseSelection?.();
        interactionState.pendingSpellLapse = null;
        interactionState.pendingDiscardSelection = null;
      } else if (interactionState.pendingSpellElementalDominion) {
        // Отменяем ритуальные доминионские заклинания через прямой импорт,
        // чтобы не зависеть от наличия window.__spells в рантайме
        try {
          cancelDominionRitual();
        } catch {
          window.__spells?.cancelElementalDominionSelection?.();
        }
        interactionState.pendingDiscardSelection = null;
      } else if (interactionState.pendingDiscardSelection?.onCancel) {
        // Для ритуальных сбросов предусмотрен собственный откат состояния
        try { interactionState.pendingDiscardSelection.onCancel(); } catch {}
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

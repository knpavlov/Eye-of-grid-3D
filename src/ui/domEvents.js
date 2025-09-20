// Навешивание обработчиков UI элементов

import { refreshInputLockUI } from './inputLock.js';

export function attachUIEvents() {
  if (typeof document === 'undefined') return;
  const w = window;

  document.getElementById('end-turn-btn')?.addEventListener('click', () => {
    try { w.__ui?.actions?.endTurn?.(); } catch {}
  });
  refreshInputLockUI();

  document.getElementById('menu-btn')?.addEventListener('click', () => {
    // Открываем главное меню
    try { w.__ui?.mainMenu?.open?.(); } catch {}
  });

  document.getElementById('log-btn')?.addEventListener('click', () => {
    const lp = document.getElementById('log-panel');
    if (!lp) return;
    lp.classList.toggle('hidden');
    try {
      lp.style.top = (document.getElementById('controls').offsetHeight + 40) + 'px';
      if (!lp.classList.contains('hidden')) lp.style.pointerEvents = 'auto';
    } catch {}
  });

  document.getElementById('mana-debug-btn')?.addEventListener('click', () => {
    try { w.__ui?.actions?.grantTestMana?.(10); } catch {}
  });

  document.getElementById('close-log-btn')?.addEventListener('click', () => {
    document.getElementById('log-panel')?.classList.add('hidden');
  });

  document.getElementById('help-btn')?.addEventListener('click', () => {
    document.getElementById('help-panel')?.classList.remove('hidden');
  });
  document.getElementById('close-help-btn')?.addEventListener('click', () => {
    document.getElementById('help-panel')?.classList.add('hidden');
  });

  document.getElementById('cancel-prompt-btn')?.addEventListener('click', () => {
    const prompt = w.activePrompt;
    if (prompt && typeof prompt.onCancel === 'function') {
      try { prompt.onCancel(); } catch {}
    }
    w.__ui?.panels?.hidePrompt?.();
  });

  document.getElementById('cancel-action-btn')?.addEventListener('click', () => {
    w.__interactions?.clearSelectedUnit?.();
    w.__interactions?.clearPendingUnitAbility?.();
    w.__interactions?.clearPendingAbilityOrientation?.();
    if (w.__interactions?.interactionState) {
      w.__interactions.interactionState.pendingDiscardSelection = null;
    }
    w.__ui?.panels?.hidePrompt?.();
    w.__ui?.panels?.hideOrientationPanel?.();
    w.__ui?.panels?.hideUnitActionPanel?.();
    w.__ui?.cancelButton?.refreshCancelButton?.();
  });

  document.getElementById('rotate-cw-btn')?.addEventListener('click', () => {
    const u = w.__interactions?.getSelectedUnit?.();
    if (u) w.__ui?.actions?.rotateUnit?.(u, 'cw');
  });
  document.getElementById('rotate-ccw-btn')?.addEventListener('click', () => {
    const u = w.__interactions?.getSelectedUnit?.();
    if (u) w.__ui?.actions?.rotateUnit?.(u, 'ccw');
  });
  document.getElementById('attack-btn')?.addEventListener('click', () => {
    const u = w.__interactions?.getSelectedUnit?.();
    if (u) w.__ui?.actions?.performUnitAttack?.(u);
  });

  document.querySelectorAll('[data-dir]').forEach(btn => {
    btn.addEventListener('click', () => {
      const direction = btn.getAttribute('data-dir');
      const abilityOrientation = w.__interactions?.getPendingAbilityOrientation?.();
      if (abilityOrientation) {
        w.__ui?.actions?.confirmUnitAbilityOrientation?.(abilityOrientation, direction);
        return;
      }
      const pso = w.__interactions?.getPendingSpellOrientation?.();
      const gameState = w.gameState;
      if (pso) {
        const { spellCardMesh, unitMesh } = pso;
        const idx = spellCardMesh.userData.handIndex;
        const pl = gameState.players[gameState.active];
        const tpl = pl.hand[idx];
        const r = unitMesh.userData.row; const c = unitMesh.userData.col; const u = gameState.board[r][c].unit;
        if (tpl && tpl.id === 'SPELL_BEGUILING_FOG' && u) {
          u.facing = direction;
          w.addLog?.(`${tpl.name}: ${w.CARDS[u.tplId].name} повёрнут в ${direction}.`);
          pl.discard.push(tpl); pl.hand.splice(idx, 1);
          w.__interactions.resetCardSelection(); w.updateHand(); w.updateUnits(); w.updateUI();
        }
        w.__interactions.clearPendingSpellOrientation();
        w.__ui.panels.hideOrientationPanel();
        try { w.__ui.cancelButton.refreshCancelButton(); } catch {}
        return;
      }
      w.__interactions.placeUnitWithDirection(direction);
    });
  });
}

const api = { attachUIEvents };
try { if (typeof window !== 'undefined') window.attachUIEvents = attachUIEvents; } catch {}

export default api;


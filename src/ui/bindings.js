// Привязка DOM-событий к модулям UI и взаимодействия
export function setupUIBindings() {
  try {
    document.getElementById('end-turn-btn')?.addEventListener('click', () => {
      try { window.endTurn?.(); } catch {}
    });
    if (typeof window.refreshInputLockUI === 'function') window.refreshInputLockUI();

    document.getElementById('new-game-btn')?.addEventListener('click', () => location.reload());

    document.getElementById('log-btn')?.addEventListener('click', () => {
      const lp = document.getElementById('log-panel');
      if (!lp) return;
      lp.classList.toggle('hidden');
      lp.style.top = (document.getElementById('controls')?.offsetHeight + 40) + 'px';
      if (!lp.classList.contains('hidden')) lp.style.pointerEvents = 'auto';
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
      try {
        const prompt = window.activePrompt;
        if (prompt && typeof prompt.onCancel === 'function') prompt.onCancel();
      } catch {}
      try { window.__ui?.panels?.hidePrompt(); } catch {}
    });

    document.getElementById('cancel-orient-btn')?.addEventListener('click', () => {
      const pp = window.__interactions?.getPendingPlacement?.();
      if (pp && window.__interactions?.returnCardToHand) {
        window.__interactions.returnCardToHand(pp.card);
      }
      try { window.__ui?.panels?.hideOrientationPanel(); } catch {}
      try { window.__interactions?.clearPendingPlacement?.(); } catch {}
    });

    document.getElementById('cancel-action-btn')?.addEventListener('click', () => {
      try { window.__interactions?.clearSelectedUnit?.(); } catch {}
      try { window.__ui?.panels?.hideUnitActionPanel?.(); } catch {}
    });

    document.getElementById('rotate-cw-btn')?.addEventListener('click', () => {
      const u = window.__interactions?.getSelectedUnit?.();
      if (u) window.__ui?.actions?.rotateUnit?.(u, 'cw');
    });
    document.getElementById('rotate-ccw-btn')?.addEventListener('click', () => {
      const u = window.__interactions?.getSelectedUnit?.();
      if (u) window.__ui?.actions?.rotateUnit?.(u, 'ccw');
    });
    document.getElementById('attack-btn')?.addEventListener('click', () => {
      const u = window.__interactions?.getSelectedUnit?.();
      if (u) window.__ui?.actions?.performUnitAttack?.(u);
    });

    document.querySelectorAll('[data-dir]').forEach(btn => {
      btn.addEventListener('click', () => {
        const direction = btn.getAttribute('data-dir');
        const pso = window.__interactions?.getPendingSpellOrientation?.();
        if (pso) {
          try {
            const { spellCardMesh, unitMesh } = pso;
            const idx = spellCardMesh.userData.handIndex;
            const pl = window.gameState.players[window.gameState.active];
            const tpl = pl.hand[idx];
            const r = unitMesh.userData.row; const c = unitMesh.userData.col;
            const u = window.gameState.board[r][c].unit;
            if (tpl && tpl.id === 'SPELL_BEGUILING_FOG' && u) {
              u.facing = direction;
              window.addLog?.(`${tpl.name}: ${window.CARDS[u.tplId].name} повёрнут в ${direction}.`);
              pl.discard.push(tpl); pl.hand.splice(idx, 1);
              window.__interactions.resetCardSelection();
              window.updateHand?.(); window.updateUnits?.(); window.updateUI?.();
            }
            window.__interactions.clearPendingSpellOrientation();
            window.__ui?.panels?.hideOrientationPanel();
            return;
          } catch {}
        }
        window.__interactions?.placeUnitWithDirection?.(direction);
      });
    });
  } catch {}
}

const api = { setupUIBindings };
try {
  if (typeof window !== 'undefined') {
    window.__ui = window.__ui || {};
    window.__ui.bindings = api;
  }
} catch {}

export default api;

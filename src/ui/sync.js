// Lightweight UI sync for socket events, decoupled from index.html
// Attaches best-effort listeners to refresh UI highlights on turn change/timer

import { capMana } from '../core/constants.js';

let _attached = false;

export function attachSocketUIRefresh() {
  if (_attached) return;
  const tryAttach = () => {
    try {
      const sock = (typeof window !== 'undefined') ? (window.socket || null) : null;
      if (!sock) return false;
      if (_attached) return true;
      // Guard so we don't attach twice across HMR-like reloads
      _attached = true;
      try { if (typeof window !== 'undefined') window.__uiSyncAttached = true; } catch {}
      // On timer ticks, re-run light UI refresh
      const lightRefresh = () => {
        try { if (typeof window.updateIndicator === 'function') window.updateIndicator(); } catch {}
        try { if (typeof window.updateInputLock === 'function') window.updateInputLock(); } catch {}
      };
      
      // Enhanced turn switch handler with better state sync
      const onTurnSwitched = ({ activeSeat } = {}) => {
        console.log('[SYNC] Turn switched event received');

        // Предварительно обновляем локальный стейт, чтобы оппонент сразу увидел +2 маны и заставку хода
        try {
          const gs = (typeof window !== 'undefined' && window.gameState) ? window.gameState : null;
          if (gs && typeof activeSeat === 'number') {
            const prevTurn = Number(gs.turn) || 0;
            gs.active = activeSeat;
            gs.turn = prevTurn + 1;
            const pl = gs.players?.[activeSeat];
            if (pl) {
              const before = Number(pl.mana) || 0;
              pl._beforeMana = before;
              pl.mana = capMana(before + 2);
              try { if (typeof window !== 'undefined') {
                window.PENDING_MANA_ANIM = { ownerIndex: activeSeat, startIdx: Math.max(0, Math.min(9, before)), endIdx: Math.max(-1, Math.min(9, pl.mana - 1)) };
              } } catch {}
              try {
                if (window.__ui && window.__ui.mana && typeof window.__ui.mana.animateTurnManaGain === 'function') {
                  window.__ui.mana.animateTurnManaGain(activeSeat, before, pl.mana, 1500).catch(()=>{});
                }
              } catch {}
            }
          }
        } catch {}

        try { if (typeof window.updateIndicator === 'function') window.updateIndicator(); } catch {}
        try { if (typeof window.updateInputLock === 'function') window.updateInputLock(); } catch {}
        try { if (typeof window.updateUI === 'function') window.updateUI(); } catch {}

        // Then handle turn splash with retry mechanism
        try {
          const turn = (typeof window !== 'undefined' && window.gameState && typeof window.gameState.turn === 'number') ? window.gameState.turn : null;
          if (turn && window.__ui && window.__ui.banner && typeof window.__ui.banner.forceTurnSplashWithRetry === 'function') {
            window.__ui.banner.forceTurnSplashWithRetry(2, turn).catch(e => {
              console.warn('[SYNC] Failed to show turn splash:', e);
            });
          }
        } catch (e) {
          console.warn('[SYNC] Error in turn splash handling:', e);
        }
      };
      
      // Additional handler for general state sync (e.g., when gameState changes)
      const onStateSync = () => {
        console.log('[SYNC] State sync event received');
        try { if (typeof window.updateUI === 'function') window.updateUI(); } catch {}
        try { if (typeof window.updateIndicator === 'function') window.updateIndicator(); } catch {}
        try { if (typeof window.updateInputLock === 'function') window.updateInputLock(); } catch {}
      };
      try { sock.on('turnTimer', lightRefresh); } catch {}
      try { sock.on('turnSwitched', onTurnSwitched); } catch {}
      try { sock.on('gameStateUpdate', onStateSync); } catch {}
      try { sock.on('push', onStateSync); } catch {}
      return true;
    } catch { return false; }
  };
  // Try immediately, then poll briefly until socket is present
  if (!tryAttach()) {
    let n = 0;
    const id = setInterval(() => {
      n += 1; if (tryAttach() || n > 50) { try { clearInterval(id); } catch {} }
    }, 100);
  }
}

export default { attachSocketUIRefresh };

// Lightweight UI sync for socket events, decoupled from index.html
// Attaches best-effort listeners to refresh UI highlights on turn change/timer

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
      const onTurnSwitched = () => {
        console.log('[SYNC] Turn switched event received');
        try { if (typeof window.updateIndicator === 'function') window.updateIndicator(); } catch {}
        try { if (typeof window.updateInputLock === 'function') window.updateInputLock(); } catch {}
        // Do not force a full UI update here; wait for authoritative state
        // This prevents early +2 mana from popping in before turn animation seeds.
        // Then handle turn splash with retry mechanism
        try {
          const turn = (typeof window !== 'undefined' && window.gameState && typeof window.gameState.turn === 'number') ? window.gameState.turn : null;
          if (turn && window.__ui && window.__ui.banner && typeof window.__ui.banner.forceTurnSplashWithRetry === 'function') {
            // Use retry mechanism for better reliability
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

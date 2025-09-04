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
      const onTurnSwitched = async () => {
        console.log('[SYNC] Turn switched event received');
        try { if (typeof window.updateIndicator === 'function') window.updateIndicator(); } catch {}
        try { if (typeof window.updateInputLock === 'function') window.updateInputLock(); } catch {}

        try {
          const gs = (typeof window !== 'undefined') ? window.gameState : null;
          if (gs && Array.isArray(gs.players)) {
            const predictedTurn = (gs.turn || 0) + 1;
            let lastSeen = 0; try { lastSeen = Number(window.__lastTurnSeen) || 0; } catch {}
            if (predictedTurn > lastSeen) {
              const nextActive = gs.active === 0 ? 1 : 0;
              const pl = gs.players[nextActive];
              const before = Number(pl?.mana || 0);
              const after = (typeof window.capMana === 'function') ? window.capMana(before + 2) : (before + 2);
              pl._beforeMana = before;
              pl.mana = after;
              gs.active = nextActive;
              gs.turn = predictedTurn;
              try { window.__lastTurnSeen = predictedTurn; } catch {}

              if (window.__ui && window.__ui.banner && typeof window.__ui.banner.forceTurnSplashWithRetry === 'function') {
                await window.__ui.banner.forceTurnSplashWithRetry(2, gs.turn);
              }
              if (window.__ui && window.__ui.mana && typeof window.__ui.mana.animateTurnManaGain === 'function') {
                await window.__ui.mana.animateTurnManaGain(nextActive, before, after, 1500);
              }
            } else {
              // Turn already processed via state push; ensure splash if missing
              if (window.__ui && window.__ui.banner && typeof window.__ui.banner.forceTurnSplashWithRetry === 'function') {
                try { await window.__ui.banner.forceTurnSplashWithRetry(2, gs.turn); } catch {}
              }
            }
          }
        } catch (e) {
          console.warn('[SYNC] Error in turn switch handling:', e);
        }

        // Final UI refresh after animations
        try { if (typeof window.updateUI === 'function') window.updateUI(); } catch {}
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

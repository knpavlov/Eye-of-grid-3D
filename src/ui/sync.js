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
      // On explicit turn switch, also try to show the splash and resync UI immediately
      const onTurnSwitched = () => {
        try { if (typeof window.updateIndicator === 'function') window.updateIndicator(); } catch {}
        try { if (typeof window.updateInputLock === 'function') window.updateInputLock(); } catch {}
        try {
          const turn = (typeof window !== 'undefined' && window.gameState && typeof window.gameState.turn === 'number') ? window.gameState.turn : null;
          if (turn && window.__ui && window.__ui.banner && typeof window.__ui.banner.requestTurnSplash === 'function') {
            window.__ui.banner.requestTurnSplash(turn);
          }
        } catch {}
        try { if (typeof window.updateUI === 'function') window.updateUI(); } catch {}
      };
      try { sock.on('turnTimer', lightRefresh); } catch {}
      try { sock.on('turnSwitched', onTurnSwitched); } catch {}
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

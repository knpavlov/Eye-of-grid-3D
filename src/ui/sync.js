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
      // On timer ticks and explicit turn switch, re-run light UI refresh
      const lightRefresh = () => {
        try { if (typeof window.updateIndicator === 'function') window.updateIndicator(); } catch {}
        try { if (typeof window.updateInputLock === 'function') window.updateInputLock(); } catch {}
      };
      try { sock.on('turnTimer', lightRefresh); } catch {}
      try { sock.on('turnSwitched', lightRefresh); } catch {}
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

// Input lock utilities extracted from index.html

export function isInputLocked(){
  const splash = (typeof window !== 'undefined' && window.__ui && window.__ui.banner)
    ? !!window.__ui.banner.getState()._splashActive
    : !!window.splashActive;
  return !!window.__endTurnInProgress || !!window.drawAnimationActive || splash || !!window.manaGainActive;
}

export function refreshInputLockUI(){
  try {
    const endBtn = document.getElementById('end-turn-btn');
    if (endBtn) endBtn.disabled = isInputLocked();
  } catch {}
}

const api = { isInputLocked, refreshInputLockUI };
try { if (typeof window !== 'undefined') { window.isInputLocked = isInputLocked; window.refreshInputLockUI = refreshInputLockUI; window.__ui = window.__ui || {}; window.__ui.inputLock = api; } } catch {}
export default api;

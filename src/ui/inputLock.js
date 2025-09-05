let manaGainActive = false;

export function setManaGainActive(v) {
  manaGainActive = !!v;
  refresh();
}

export function isInputLocked() {
  const splash = (typeof window !== 'undefined' && window.__ui && window.__ui.banner)
    ? !!window.__ui.banner.getState()._splashActive : false;
  return (typeof window !== 'undefined' && window.__endTurnInProgress) ||
         (typeof window !== 'undefined' && window.drawAnimationActive) ||
         splash || manaGainActive;
}

export function refresh() {
  try {
    const endBtn = document.getElementById('end-turn-btn');
    if (endBtn) endBtn.disabled = isInputLocked();
  } catch {}
}

const api = { isInputLocked, refresh, setManaGainActive };
try {
  if (typeof window !== 'undefined') {
    window.isInputLocked = isInputLocked;
    window.refreshInputLockUI = refresh;
    window.__ui = window.__ui || {};
    window.__ui.inputLock = api;
  }
} catch {}
export default api;

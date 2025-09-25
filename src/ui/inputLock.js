// Управление блокировкой ввода

export function isInputLocked() {
  const splash = (typeof window !== 'undefined' && window.__ui && window.__ui.banner)
    ? !!window.__ui.banner.getState()._splashActive : false;

  const baseLock = (typeof window !== 'undefined' && window.__endTurnInProgress) ||
    (typeof window !== 'undefined' && window.drawAnimationActive) ||
    splash || (typeof window !== 'undefined' && window.manaGainActive);

  if (typeof window !== 'undefined') {
    const forced = window.__interactions?.interactionState?.pendingDiscardSelection;
    if (forced?.forced) {
      // Принудительный сброс должен работать независимо от статуса активного игрока
      return false;
    }
  }

  return baseLock;
}

export function refreshInputLockUI() {
  try {
    const endBtn = document.getElementById('end-turn-btn');
    if (endBtn) endBtn.disabled = isInputLocked();
  } catch {}
}

const api = { isInputLocked, refreshInputLockUI };
try {
  if (typeof window !== 'undefined') {
    window.isInputLocked = isInputLocked;
    window.refreshInputLockUI = refreshInputLockUI;
  }
} catch {}

export default api;


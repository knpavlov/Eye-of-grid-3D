// Управление блокировкой ввода
import { hasForeignDiscardLock } from './forcedDiscardLock.js';

export function isInputLocked() {
  const splash = (typeof window !== 'undefined' && window.__ui && window.__ui.banner)
    ? !!window.__ui.banner.getState()._splashActive : false;
  const baseLocked = (typeof window !== 'undefined' && window.__endTurnInProgress) ||
         (typeof window !== 'undefined' && window.drawAnimationActive) ||
         splash || (typeof window !== 'undefined' && window.manaGainActive);
  if (baseLocked) return true;

  try {
    if (typeof window === 'undefined') return false;
    const seat = typeof window.MY_SEAT === 'number' ? window.MY_SEAT : null;
    const state = window.gameState;
    return hasForeignDiscardLock(state, seat);
  } catch {
    return false;
  }
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


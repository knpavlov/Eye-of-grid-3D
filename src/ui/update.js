// Centralized UI refresh logic
import { processDiscardQueue } from './discardQueue.js';

export function updateUI(gameState) {
  const state = gameState || (typeof window !== 'undefined' ? window.gameState : null);
  if (!state) return;

  // Avoid updates during splash animations
  if (typeof window !== 'undefined' && window.splashActive && window.__ui && window.__ui.banner) {
    const bannerState = window.__ui.banner.getState();
    if (bannerState._splashActive) {
      setTimeout(() => updateUI(state), 100);
      return;
    }
  }

  const doc = typeof document !== 'undefined' ? document : null;
  if (!doc) return;

  const turnInfo = doc.getElementById('turn-info');
  if (turnInfo) turnInfo.textContent = `Ход: ${state.turn}`;
  try { window.__ui?.summonLock?.render(state.summoningUnlocked); } catch {}

  // Update timer button
  try {
    const btn = doc.getElementById('end-turn-btn');
    if (btn) {
      const fill = btn.querySelector('.time-fill');
      const txt = btn.querySelector('.sec-text');
      if (typeof window !== 'undefined' && typeof window.__turnTimerSeconds === 'number') {
        const s = Math.max(0, Math.min(100, window.__turnTimerSeconds));
        if (txt) txt.textContent = `${s}`;
        const percent = s / 100;
        if (fill) fill.style.top = `${Math.round((1 - percent) * 100)}%`;
      }
    }
  } catch {}

  // Opponent hand count indicator
  try {
    const mySeat = (typeof window !== 'undefined' && typeof window.MY_SEAT === 'number') ? window.MY_SEAT : 0;
    const oppSeat = mySeat === 0 ? 1 : 0;
    const count = state?.players?.[oppSeat]?.hand?.length || 0;
    if (window.__ui && window.__ui.handCount && typeof window.__ui.handCount.render === 'function') {
      window.__ui.handCount.render(count);
    } else {
      const el = doc.getElementById('opponent-hand-count');
      if (el) el.textContent = `Cards: ${count}`;
    }
  } catch {}

  // Active player highlight
  try {
    const leftSide = doc.getElementById('left-side');
    const rightSide = doc.getElementById('right-side');
    const t0 = doc.getElementById('player-title-0');
    const t1 = doc.getElementById('player-title-1');
    if (leftSide && rightSide && t0 && t1) {
      leftSide.querySelectorAll('.overlay-panel').forEach(el => el.classList.remove('active-player-panel'));
      rightSide.querySelectorAll('.overlay-panel').forEach(el => el.classList.remove('active-player-panel'));
      t0.classList.remove('title-pulse');
      t1.classList.remove('title-pulse');
      if (state.active === 0) {
        requestAnimationFrame(() => {
          leftSide.querySelectorAll('.overlay-panel').forEach(el => el.classList.add('active-player-panel'));
          t0.classList.add('title-pulse');
        });
      } else {
        requestAnimationFrame(() => {
          rightSide.querySelectorAll('.overlay-panel').forEach(el => el.classList.add('active-player-panel'));
          t1.classList.add('title-pulse');
        });
      }
    }
  } catch {}

  // Mana panels via module
  try {
    if (window.__ui && window.__ui.mana && typeof window.__ui.mana.renderBars === 'function') {
      window.__ui.mana.renderBars(state);
    } else {
      console.warn('Mana module not available, skipping mana UI update');
    }
  } catch (e) {
    console.error('Error updating mana UI:', e);
  }

  const countControlled = (typeof window !== 'undefined' && window.countControlled) ? window.countControlled : (() => 0);
  const controlA = countControlled(state, 0);
  const controlB = countControlled(state, 1);
  const ci0 = doc.getElementById('control-info-0'); if (ci0) ci0.textContent = `Контроль: ${controlA}`;
  const ci1 = doc.getElementById('control-info-1'); if (ci1) ci1.textContent = `Контроль: ${controlB}`;

  if (controlA >= 5) {
    try { window.__ui && window.__ui.notifications && window.__ui.notifications.show('Player 1 wins!', 'success'); } catch {}
    state.winner = 0;
  } else if (controlB >= 5) {
    try { window.__ui && window.__ui.notifications && window.__ui.notifications.show('Player 2 wins!', 'success'); } catch {}
    state.winner = 1;
  }

  try { processDiscardQueue(state); } catch {}
}

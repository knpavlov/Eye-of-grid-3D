// Простейшие отладочные элементы управления (чистый UI-код)
import { grantManaToAllPlayers } from '../core/mana.js';

let initialized = false;

function isOnline() {
  try {
    if (typeof window.NET_ON === 'function') {
      return !!window.NET_ON();
    }
    return !!window.NET_ACTIVE;
  } catch {
    return false;
  }
}

function isActivePlayer(gameState) {
  try {
    if (typeof window.MY_SEAT === 'number') {
      return gameState?.active === window.MY_SEAT;
    }
  } catch {}
  return true;
}

export function initDebugControls() {
  if (initialized) return;
  if (typeof window === 'undefined') return;

  const setup = () => {
    if (initialized) return;
    const button = document.getElementById('debug-mana-btn');
    if (!button) return;

    const handleClick = () => {
      try {
        const state = window.gameState;
        if (!state) return;
        if (isOnline() && !isActivePlayer(state)) {
          window.showNotification?.('Сейчас ходит оппонент — бонусная мана недоступна.', 'warning');
          return;
        }
        const result = grantManaToAllPlayers(state, 10);
        if (!result.entries.length) {
          window.showNotification?.('Мана уже на максимуме.', 'info');
          return;
        }
        window.addLog?.('DEBUG: оба игрока получают +10 маны.');
        window.updateUI?.(state);
        window.updateUnits?.(state);
        window.updateHand?.(state);
        try {
          window.schedulePush?.('debug-mana', { force: true });
        } catch {}
      } catch (err) {
        console.error('[debugControls] Ошибка применения бонусной маны', err);
      }
    };

    button.addEventListener('click', handleClick);
    initialized = true;
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup, { once: true });
  } else {
    setup();
  }
}

export default { initDebugControls };

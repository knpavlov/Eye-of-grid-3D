// Логика блокировки активного игрока во время чужого принудительного сброса

export const FOREIGN_DISCARD_LOCK_MESSAGE = 'Соперник выбирает карты для сброса…';

function collectActiveDiscardRequests(state) {
  if (!state) return [];
  const queue = Array.isArray(state.pendingDiscards) ? state.pendingDiscards : [];
  return queue.filter(item => item && item.remaining > 0);
}

export function computeForcedDiscardLock(state, seat) {
  const requests = collectActiveDiscardRequests(state);
  if (!requests.length) {
    return { locked: false, message: null };
  }
  if (typeof seat !== 'number') {
    return { locked: false, message: null };
  }

  const hasLocalRequest = requests.some(req => req.target === seat);
  if (hasLocalRequest) {
    return { locked: false, message: null };
  }

  const activeSeat = typeof state?.active === 'number' ? state.active : null;
  if (activeSeat !== seat) {
    return { locked: false, message: null };
  }

  const hasForeignRequest = requests.some(req => req.target !== seat);
  if (!hasForeignRequest) {
    return { locked: false, message: null };
  }

  return { locked: true, message: FOREIGN_DISCARD_LOCK_MESSAGE };
}

export function hasForeignDiscardLock(state, seat) {
  return computeForcedDiscardLock(state, seat).locked;
}

export default {
  FOREIGN_DISCARD_LOCK_MESSAGE,
  computeForcedDiscardLock,
  hasForeignDiscardLock,
};
